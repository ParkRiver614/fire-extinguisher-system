import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image
from sqlalchemy.orm import Session, joinedload

from core.database import get_db
from core.security import get_current_user, require_role
from core.uploads import save_validated_image
from models.models import Extinguisher, Floor, FloorEdge, FloorNode, Zone
from schemas.schemas import (
    FloorCreate,
    FloorDetailOut,
    FloorImageOut,
    FloorListResponse,
    FloorMapEdgeOut,
    FloorMapNodeOut,
    FloorMapResponse,
    FloorUpdate,
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "floor_images")
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter()


def _find_floor(db: Session, floor: str) -> Floor | None:
    query = db.query(Floor)
    if floor.isdigit():
        return query.filter(Floor.floor_id == int(floor)).first()
    return query.filter(Floor.floor_name == floor).first()


def _load_floor_with_zones(db: Session, floor_id: int) -> Floor:
    return (
        db.query(Floor)
        .options(joinedload(Floor.zones))
        .filter(Floor.floor_id == floor_id)
        .first()
    )


@router.get("", response_model=FloorListResponse)
def list_floors(
    _: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    floors = db.query(Floor).order_by(Floor.level, Floor.floor_id).all()
    return FloorListResponse(floors=[f.floor_name for f in floors])


@router.get("/detail", response_model=list[FloorDetailOut])
def list_floors_detail(
    _: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Floor)
        .options(joinedload(Floor.zones))
        .order_by(Floor.level, Floor.floor_id)
        .all()
    )


@router.post("", response_model=FloorDetailOut, status_code=201)
def create_floor(
    body: FloorCreate,
    _: dict = Depends(require_role("manager")),
    db: Session = Depends(get_db),
):
    floor = Floor(
        floor_name=body.floor_name,
        floor_label=body.floor_label or body.floor_name,
        level=body.level,
        hydrant_positions=body.hydrant_positions,
    )
    db.add(floor)
    db.flush()
    for name in body.zone_names:
        n = name.strip()
        if n:
            db.add(Zone(zone_name=n, floor_id=floor.floor_id))
    db.commit()
    return _load_floor_with_zones(db, floor.floor_id)


@router.put("/{floor_id}", response_model=FloorDetailOut)
def update_floor(
    floor_id: int,
    body: FloorUpdate,
    _: dict = Depends(require_role("manager")),
    db: Session = Depends(get_db),
):
    floor = db.query(Floor).filter(Floor.floor_id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="층을 찾을 수 없습니다.")
    if body.floor_name is not None:
        floor.floor_name = body.floor_name
    if body.floor_label is not None:
        floor.floor_label = body.floor_label
    if body.level is not None:
        floor.level = body.level
    if body.zone_names is not None:
        existing_zones = db.query(Zone).filter(Zone.floor_id == floor_id).all()
        existing_by_name = {z.zone_name: z for z in existing_zones}
        new_names = {n.strip() for n in body.zone_names if n.strip()}

        for name, zone in existing_by_name.items():
            if name not in new_names:
                db.query(Extinguisher).filter(Extinguisher.zone_id == zone.zone_id).update(
                    {"zone_id": None}
                )
                db.query(FloorNode).filter(FloorNode.zone_id == zone.zone_id).update(
                    {"zone_id": None}
                )
                db.delete(zone)

        for name in new_names:
            if name not in existing_by_name:
                db.add(Zone(zone_name=name, floor_id=floor_id))
    if body.hydrant_positions is not None:
        floor.hydrant_positions = body.hydrant_positions
    db.commit()
    return _load_floor_with_zones(db, floor_id)


@router.delete("/{floor_id}", status_code=204)
def delete_floor(
    floor_id: int,
    _: dict = Depends(require_role("manager")),
    db: Session = Depends(get_db),
):
    floor = db.query(Floor).filter(Floor.floor_id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="층을 찾을 수 없습니다.")
    db.query(Zone).filter(Zone.floor_id == floor_id).delete()
    db.delete(floor)
    db.commit()


@router.post("/{floor_id}/image", response_model=FloorImageOut)
async def upload_floor_image(
    floor_id: int,
    file: UploadFile = File(...),
    _: dict = Depends(require_role("manager")),
    db: Session = Depends(get_db),
):
    floor = db.query(Floor).filter(Floor.floor_id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="층을 찾을 수 없습니다.")

    data = await file.read()
    filename = save_validated_image(data, UPLOAD_DIR, f"floor_{floor_id}")
    filepath = os.path.join(UPLOAD_DIR, filename)

    # 기존 이미지 파일 삭제
    if floor.image_key:
        old_path = os.path.join(UPLOAD_DIR, floor.image_key)
        if os.path.exists(old_path) and old_path != filepath:
            os.remove(old_path)

    # 이미지 비율 자동 계산 (height / width)
    with Image.open(filepath) as img:
        w, h = img.size
        ratio = h / w if w else 1.0

    floor.image_key = filename
    floor.image_ratio = ratio
    db.commit()

    return FloorImageOut(
        image_key=filename,
        image_url=f"/static/floor-images/{filename}",
        image_ratio=ratio,
    )


@router.delete("/{floor_id}/image", status_code=204)
def delete_floor_image(
    floor_id: int,
    _: dict = Depends(require_role("manager")),
    db: Session = Depends(get_db),
):
    floor = db.query(Floor).filter(Floor.floor_id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="층을 찾을 수 없습니다.")

    if floor.image_key:
        old_path = os.path.join(UPLOAD_DIR, floor.image_key)
        if os.path.exists(old_path):
            os.remove(old_path)
        floor.image_key = None
        floor.image_ratio = None
        db.commit()


@router.get("/{floor}/map", response_model=FloorMapResponse)
def get_floor_map(floor: str, db: Session = Depends(get_db)):
    floor_row = _find_floor(db, floor)
    if not floor_row:
        raise HTTPException(status_code=404, detail=f"Floor '{floor}' not found")

    nodes = (
        db.query(FloorNode)
        .filter(FloorNode.floor_id == floor_row.floor_id)
        .order_by(FloorNode.floor_node_id)
        .all()
    )
    edges = (
        db.query(FloorEdge)
        .filter(FloorEdge.floor_id == floor_row.floor_id)
        .order_by(FloorEdge.edge_id)
        .all()
    )
    extinguisher_node_ids = {
        str(e.node_id)
        for e in db.query(Extinguisher)
        .join(FloorNode, Extinguisher.node_id == FloorNode.floor_node_id)
        .filter(FloorNode.floor_id == floor_row.floor_id)
        .all()
        if e.node_id is not None
    }

    return FloorMapResponse(
        floor=floor_row.floor_name,
        imageRatio=floor_row.image_ratio,
        nodes=[
            FloorMapNodeOut(
                id=str(n.floor_node_id),
                x=n.x,
                y=n.y,
                type=n.node_type,
            )
            for n in nodes
        ],
        edges=[
            FloorMapEdgeOut(
                **{"from": str(e.from_node_id), "to": str(e.to_node_id), "weight": e.weight}
            )
            for e in edges
        ],
        exitNodeIds=[str(n.floor_node_id) for n in nodes if n.node_type == "exit"],
        extinguisherNodeIds=sorted(extinguisher_node_ids),
    )
