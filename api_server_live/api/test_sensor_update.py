"""주기 보고로 쌓이는 정상 사이클 기록이 최신 한 건만 남는지 확인 (sqlite, 하드웨어/서버 불필요)."""
import os, sys, tempfile

TMP = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{TMP}/check.db"
os.environ["DEVICE_API_KEY"] = "test-device-key"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from core.database import Base, engine, SessionLocal
from models.models import Extinguisher, SensorLog, SensorData, VisionLog, EventLog, Alert
import routers.sensors as sensors

sensors.SNAPSHOT_UPLOAD_DIR = TMP      # 실제 uploads 디렉터리를 건드리지 않도록 격리

Base.metadata.create_all(engine)

app = FastAPI()
app.include_router(sensors.router, prefix="/api/sensors")
client = TestClient(app)
H = {"X-Device-Key": "test-device-key"}

db = SessionLocal()
db.add(Extinguisher(extinguisher_id=1, id="FE-T01", mac_address="AA:BB:CC:DD:EE:FF", status="normal"))
db.commit()

# 스냅샷 파일이 실제로 지워지는지 보려고, 업로드 디렉터리에 더미 파일을 만들어 URL로 참조한다
def fake_snapshot(name):
    path = os.path.join(sensors.SNAPSHOT_UPLOAD_DIR, name)
    open(path, "wb").write(b"x")
    return path, f"http://server/static/vision-snapshots/{name}"

def report(status, url):
    r = client.post("/api/sensors/update", headers=H,
                    json={"mac_address": "AA:BB:CC:DD:EE:FF", "status": status,
                          "snapshot_url": url,
                          "sensor_readings": [{"sensor_type_name": "온도", "value": 21, "unit": "C"}]})
    assert r.status_code == 200, r.text

def counts():
    db.expire_all()
    return (db.query(SensorLog).count(), db.query(SensorData).count(),
            db.query(VisionLog).count(), db.query(EventLog).count())

# 정상 사이클 3번 — 매번 새 사진이 올라오지만 최신 한 건만 남아야 한다
paths = []
for i in range(3):
    p, u = fake_snapshot(f"cycle{i}.jpg")
    paths.append(p)
    report("normal", u)

logs, data, visions, events = counts()
assert (logs, data, visions) == (1, 1, 1), f"정상 사이클이 쌓임: {(logs, data, visions)}"
assert events == 0, f"상태 변화 없는데 이벤트가 생김: {events}"
assert not os.path.exists(paths[0]) and not os.path.exists(paths[1]), "직전 주기 사진이 안 지워짐"
assert os.path.exists(paths[2]), "최신 사진이 지워짐"
assert db.query(VisionLog).first().snapshot_url.endswith("cycle2.jpg")

# 장애물 감지로 전환 — 이벤트/알림이 생기고, 그 근거 사진은 보존되어야 한다
pe, ue = fake_snapshot("event.jpg")
report("obstacle_detected", ue)
logs, data, visions, events = counts()
assert events == 1, f"상태 전환 이벤트가 안 생김: {events}"
assert os.path.exists(pe), "이벤트 근거 사진이 지워짐"
assert not os.path.exists(paths[2]), "이벤트 전환 시 직전 정상 사진이 안 지워짐"

# 장애물 유지 — 이벤트는 안 늘고, 이벤트 사진은 계속 쌓인다(근거 보존)
pe2, ue2 = fake_snapshot("event2.jpg")
report("obstacle_detected", ue2)
_, _, visions2, events2 = counts()
assert events2 == 1, f"같은 상태 반복인데 이벤트가 늘어남: {events2}"
assert os.path.exists(pe) and os.path.exists(pe2), "이벤트 사진이 지워짐"

print("OK  정상 사이클 정리 + 이벤트 중복 억제 + 이벤트 근거 보존 모두 확인")
