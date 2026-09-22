import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from dotenv import load_dotenv

load_dotenv()  # .env를 환경변수로 로드 — core.* 모듈이 os.getenv로 설정을 읽기 전에 실행돼야 함

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from core.database import Base, engine, SessionLocal
from core.broadcaster import broadcaster
from models import models  # noqa: F401 - register SQLAlchemy models
from models.models import (
    Extinguisher, MaintenanceLog,
    InspectionSettings, EventLog,
    Alert, AlertSettings, AlertType,
)
from routers import (
    admins,
    alerts,
    auth,
    emergency,
    events,
    extinguishers,
    floors,
    map_admin,
    navigation,
    sensors,
    settings,
)

Base.metadata.create_all(bind=engine)


async def _run_inspection_check() -> None:
    """점검 주기/알림/미점검 경고 설정에 따라 이벤트 로그와 알림을 생성한다."""
    db = SessionLocal()
    try:
        cfg = db.query(InspectionSettings).filter(InspectionSettings.inspection_setting_id == 1).first()
        if not cfg:
            return
        if not cfg.inspection_reminder and not cfg.missed_inspection_warning:
            return

        alert_cfg = db.query(AlertSettings).filter(AlertSettings.alert_setting_id == 1).first()
        inspection_alert_enabled = alert_cfg.inspection_schedule_alert if alert_cfg else True

        inspection_alert_type = db.query(AlertType).filter(
            AlertType.alert_type_name == "Inspection"
        ).first()

        cycle_days = cfg.inspection_cycle
        now = datetime.utcnow()
        extinguisher_list = db.query(Extinguisher).all()

        new_alerts = []

        for e in extinguisher_list:
            last_log = (
                db.query(MaintenanceLog)
                .filter(MaintenanceLog.extinguisher_id == e.extinguisher_id)
                .order_by(MaintenanceLog.created_at.desc())
                .first()
            )

            if last_log:
                base_date = last_log.created_at
            elif e.install_date:
                base_date = datetime.combine(e.install_date, datetime.min.time())
            else:
                continue

            days_since = (now - base_date).days
            days_until_due = cycle_days - days_since
            label = e.id or f"extinguisher#{e.extinguisher_id}"

            if cfg.missed_inspection_warning and days_until_due < 0:
                db.add(EventLog(
                    extinguisher_id=e.extinguisher_id,
                    event_type="warning",
                    title="미점검 경고",
                    description=f"{label} · 점검 기한 {abs(days_until_due)}일 초과",
                    created_at=now,
                ))
                if inspection_alert_enabled and inspection_alert_type:
                    alert = Alert(
                        extinguisher_id=e.extinguisher_id,
                        alert_type_id=inspection_alert_type.alert_type_id,
                        detail=f"점검 기한 {abs(days_until_due)}일 초과",
                        status="active",
                        created_at=now,
                    )
                    db.add(alert)
                    new_alerts.append((alert, e, "Inspection"))

            elif cfg.inspection_reminder and 0 <= days_until_due <= 7:
                db.add(EventLog(
                    extinguisher_id=e.extinguisher_id,
                    event_type="info",
                    title="점검 예정 알림",
                    description=f"{label} · {days_until_due}일 후 점검 예정",
                    created_at=now,
                ))
                if inspection_alert_enabled and inspection_alert_type:
                    alert = Alert(
                        extinguisher_id=e.extinguisher_id,
                        alert_type_id=inspection_alert_type.alert_type_id,
                        detail=f"{days_until_due}일 후 점검 예정",
                        status="active",
                        created_at=now,
                    )
                    db.add(alert)
                    new_alerts.append((alert, e, "Inspection"))

        db.flush()
        db.commit()

        for alert, e, type_name in new_alerts:
            db.refresh(alert)
            await broadcaster.publish({
                "type": "alert.created",
                "alert": {
                    "id":                       f"AL-{alert.alert_id:03d}",
                    "extinguisher_id":          alert.extinguisher_id,
                    "extinguisher_display_id":  e.id,
                    "zone":                     e.zone.zone_name if e.zone else "",
                    "type":                     type_name,
                    "detail":                   alert.detail,
                    "status":                   alert.status,
                    "created_at":               alert.created_at.isoformat(),
                },
            })

    except Exception:
        db.rollback()
    finally:
        db.close()


async def _inspection_scheduler() -> None:
    """매일 09:00 UTC에 점검 체크를 실행한다."""
    while True:
        now = datetime.utcnow()
        next_run = now.replace(hour=9, minute=0, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        await asyncio.sleep((next_run - now).total_seconds())
        try:
            await _run_inspection_check()
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_inspection_scheduler())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="FireGuard API", version="1.0.0", lifespan=lifespan)

# 허용할 관리자 웹 출처. 배포 환경마다 다르므로 CORS_ALLOW_ORIGINS에 콤마로 구분해 넣는다.
# (예: CORS_ALLOW_ORIGINS=http://10.0.0.5:8006,https://fas.example.com)
# allow_origins=["*"] + allow_credentials=True 조합은 Starlette이 요청 Origin을 그대로
# 되돌려주기 때문에, 아무 사이트나 이 API에 인증정보를 실어 요청할 수 있게 된다.
_cors_origins = [o.strip() for o in os.environ.get("CORS_ALLOW_ORIGINS", "").split(",") if o.strip()]
if not _cors_origins:
    # 개발용 기본값. 운영에서는 반드시 CORS_ALLOW_ORIGINS를 설정할 것.
    _cors_origins = ["http://localhost:8006", "http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,          prefix="/api/auth",          tags=["auth"])
app.include_router(floors.router,        prefix="/api/floors",        tags=["floors"])
app.include_router(extinguishers.router, prefix="/api/extinguishers", tags=["extinguishers"])
app.include_router(extinguishers.router, prefix="/api/devices",       tags=["devices"])
app.include_router(sensors.router,       prefix="/api/sensors",       tags=["sensors"])
app.include_router(alerts.router,        prefix="/api/alerts",        tags=["alerts"])
app.include_router(events.router,        prefix="/api/events",        tags=["events"])
app.include_router(admins.router,        prefix="/api/admins",        tags=["admins"])
app.include_router(map_admin.router,     prefix="/api/admin",         tags=["map-admin"])
app.include_router(navigation.router,    prefix="/api",               tags=["navigation"])
app.include_router(emergency.router,     prefix="/api/emergency",     tags=["emergency"])
app.include_router(settings.router,      prefix="/api/settings",      tags=["settings"])


_floor_images_dir = os.path.join(os.path.dirname(__file__), "uploads", "floor_images")
os.makedirs(_floor_images_dir, exist_ok=True)
app.mount("/static/floor-images", StaticFiles(directory=_floor_images_dir), name="floor-images")

_vision_snapshots_dir = os.path.join(os.path.dirname(__file__), "uploads", "vision_snapshots")
os.makedirs(_vision_snapshots_dir, exist_ok=True)
app.mount("/static/vision-snapshots", StaticFiles(directory=_vision_snapshots_dir), name="vision-snapshots")


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}
