from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import httpx
import asyncio

from core.database import get_db
from core.security import require_role
from models.models import Extinguisher, Zone, EmergencySettings
from schemas.schemas import EmergencyAlertRequest, EmergencyAlertResponse

router = APIRouter()


async def _trigger_device(ip: str, payload: dict) -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(f"http://{ip}/emergency", json=payload)
            return resp.status_code == 200
    except Exception:
        return False


@router.post("/alert", response_model=EmergencyAlertResponse)
async def emergency_alert(
    body: EmergencyAlertRequest,
    _: dict = Depends(require_role("operator")),
    db: Session = Depends(get_db),
):
    if body.fire_level not in ("low", "medium", "high"):
        raise HTTPException(status_code=400, detail="fire_level은 low | medium | high 중 하나여야 합니다.")

    # 비상 대응 설정 조회
    emergency_settings = db.query(EmergencySettings).filter(EmergencySettings.emergency_setting_id == 1).first()

    # 비상 모드가 꺼져 있으면 차단
    if emergency_settings and not emergency_settings.emergency_mode:
        raise HTTPException(
            status_code=403,
            detail="비상 모드가 비활성화되어 있습니다. 설정 > 비상 대응 설정에서 활성화하세요.",
        )

    zone = db.query(Zone).filter(Zone.zone_id == body.zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="해당 구역을 찾을 수 없습니다.")

    extinguishers = (
        db.query(Extinguisher)
        .filter(Extinguisher.zone_id == body.zone_id)
        .all()
    )

    # LED/부저 설정값 (없으면 기본 활성)
    led    = emergency_settings.led_auto_on    if emergency_settings else True
    buzzer = emergency_settings.buzzer_auto_run if emergency_settings else True

    tasks = [
        _trigger_device(e.ip_address, {
            "fire_level": body.fire_level,
            "led":    led,
            "buzzer": buzzer,
        })
        for e in extinguishers
        if e.ip_address
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)
    activated = sum(1 for r in results if r is True)

    return EmergencyAlertResponse(success=True, activated_devices=activated)
