from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import json

from core.database import get_db
from core.security import decode_token, get_current_user
from core.broadcaster import broadcaster
from models.models import EventLog, Alert
from schemas.schemas import EventsResponse, EventOut, AlertOut

router = APIRouter()


def _to_event_out(e: EventLog) -> EventOut:
    return EventOut(
        id=f"EVT-{e.event_log_id:03d}",
        type=e.event_type,
        text=e.title,
        sub=e.description,
        time=e.created_at.strftime("%H:%M"),
        timestamp=e.created_at,
    )


@router.get("", response_model=EventsResponse)
def list_events(
    limit: int = 100,
    _: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    events = (
        db.query(EventLog)
        .order_by(EventLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return EventsResponse(events=[_to_event_out(e) for e in reversed(events)])


@router.get("/stream")
async def sse_stream(
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    # 쿼리 파라미터 토큰 검증
    decode_token(token)

    async def generator():
        # snapshot: 현재 상태 전송
        alerts = db.query(Alert).order_by(Alert.created_at.desc()).limit(50).all()
        events = (
            db.query(EventLog).order_by(EventLog.created_at.desc()).limit(100).all()
        )

        def alert_payload(a: Alert):
            zone = None
            extinguisher_display_id = None
            if a.extinguisher:
                extinguisher_display_id = a.extinguisher.id
                if a.extinguisher.zone:
                    zone = a.extinguisher.zone.zone_name
            alert_type = a.alert_type_rel.alert_type_name if a.alert_type_rel else "Unknown"
            return {
                "id": f"AL-{a.alert_id:03d}",
                "extinguisher_id": a.extinguisher_id,
                "extinguisher_display_id": extinguisher_display_id,
                "zone": zone,
                "type": alert_type,
                "detail": a.detail,
                "status": a.status,
                "created_at": a.created_at.isoformat(),
            }

        snapshot = {
            "type": "snapshot",
            "alerts": [alert_payload(a) for a in alerts],
            "events": [
                {
                    "id": f"EVT-{e.event_log_id:03d}",
                    "type": e.event_type,
                    "text": e.title,
                    "sub": e.description,
                    "time": e.created_at.strftime("%H:%M"),
                    "timestamp": e.created_at.isoformat(),
                }
                for e in reversed(events)
            ],
        }
        yield f"data: {json.dumps(snapshot, ensure_ascii=False)}\n\n"

        # 실시간 이벤트 구독
        q = broadcaster.subscribe()
        async for chunk in broadcaster.stream(q):
            yield chunk

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
