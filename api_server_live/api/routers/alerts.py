from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from datetime import datetime

from core.database import get_db
from core.security import get_current_user, require_role
from core.broadcaster import broadcaster
from models.models import Alert, Extinguisher
from schemas.schemas import AlertsResponse, AlertOut

router = APIRouter()


def _to_alert_out(a: Alert) -> AlertOut:
    zone = None
    extinguisher_display_id = None
    if a.extinguisher:
        extinguisher_display_id = a.extinguisher.id
        if a.extinguisher.zone:
            zone = a.extinguisher.zone.zone_name
    alert_type = a.alert_type_rel.alert_type_name if a.alert_type_rel else "Unknown"
    return AlertOut(
        id=f"AL-{a.alert_id:03d}",
        extinguisher_id=a.extinguisher_id,
        extinguisher_display_id=extinguisher_display_id,
        zone=zone,
        type=alert_type,
        detail=a.detail,
        status=a.status,
        created_at=a.created_at,
    )


@router.get("", response_model=AlertsResponse)
def list_alerts(
    status: str = None,
    _: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Alert).options(
        joinedload(Alert.extinguisher).joinedload(Extinguisher.zone),
        joinedload(Alert.alert_type_rel),
    )
    if status in ("active", "resolved"):
        q = q.filter(Alert.status == status)
    alerts = q.order_by(Alert.created_at.desc()).all()
    return AlertsResponse(alerts=[_to_alert_out(a) for a in alerts])


@router.post("/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    current_user: dict = Depends(require_role("operator")),
    db: Session = Depends(get_db),
):
    # alert_id 형식: "AL-001"
    try:
        raw_id = int(alert_id.split("-")[-1])
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="잘못된 알림 ID 형식입니다.")

    alert = db.query(Alert).filter(Alert.alert_id == raw_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다.")

    sub = current_user.get("sub")
    alert.status = "resolved"
    alert.resolved_by = int(sub) if sub else None
    alert.resolved_at = datetime.utcnow()
    db.commit()

    out = _to_alert_out(alert)
    await broadcaster.publish({
        "type": "alert.resolved",
        "alert": out.model_dump(mode="json"),
    })

    return {"alert": {"id": out.id, "status": out.status}}
