"""상태가 바뀔 때 SSE 페이로드에 status_name(한글 라벨)이 실려 나가는지 확인.

프론트 상세 헤더는 status_name을 읽는데, status(missing->error)로는 라벨을 되돌릴 수
없어서 이 값이 빠지면 "DB는 이탈인데 화면은 장애물 감지"가 된다.
sqlite로 돌아가므로 서버·DB·하드웨어가 필요 없다: python test_sse_status_name.py
"""
import asyncio, os, sys, tempfile

TMP = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{TMP}/sse.db"
os.environ["DEVICE_API_KEY"] = "test-device-key"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from core.database import Base, engine, SessionLocal
from models.models import Extinguisher
import routers.sensors as sensors

sensors.SNAPSHOT_UPLOAD_DIR = TMP

Base.metadata.create_all(engine)

app = FastAPI()
app.include_router(sensors.router, prefix="/api/sensors")
client = TestClient(app)
H = {"X-Device-Key": "test-device-key"}

db = SessionLocal()
db.add(Extinguisher(extinguisher_id=1, id="FE-T01", mac_address="AA:BB:CC:DD:EE:FF", status="normal"))
db.commit()

# broadcaster.publish를 가로채 실제로 나간 페이로드를 붙잡는다
published = []
async def capture(payload):
    published.append(payload)
sensors.broadcaster.publish = capture


def report(status):
    r = client.post("/api/sensors/update", headers=H,
                    json={"mac_address": "AA:BB:CC:DD:EE:FF", "status": status,
                          "sensor_readings": [{"sensor_type_name": "무게", "value": 1.2, "unit": "g"}]})
    assert r.status_code == 200, r.text


# normal -> missing: 상태가 바뀌었으므로 이벤트가 생기고 SSE가 나가야 한다
report("missing")
assert published, "상태가 바뀌었는데 SSE 발행이 없다"
ev = published[-1]["event"]
assert ev["status"] == "error", ev                    # missing은 프론트 상태로 error
assert ev["status_name"] == "이탈/분실", ev            # 화면에 찍히는 한글 라벨
assert ev["extinguisher_id"] == 1, ev                 # 이게 없으면 프론트가 패치 대상을 못 찾는다

# DB에도 반영됐는지
db.expire_all()
assert db.query(Extinguisher).first().status == "missing"

# missing -> obstacle_detected: 라벨이 따라 바뀌는지
report("obstacle_detected")
ev = published[-1]["event"]
assert ev["status_name"] == "장애물 감지", ev

# 같은 상태 반복은 이벤트를 만들지 않는다 (중복 억제) — 발행 수가 늘지 않아야 한다
before = len(published)
report("obstacle_detected")
assert len(published) == before, "같은 상태 반복인데 SSE가 또 나갔다"

print("OK: SSE status_name verified")
