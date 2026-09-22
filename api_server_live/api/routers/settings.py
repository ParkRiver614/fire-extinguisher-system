from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime

from core.database import get_db
from core.security import get_current_user, require_role
from models.models import AlertSettings, InspectionSettings, EmergencySettings, VisionSettings
from schemas.schemas import (
    AlertSettingsOut, AlertSettingsUpdate,
    InspectionSettingsOut, InspectionSettingsUpdate,
    EmergencySettingsOut, EmergencySettingsUpdate,
    VisionSettingsOut, VisionSettingsUpdate,
)

router = APIRouter()


def _get_or_create_alert(db: Session) -> AlertSettings:
    row = db.query(AlertSettings).filter(AlertSettings.alert_setting_id == 1).first()
    if not row:
        row = AlertSettings(alert_setting_id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _get_or_create_inspection(db: Session) -> InspectionSettings:
    row = db.query(InspectionSettings).filter(InspectionSettings.inspection_setting_id == 1).first()
    if not row:
        row = InspectionSettings(inspection_setting_id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _get_or_create_emergency(db: Session) -> EmergencySettings:
    row = db.query(EmergencySettings).filter(EmergencySettings.emergency_setting_id == 1).first()
    if not row:
        row = EmergencySettings(emergency_setting_id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _get_or_create_vision(db: Session) -> VisionSettings:
    row = db.query(VisionSettings).filter(VisionSettings.vision_setting_id == 1).first()
    if not row:
        row = VisionSettings(vision_setting_id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


# ── Alert Settings ────────────────────────────────────────────────

@router.get("/alerts", response_model=AlertSettingsOut)
def get_alert_settings(
    _: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_or_create_alert(db)


@router.put("/alerts", response_model=AlertSettingsOut)
def update_alert_settings(
    body: AlertSettingsUpdate,
    _: dict = Depends(require_role("manager")),
    db: Session = Depends(get_db),
):
    row = _get_or_create_alert(db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


# ── Inspection Settings ───────────────────────────────────────────

@router.get("/inspection", response_model=InspectionSettingsOut)
def get_inspection_settings(
    _: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_or_create_inspection(db)


@router.put("/inspection", response_model=InspectionSettingsOut)
def update_inspection_settings(
    body: InspectionSettingsUpdate,
    _: dict = Depends(require_role("manager")),
    db: Session = Depends(get_db),
):
    row = _get_or_create_inspection(db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


# ── Emergency Settings ────────────────────────────────────────────

@router.get("/emergency", response_model=EmergencySettingsOut)
def get_emergency_settings(
    _: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_or_create_emergency(db)


@router.put("/emergency", response_model=EmergencySettingsOut)
def update_emergency_settings(
    body: EmergencySettingsUpdate,
    _: dict = Depends(require_role("manager")),
    db: Session = Depends(get_db),
):
    row = _get_or_create_emergency(db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


# ── Vision Settings ────────────────────────────────────────────────

@router.get("/vision", response_model=VisionSettingsOut)
def get_vision_settings(
    _: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_or_create_vision(db)


@router.put("/vision", response_model=VisionSettingsOut)
def update_vision_settings(
    body: VisionSettingsUpdate,
    _: dict = Depends(require_role("manager")),
    db: Session = Depends(get_db),
):
    row = _get_or_create_vision(db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row
