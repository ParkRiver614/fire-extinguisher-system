import asyncio
import json
from typing import AsyncGenerator

class EventBroadcaster:
    """싱글톤 SSE 브로드캐스터 — 모든 연결된 클라이언트에게 이벤트 전송"""

    def __init__(self):
        self._queues: list[asyncio.Queue] = []

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._queues.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        try:
            self._queues.remove(q)
        except ValueError:
            pass

    async def publish(self, data: dict):
        for q in list(self._queues):
            try:
                q.put_nowait(data)
            except asyncio.QueueFull:
                pass

    async def stream(self, q: asyncio.Queue) -> AsyncGenerator[str, None]:
        try:
            while True:
                data = await q.get()
                yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            self.unsubscribe(q)


broadcaster = EventBroadcaster()
