from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from fastapi import Depends

from core.database import get_db
from models.models import Floor, FloorNode, FloorEdge, Extinguisher
from schemas.schemas import MapResponse, RouteRequest, RouteResponse, NodeOut
from services.pathfinding import dijkstra, BLOCKED_STATUSES

router = APIRouter()


@router.get("/floors/{floor}/map", response_model=MapResponse)
def get_floor_map(floor: str, db: Session = Depends(get_db)):
    floor_obj = db.query(Floor).filter(Floor.floor_name == floor).first()
    if not floor_obj:
        raise HTTPException(status_code=404, detail="해당 층 정보를 찾을 수 없습니다.")

    nodes = (
        db.query(FloorNode)
        .filter(FloorNode.floor_id == floor_obj.floor_id)
        .all()
    )
    edges = (
        db.query(FloorEdge)
        .filter(FloorEdge.floor_id == floor_obj.floor_id)
        .all()
    )

    # 해당 층 소화기 노드 상태 맵
    extinguishers = (
        db.query(Extinguisher)
        .join(FloorNode, Extinguisher.node_id == FloorNode.floor_node_id)
        .filter(FloorNode.floor_id == floor_obj.floor_id)
        .all()
    )
    ext_node_map = {str(e.node_id): e.status for e in extinguishers}

    return MapResponse(
        nodes=[
            NodeOut(
                floor_node_id=str(n.floor_node_id),
                x=n.x,
                y=n.y,
                node_type=n.node_type,
                is_blocked=n.is_blocked,
            )
            for n in nodes
        ],
        edges=[
            {"from": str(e.from_node_id), "to": str(e.to_node_id), "weight": e.weight}
            for e in edges
        ],
        extinguisher_nodes=ext_node_map,
    )


@router.post("/navigation/route", response_model=RouteResponse)
def calculate_route(body: RouteRequest, db: Session = Depends(get_db)):
    floor_obj = db.query(Floor).filter(Floor.floor_name == body.floor).first()
    if not floor_obj:
        raise HTTPException(status_code=404, detail="해당 층 정보를 찾을 수 없습니다.")

    nodes = db.query(FloorNode).filter(FloorNode.floor_id == floor_obj.floor_id).all()
    edges = db.query(FloorEdge).filter(FloorEdge.floor_id == floor_obj.floor_id).all()

    extinguishers = (
        db.query(Extinguisher)
        .join(FloorNode, Extinguisher.node_id == FloorNode.floor_node_id)
        .filter(FloorNode.floor_id == floor_obj.floor_id)
        .all()
    )

    # 통행 불가 노드 집합
    blocked: set[str] = {str(n.floor_node_id) for n in nodes if n.is_blocked}

    # 목적지 후보 결정
    if body.route_type == "extinguisher":
        targets = [
            str(e.node_id)
            for e in extinguishers
            if e.node_id and e.status not in BLOCKED_STATUSES
        ]
    else:  # exit
        targets = [
            str(n.floor_node_id)
            for n in nodes
            if n.node_type == "exit" and not n.is_blocked
        ]

    if not targets:
        raise HTTPException(status_code=404, detail="도달 가능한 목적지가 없습니다.")

    node_dicts = [{"floor_node_id": n.floor_node_id, "is_blocked": n.is_blocked} for n in nodes]
    edge_dicts = [
        {"from": e.from_node_id, "to": e.to_node_id, "weight": e.weight, "is_bidirectional": e.is_bidirectional}
        for e in edges
    ]

    result = dijkstra(
        nodes=node_dicts,
        edges=edge_dicts,
        start=body.current_user_node,
        targets=targets,
        blocked_nodes=blocked,
    )

    if result is None:
        raise HTTPException(status_code=404, detail="도달 가능한 목적지가 없습니다.")

    target_node, route = result
    return RouteResponse(
        route_type=body.route_type,
        target_node=target_node,
        route=route,
    )
