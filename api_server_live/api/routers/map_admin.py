from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import get_current_user, require_role
from models.models import Floor, FloorEdge, FloorNode
from schemas.schemas import (
    EdgeCreate,
    NodeCreate,
    NodeUpdate,
    PixelConvertRequest,
    PixelConvertResponse,
)

router = APIRouter()


def _find_floor(db: Session, floor: str) -> Floor | None:
    query = db.query(Floor)
    if floor.isdigit():
        return query.filter(Floor.floor_id == int(floor)).first()
    return query.filter(Floor.floor_name == floor).first()


@router.post("/convert/pixel-to-percent", response_model=PixelConvertResponse)
def convert_pixel_to_percent(
    body: PixelConvertRequest,
    _: dict = Depends(get_current_user),
):
    return PixelConvertResponse(
        x_percent=round(body.pixel_x / body.image_width * 100, 4),
        y_percent=round(body.pixel_y / body.image_height * 100, 4),
    )


@router.get("/floors/{floor}/nodes")
def list_nodes(
    floor: str,
    _: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    floor_row = _find_floor(db, floor)
    if not floor_row:
        raise HTTPException(status_code=404, detail=f"Floor '{floor}' not found")

    rows = db.query(FloorNode).filter(FloorNode.floor_id == floor_row.floor_id).all()
    return [
        {
            "id": r.floor_node_id,
            "floor_node_id": str(r.floor_node_id),
            "x": r.x,
            "y": r.y,
            "type": r.node_type,
            "is_blocked": r.is_blocked,
        }
        for r in rows
    ]


@router.post("/floors/{floor}/nodes", status_code=201)
def create_node(
    floor: str,
    body: NodeCreate,
    _: dict = Depends(require_role("manager")),
    db: Session = Depends(get_db),
):
    floor_row = _find_floor(db, floor)
    if not floor_row:
        raise HTTPException(status_code=404, detail=f"Floor '{floor}' not found")

    node_id = int(body.floor_node_id)
    existing = db.query(FloorNode).filter(FloorNode.floor_node_id == node_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Node ID already exists")

    node = FloorNode(
        floor_node_id=node_id,
        floor_id=floor_row.floor_id,
        zone_id=body.zone_id,
        x=body.x_coord,
        y=body.y_coord,
        node_type=body.node_type,
    )
    db.add(node)
    db.commit()
    db.refresh(node)
    return {"id": node.floor_node_id, "floor_node_id": str(node.floor_node_id)}


@router.patch("/floors/{floor}/nodes/{node_id}")
def update_node(
    floor: str,
    node_id: int,
    body: NodeUpdate,
    _: dict = Depends(require_role("manager")),
    db: Session = Depends(get_db),
):
    floor_row = _find_floor(db, floor)
    if not floor_row:
        raise HTTPException(status_code=404, detail=f"Floor '{floor}' not found")

    node = (
        db.query(FloorNode)
        .filter(FloorNode.floor_id == floor_row.floor_id, FloorNode.floor_node_id == node_id)
        .first()
    )
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    if body.x_coord is not None:
        node.x = body.x_coord
    if body.y_coord is not None:
        node.y = body.y_coord
    if body.node_type is not None:
        node.node_type = body.node_type
    if body.is_blocked is not None:
        node.is_blocked = body.is_blocked
    if body.zone_id is not None:
        node.zone_id = body.zone_id

    db.commit()
    return {"id": node.floor_node_id, "floor_node_id": str(node.floor_node_id)}