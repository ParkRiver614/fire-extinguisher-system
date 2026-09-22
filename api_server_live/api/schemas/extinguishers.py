from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from datetime import datetime

from core.database import get_db
from core.security import get_current_user
from models.models import (
    Extinguisher, FloorNode, Zone, Floor, Building,
    SensorLog, SensorData, MaintenanceLog, Admin,
)
from schemas.schemas import (
    ExtinguisherCreate, ExtinguisherUpdate,
    ExtinguisherView, MaintenanceLogCreate, MaintenanceLogOut, MaintenanceLogUpdate,
)
from services.extinguisher_view import build_extinguisher_view

router = APIRouter()


def _load_extinguisher(db: Session, ext_id: int) -> Extinguisher:
    e = (
        db.query(Extinguisher)
        .options(
            joinedload(Extinguisher.model),
            joinedload(Extinguisher.node).joinedload(FloorNode.floor).joinedload(Floor.building),
            joinedload(Extinguisher.zone).joinedload(Zone.floor).joinedload(Floor.building),
            joinedload(Extinguisher.admin),
            joinedload(Extinguisher.sensor_logs).joinedload(SensorLog.sensor_data).joinedload(SensorData.sensor_type),
            joinedload(Extinguisher.maintenance_logs).joinedload(MaintenanceLog.admin),
            joinedload(Extinguisher.vision_logs),
        )
        .filter(Extinguisher.extinguisher_id == ext_id)
        .first()
    )
    if not e:
        raise HTTPException(status_code=404, detail="소화기를 찾을 수 없습니다.")
    return e


@router.get("", response_model=list[ExtinguisherView])
def list_extinguishers(
    _: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    extinguishers = (
        db.query(Extinguisher)
        .options(
            joinedload(Extinguisher.model),
            joinedload(Extinguisher.node).joinedload(FloorNode.floor).joinedload(Floor.building),
            joinedload(Extinguisher.zone).joinedload(Zone.floor).joinedload(Floor.building),
            joinedload(Extinguisher.admin),
            joinedload(Extinguisher.sensor_logs).joinedload(SensorLog.sensor_data).joinedload(SensorData.sensor_type),
            joinedload(Extinguisher.maintenance_logs).joinedload(MaintenanceLog.admin),
            joinedload(Extinguisher.vision_logs),
        )
        .all()
    )
    return [build_extinguisher_view(e) for e in extinguishers]


@router.get("/{ext_id}", response_model=ExtinguisherView)
def get_extinguisher(
    ext_id: int,
    _: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return build_extinguisher_view(_load_extinguisher(db, ext_id))


@router.post("", response_model=ExtinguisherView, status_code=201)
def create_extinguisher(
    body: ExtinguisherCreate,
    _: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # MAC 주소 중복 확인
    if db.query(Extinguisher).filter(Extinguisher.mac_address == body.mac_address).first():
        raise HTTPException(status_code=409, detail="이미 등록된 MAC 주소입니다.")

    total = db.query(Extinguisher).count()
    new_id = body.id.strip() if body.id and body.id.strip() else f"FE-{total + 1:03d}"

    # zone_id로 floor_id 추출 (노드 자동 생성에 필요)
    node_id = body.node_id
    zone = None
    if body.zone_id:
        zone = db.query(Zone).filter(Zone.zone_id == body.zone_id).first()

    # x/y 좌표가 있으면 FloorNode 자동 생성
    if node_id is None and body.x_coord is not None and body.y_coord is not None and zone:
        node = FloorNode(
            floor_id=zone.floor_id,
            zone_id=zone.zone_id,
            x=body.x_coord,
            y=body.y_coord,
            node_type="normal",
        )
        db.add(node)
        db.flush()
        node_id = node.floor_node_id

    e = Extinguisher(
        id=new_id,
        node_id=node_id,
        zone_id=body.zone_id,
        model_id=body.model_id,
        mac_address=body.mac_address,
        ip_address=body.ip_address,
        manufacture_date=body.manufacture_date,
        install_date=body.install_date,
        expiry_date=body.expiry_date,
        admin_id=body.admin_id,
        status="normal",
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return build_extinguisher_view(_load_extinguisher(db, e.extinguisher_id))


@router.put("/{ext_id}", response_model=ExtinguisherView)
def update_extinguisher(
    ext_id: int,
    body: ExtinguisherUpdate,
    _: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    e = db.query(Extinguisher).filter(Extinguisher.extinguisher_id == ext_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="소화기를 찾을 수 없습니다.")

    for field, value in body.model_dump(exclude_unset=True).items():
        if field in ("x_coord", "y_coord"):
            continue  # 노드 좌표는 FloorNode에서 관리
        setattr(e, field, value)

    # 좌표 업데이트
    if body.x_coord is not None or body.y_coord is not None:
        if e.node_id:
            node = db.query(FloorNode).filter(FloorNode.floor_node_id == e.node_id).first()
            if node:
                if body.x_coord is not None:
                    node.x = body.x_coord
                if body.y_coord is not None:
                    node.y = body.y_coord
        else:
            # FloorNode가 없으면 새로 생성 후 연결
            if body.x_coord is not None and body.y_coord is not None:
                zone = db.query(Zone).filter(Zone.zone_id == e.zone_id).first() if e.zone_id else None
                if zone:
                    new_node = FloorNode(
                        floor_id=zone.floor_id,
                        zone_id=zone.zone_id,
                        x=body.x_coord,
                        y=body.y_coord,
                        node_type="normal",
                    )
                    db.add(new_node)
                    db.flush()
                    e.node_id = new_node.floor_node_id

    db.commit()
    return build_extinguisher_view(_load_extinguisher(db, ext_id))


@router.delete("/{ext_id}")
def delete_extinguisher(
    ext_id: int,
    _: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    e = db.query(Extinguisher).filter(Extinguisher.extinguisher_id == ext_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="소화기를 찾을 수 없습니다.")
    db.delete(e)
    db.commit()
    return {"success": True}


@router.post("/{ext_id}/maintenance", response_model=MaintenanceLogOut, status_code=201)
def add_maintenance(
    ext_id: int,
    body: MaintenanceLogCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    e = db.query(Extinguisher).filter(Extinguisher.extinguisher_id == ext_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="소화기를 찾을 수 없습니다.")

    admin_id = body.admin_id if body.admin_id is not None else current_user.get("id")
    admin = db.query(Admin).filter(Admin.admin_id == admin_id).first() if admin_id else None

    log = MaintenanceLog(
        extinguisher_id=ext_id,
        admin_id=admin_id,
        action_taken=body.action_taken,
        created_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    return MaintenanceLogOut(
        maintenance_id=log.maintenance_id,
        extinguisher_id=log.extinguisher_id,
        admin_id=log.admin_id,
        admin_name=admin.admin_name if admin else None,
        action_taken=log.action_taken,
        created_at=log.created_at,
    )


@router.put("/{ext_id}/maintenance/{log_id}", response_model=MaintenanceLogOut)
def update_maintenance(
    ext_id: int,
    log_id: int,
    body: MaintenanceLogUpdate,
    _: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = db.query(MaintenanceLog).filter(
        MaintenanceLog.maintenance_id == log_id,
        MaintenanceLog.extinguisher_id == ext_id,
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="로그를 찾을 수 없습니다.")
    log.action_taken = body.action_taken
    db.commit()
    db.refresh(log)
    admin = db.query(Admin).filter(Admin.admin_id == log.admin_id).first()
    return MaintenanceLogOut(
        maintenance_id=log.maintenance_id,
        extinguisher_id=log.extinguisher_id,
        admin_id=log.admin_id,
        admin_name=admin.admin_name if admin else None,
        action_taken=log.action_taken,
        created_at=log.created_at,
    )


@router.delete("/{ext_id}/maintenance/{log_id}")
def delete_maintenance(
    ext_id: int,
    log_id: int,
    _: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = db.query(MaintenanceLog).filter(
        MaintenanceLog.maintenance_id == log_id,
        MaintenanceLog.extinguisher_id == ext_id,
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="로그를 찾을 수 없습니다.")
    db.delete(log)
    db.commit()
    return {"success": True}
