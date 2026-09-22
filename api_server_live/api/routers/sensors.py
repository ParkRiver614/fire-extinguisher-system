from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from datetime import datetime
import asyncio
import httpx
import os
from urllib.parse import urlparse

from core.database import get_db
from core.broadcaster import broadcaster
from core.security import verify_device_key
from core.uploads import save_validated_image
from models.models import (
    Extinguisher, SensorLog, SensorData, SensorType, EventType,
    VisionLog, Alert, AlertType, EventLog,
    AlertSettings, EmergencySettings, VisionSettings,
    STATUS_NAME_MAP,
)
from schemas.schemas import SensorUpdateRequest
from services.extinguisher_view import _STATUS_TO_FRONTEND

router = APIRouter(dependencies=[Depends(verify_device_key)])

SNAPSHOT_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "vision_snapshots")
os.makedirs(SNAPSHOT_UPLOAD_DIR, exist_ok=True)

# 관리자 웹(별도 origin)이 <img src>에 그대로 사용하므로 절대 URL이어야 함.
# 배포 환경마다 다르므로 반드시 PUBLIC_BASE_URL로 주입할 것 — 특정 서버 주소를 기본값으로
# 박아두면, 다른 환경에 올렸을 때 스냅샷 URL만 조용히 옛 서버를 가리킨다(2026-09-22 AWS에서 겪음).
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000")

STATUS_TO_ALERT_TYPE = {
    "obstacle_detected": "Obstacle",
    "missing":           "Missing",
    "fire_detected":     "Fire",
    "humidity_warning":  "Humidity",
}

STATUS_TO_EVENT_TEXT = {
    "normal":            "정상",
    "obstacle_detected": "장애물 감지",
    "missing":           "이탈/분실 감지",
    "fire_detected":     "화재 감지",
    "humidity_warning":  "습도 경고 감지",
    "offline":           "오프라인 전환",
    "maintenance":       "유지보수 시작",
}

STATUS_TO_EVENT_TYPE = {
    "obstacle_detected": "warning",
    "missing":           "warning",
    "fire_detected":     "error",
    "humidity_warning":  "warning",
    "offline":           "info",
    "maintenance":       "info",
    "normal":            "normal",
}

ALERT_ENABLED_FIELD = {
    "obstacle_detected": "obstacle_alert",
    "missing":           "missing_extinguisher_alert",
    "fire_detected":     "fire_alert",
    "humidity_warning":  "humidity_alert",
}

ALERT_DETAIL = {
    "Obstacle": "소화기 앞 장애물 감지",
    "Missing":  "소화기 이탈/분실 감지",
    "Fire":     "화재/연기 감지",
    "Humidity": "습도 이상 감지",
}


def _get_or_create_sensor_type(db: Session, name: str, unit: str | None) -> SensorType:
    row = db.query(SensorType).filter(SensorType.sensor_type_name == name).first()
    if not row:
        row = SensorType(sensor_type_name=name, unit=unit)
        db.add(row)
        db.flush()
    return row


def _get_or_create_event_type(db: Session, name: str) -> EventType:
    row = db.query(EventType).filter(EventType.event_type_name == name).first()
    if not row:
        row = EventType(event_type_name=name)
        db.add(row)
        db.flush()
    return row


async def _trigger_device(ip: str, payload: dict) -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(f"http://{ip}/emergency", json=payload)
            return resp.status_code == 200
    except Exception:
        return False


@router.get("/vision-interval")
def get_vision_interval(db: Session = Depends(get_db)):
    row = db.query(VisionSettings).filter(VisionSettings.vision_setting_id == 1).first()
    return {"inference_interval_minutes": row.inference_interval_minutes if row else 30}


@router.post("/snapshot")
async def upload_snapshot(
    file: UploadFile = File(...),
    mac_address: str | None = Form(None),
):
    data = await file.read()
    tag = (mac_address or "device").replace(":", "").replace(" ", "")
    filename = save_validated_image(data, SNAPSHOT_UPLOAD_DIR, f"vision_{tag}")

    return {"snapshot_url": f"{PUBLIC_BASE_URL}/static/vision-snapshots/{filename}"}


def _prune_normal_cycle_logs(db: Session, ext_id: int, keep_log_id: int, normal_event_type_id: int) -> None:
    """장치는 관리자가 설정한 비전 주기마다 보고하므로, 아무 일도 없던 "정상" 사이클
    기록이 계속 쌓인다. 화면이 쓰는 건 타입별 최신 센서값과 최신 스냅샷뿐이라
    직전 정상 사이클 기록(스냅샷 파일 포함)은 지우고 최신 것만 남긴다.
    장애물/화재 등 이벤트 사이클 기록은 알림의 근거 자료이므로 건드리지 않는다."""
    old_log_ids = [
        row[0]
        for row in db.query(SensorLog.log_id).filter(
            SensorLog.extinguisher_id == ext_id,
            SensorLog.event_type_id == normal_event_type_id,
            SensorLog.log_id != keep_log_id,
        ).all()
    ]
    if not old_log_ids:
        return

    old_visions = db.query(VisionLog).filter(VisionLog.log_id.in_(old_log_ids)).all()
    for v in old_visions:
        _delete_snapshot_file(v.snapshot_url)

    db.query(VisionLog).filter(VisionLog.log_id.in_(old_log_ids)).delete(synchronize_session=False)
    db.query(SensorData).filter(SensorData.log_id.in_(old_log_ids)).delete(synchronize_session=False)
    db.query(SensorLog).filter(SensorLog.log_id.in_(old_log_ids)).delete(synchronize_session=False)


def _delete_snapshot_file(snapshot_url: str | None) -> None:
    """스냅샷 URL이 이 서버가 저장한 파일을 가리키면 그 파일을 지운다.
    외부 URL이거나 이미 없는 파일이면 조용히 무시한다."""
    if not snapshot_url:
        return
    name = os.path.basename(urlparse(snapshot_url).path)   # 경로 조작 방지: 파일명만 사용
    if not name:
        return
    try:
        os.remove(os.path.join(SNAPSHOT_UPLOAD_DIR, name))
    except OSError:
        pass


@router.post("/update")
async def sensor_update(body: SensorUpdateRequest, db: Session = Depends(get_db)):
    if body.mac_address:
        e = db.query(Extinguisher).filter(Extinguisher.mac_address == body.mac_address).first()
    elif body.extinguisher_id is not None:
        e = db.query(Extinguisher).filter(Extinguisher.extinguisher_id == body.extinguisher_id).first()
    else:
        raise HTTPException(status_code=400, detail="mac_address 또는 extinguisher_id가 필요합니다.")
    if not e:
        raise HTTPException(status_code=404, detail="소화기를 찾을 수 없습니다.")

    # 상태 및 마지막 핑 갱신
    prev_status = e.status          # 이벤트/알림 중복 방지용 (덮어쓰기 전에 보관)
    e.status = body.status
    e.last_ping_at = datetime.utcnow()
    if body.battery_level is not None:
        e.battery_level = body.battery_level
    if body.ip_address is not None:
        e.ip_address = body.ip_address

    # 이벤트 타입 조회 or 생성
    event_type_row = _get_or_create_event_type(db, body.status)

    # 센서 로그 생성 (한 시점의 측정값 묶음)
    sensor_log = SensorLog(
        extinguisher_id=e.extinguisher_id,
        event_type_id=event_type_row.event_type_id,
        created_at=datetime.utcnow(),
    )
    db.add(sensor_log)
    db.flush()

    # 개별 센서값 저장
    if body.sensor_readings:
        for sr in body.sensor_readings:
            sensor_type = _get_or_create_sensor_type(db, sr.sensor_type_name, sr.unit)
            db.add(SensorData(
                log_id=sensor_log.log_id,
                sensor_type_id=sensor_type.sensor_type_id,
                value=sr.value,
            ))

    # 비전 로그 저장 (sensor_log에 연결).
    # 장치는 설정된 비전 주기마다 스냅샷을 올리므로, 판단 결과(body.vision)가
    # 없어도 사진만 있으면 기록해 상세 화면이 항상 최신 사진을 보여주게 한다.
    if body.vision or body.snapshot_url:
        db.add(VisionLog(
            log_id=sensor_log.log_id,
            extinguisher_id=e.extinguisher_id,
            snapshot_url=body.snapshot_url,
            detected_class=body.vision.detected_class if body.vision else None,
            confidence_score=body.vision.confidence_score if body.vision else None,
            model_version=body.vision.model_version if body.vision else None,
            created_at=datetime.utcnow(),
        ))

    # 직전 정상 사이클 기록 정리 (주기 보고로 무한히 쌓이는 것 방지).
    # 스냅샷을 새로 받은 보고에서만 정리한다 — 무게 변화로 즉시 올라온 보고는 사진이 없어서,
    # 여기서 같이 정리하면 직전 비전 사이클이 남긴 최신 스냅샷까지 지워져 상세 화면이 빈다.
    # (사진 없는 보고가 남긴 기록은 다음 비전 사이클이 정리하므로 한 주기 이상 쌓이지 않는다.)
    if body.snapshot_url:
        _prune_normal_cycle_logs(
            db, e.extinguisher_id, sensor_log.log_id,
            _get_or_create_event_type(db, "normal").event_type_id,
        )

    # 주기 보고는 매 사이클 들어오므로, 이벤트 로그는 상태가 "바뀔 때"만 남긴다
    # (같은 상태 반복 시 이벤트 로그가 계속 쌓이는 것을 방지). 반면 알림(Alert)은
    # 미해결 경고 상태(obstacle_detected 등)가 계속되는 동안 매 사이클 계속 쌓이는 걸
    # 의도적으로 허용한다 — 문제가 해결되기 전까지 계속 알림이 누적되어야 함.
    status_changed = body.status != prev_status

    # 알림 생성 (normal이 아닌 경우, 상태 지속 여부와 무관하게 매번)
    alert_settings = db.query(AlertSettings).filter(AlertSettings.alert_setting_id == 1).first()
    alert_obj = None
    alert_type_name = STATUS_TO_ALERT_TYPE.get(body.status)

    if alert_type_name:
        setting_field = ALERT_ENABLED_FIELD.get(body.status)
        alert_enabled = (
            getattr(alert_settings, setting_field, True)
            if alert_settings and setting_field
            else True
        )

        if alert_enabled:
            alert_type_row = db.query(AlertType).filter(
                AlertType.alert_type_name == alert_type_name
            ).first()
            if alert_type_row:
                alert = Alert(
                    extinguisher_id=e.extinguisher_id,
                    log_id=sensor_log.log_id,          # sensor_log에 연결
                    alert_type_id=alert_type_row.alert_type_id,
                    detail=ALERT_DETAIL.get(alert_type_name, ""),
                    status="active",
                    created_at=datetime.utcnow(),
                )
                db.add(alert)
                db.flush()
                alert_obj = alert

    # 화재 감지 시 비상 대응 설정에 따라 장치 자동 제어
    # (화재는 지속 감지되는 동안 매 사이클 재트리거 — 상태 변화 게이팅 대상에서 제외)
    if body.status == "fire_detected" and e.ip_address:
        emergency_settings = db.query(EmergencySettings).filter(EmergencySettings.emergency_setting_id == 1).first()
        if emergency_settings and (emergency_settings.led_auto_on or emergency_settings.buzzer_auto_run):
            asyncio.create_task(_trigger_device(e.ip_address, {
                "fire_level": "high",
                "led":    emergency_settings.led_auto_on,
                "buzzer": emergency_settings.buzzer_auto_run,
            }))

    # UI 이벤트 로그 저장 (상태가 바뀐 경우에만)
    event = None
    if status_changed:
        event_text = STATUS_TO_EVENT_TEXT.get(body.status, body.status)
        event_type = STATUS_TO_EVENT_TYPE.get(body.status, "info")
        sub = f"{e.id} · {e.zone.zone_name if e.zone else ''}"
        event = EventLog(
            extinguisher_id=e.extinguisher_id,
            event_type=event_type,
            title=event_text,
            description=sub,
            created_at=datetime.utcnow(),
        )
        db.add(event)
        db.flush()

    db.commit()
    if alert_obj:
        db.refresh(alert_obj)
    if event:
        db.refresh(event)

    # SSE 브로드캐스트
    if alert_obj:
        await broadcaster.publish({
            "type": "alert.created",
            "alert": {
                "id":                       f"AL-{alert_obj.alert_id:03d}",
                "extinguisher_id":          alert_obj.extinguisher_id,
                "extinguisher_display_id":  e.id,
                "zone":                     e.zone.zone_name if e.zone else "",
                "type":                     alert_type_name,
                "detail":                   alert_obj.detail,
                "status":                   alert_obj.status,
                "created_at":               alert_obj.created_at.isoformat(),
            },
        })

    if event:
        await broadcaster.publish({
            "type": "event.created",
            "event": {
                "id":        f"EVT-{event.event_log_id:03d}",
                "type":      event.event_type,
                "text":      event.title,
                "sub":       event.description,
                "time":      event.created_at.strftime("%H:%M"),
                "timestamp": event.created_at.isoformat(),
                "extinguisher_id": e.extinguisher_id,
                "status":    _STATUS_TO_FRONTEND.get(body.status, body.status),
                # 화면에 그대로 찍히는 한글 라벨. `status`는 missing→error처럼 뭉개지므로
                # 프론트가 이것으로 되돌릴 수 없어, 라벨도 같이 내려준다.
                "status_name": STATUS_NAME_MAP.get(body.status, body.status),
            },
        })

    return {"success": True}
