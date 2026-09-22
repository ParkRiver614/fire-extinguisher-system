"""
테스트 데이터 삽입 스크립트 (이미 있는 데이터는 건드리지 않음)
실행: python test_data.py  (fire_guard/ 디렉토리에서)
"""
import sys, os, random
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))

import bcrypt
from core.database import SessionLocal, engine, Base
from models.models import (
    ExtinguisherModel, Admin, Extinguisher, FloorNode, Zone, Floor,
    SensorType, SensorLog, SensorData, MaintenanceLog,
    AlertType, Alert, EventLog,
    AlertSettings, InspectionSettings, EmergencySettings, VisionSettings,
)

Base.metadata.create_all(bind=engine)
db = SessionLocal()

def exists(model, **kwargs):
    return db.query(model).filter_by(**kwargs).first() is not None

def hash_pw(plain):
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

def ago(days=0, hours=0):
    return datetime.utcnow() - timedelta(days=days, hours=hours)

try:
    # ── 1. 소화기 모델 ────────────────────────────────────────────────────────
    models_data = [
        ExtinguisherModel(model_id=1, model_name="CO2-5K",   agent_type="CO2",      total_weight=7.5, empty_weight=2.5),
        ExtinguisherModel(model_id=2, model_name="ABC-3K",   agent_type="ABC 분말", total_weight=5.0, empty_weight=2.0),
        ExtinguisherModel(model_id=3, model_name="HALON-2K", agent_type="할론",     total_weight=4.0, empty_weight=2.0),
    ]
    for m in models_data:
        if not exists(ExtinguisherModel, model_id=m.model_id):
            db.add(m)
            print(f"  [추가] ExtinguisherModel: {m.model_name}")
        else:
            print(f"  [skip] ExtinguisherModel: {m.model_name}")
    db.flush()

    # ── 2. 센서 타입 ──────────────────────────────────────────────────────────
    sensor_types_data = [
        SensorType(sensor_type_id=1, sensor_type_name="온도",     unit="°C"),
        SensorType(sensor_type_id=2, sensor_type_name="습도",     unit="%"),
        SensorType(sensor_type_id=3, sensor_type_name="기압",     unit="MPa"),
        SensorType(sensor_type_id=4, sensor_type_name="신호강도", unit="dBm"),
    ]
    for s in sensor_types_data:
        if not exists(SensorType, sensor_type_name=s.sensor_type_name):
            db.add(s)
            print(f"  [추가] SensorType: {s.sensor_type_name}")
        else:
            print(f"  [skip] SensorType: {s.sensor_type_name}")
    db.flush()

    # ── 3. 알림 타입 ──────────────────────────────────────────────────────────
    alert_types_data = [
        AlertType(alert_type_id=1, alert_type_name="Obstacle"),
        AlertType(alert_type_id=2, alert_type_name="Missing"),
        AlertType(alert_type_id=3, alert_type_name="Fire"),
        AlertType(alert_type_id=4, alert_type_name="Inspection"),
    ]
    for a in alert_types_data:
        if not exists(AlertType, alert_type_name=a.alert_type_name):
            db.add(a)
            print(f"  [추가] AlertType: {a.alert_type_name}")
        else:
            print(f"  [skip] AlertType: {a.alert_type_name}")
    db.flush()

    # ── 4. 관리자 계정 ────────────────────────────────────────────────────────
    floors = {f.floor_name: f for f in db.query(Floor).all()}
    admins_data = [
        dict(admin_name="김철수", email="chulsoo@firewatch.io",  role="manager",  phone_number="010-1234-5678", floor="1F"),
        dict(admin_name="이영희", email="younghee@firewatch.io", role="operator", phone_number="010-2345-6789", floor="1F"),
        dict(admin_name="박지훈", email="jihun@firewatch.io",    role="operator", phone_number="010-3456-7890", floor="2F"),
        dict(admin_name="최민준", email="minjun@firewatch.io",   role="viewer",   phone_number="010-4567-8901", floor="1F"),
        dict(admin_name="정수현", email="suhyun@firewatch.io",   role="operator", phone_number="010-5678-9012", floor="B1"),
    ]
    for a in admins_data:
        if not exists(Admin, email=a["email"]):
            floor_obj = floors.get(a["floor"])
            db.add(Admin(
                admin_name=a["admin_name"],
                email=a["email"],
                password_hash=hash_pw("test1234"),
                role=a["role"],
                phone_number=a["phone_number"],
                assigned_floor_id=floor_obj.floor_id if floor_obj else None,
                created_at=ago(days=30),
                last_login=ago(days=random.randint(0, 5)),
            ))
            print(f"  [추가] Admin: {a['admin_name']} ({a['email']}) / 비밀번호: test1234")
        else:
            print(f"  [skip] Admin: {a['email']}")
    db.flush()

    # ── 5. 소화기 + 노드 + 센서 데이터 ──────────────────────────────────────
    zones = db.query(Zone).all()
    zone_map = {z.zone_name: z for z in zones}
    admins = db.query(Admin).all()

    def get_zone(name):
        return zone_map.get(name)

    def get_admin(idx):
        return admins[idx % len(admins)] if admins else None

    sensor_types = {s.sensor_type_name: s for s in db.query(SensorType).all()}

    def add_sensor_log(ext_id, temp, humidity, pressure, signal, days_ago=0):
        log = SensorLog(extinguisher_id=ext_id, created_at=ago(days=days_ago, hours=random.randint(0, 23)))
        db.add(log)
        db.flush()
        readings = [("온도", temp), ("습도", humidity), ("기압", pressure), ("신호강도", signal)]
        for name, val in readings:
            st = sensor_types.get(name)
            if st:
                db.add(SensorData(log_id=log.log_id, sensor_type_id=st.sensor_type_id, value=val))

    devices_data = [
        dict(id="FE-101", mac="00:1A:2B:3C:4D:01", ip="192.168.1.101", zone="Room 101",   model_id=1, status="normal",      battery=86, admin_idx=0, temp=24, hum=45, pres=14.2, sig=-68),
        dict(id="FE-102", mac="00:1A:2B:3C:4D:02", ip="192.168.1.102", zone="Corridor A", model_id=2, status="normal",      battery=91, admin_idx=1, temp=22, hum=48, pres=14.1, sig=-72),
        dict(id="FE-103", mac="00:1A:2B:3C:4D:03", ip="192.168.1.103", zone="Room 201",   model_id=1, status="warning",     battery=62, admin_idx=2, temp=29, hum=38, pres=14.3, sig=-75),
        dict(id="FE-104", mac="00:1A:2B:3C:4D:04", ip="192.168.1.104", zone="Stairwell",  model_id=2, status="normal",      battery=78, admin_idx=3, temp=23, hum=44, pres=14.2, sig=-69),
        dict(id="FE-105", mac="00:1A:2B:3C:4D:05", ip="192.168.1.105", zone="Lobby",      model_id=3, status="missing",     battery=15, admin_idx=4, temp=35, hum=30, pres=14.8, sig=-85),
        dict(id="FE-106", mac="00:1A:2B:3C:4D:06", ip="192.168.1.106", zone="Room 102",   model_id=1, status="normal",      battery=94, admin_idx=0, temp=22, hum=50, pres=14.1, sig=-66),
        dict(id="FE-107", mac="00:1A:2B:3C:4D:07", ip="192.168.1.107", zone="Cafeteria",  model_id=2, status="normal",      battery=82, admin_idx=1, temp=26, hum=55, pres=14.2, sig=-71),
        dict(id="FE-108", mac="00:1A:2B:3C:4D:08", ip="192.168.1.108", zone="Corridor B", model_id=1, status="warning",     battery=53, admin_idx=2, temp=27, hum=42, pres=14.4, sig=-78),
        dict(id="FE-109", mac="00:1A:2B:3C:4D:09", ip="192.168.1.109", zone="Room 105",   model_id=2, status="normal",      battery=88, admin_idx=3, temp=23, hum=47, pres=14.2, sig=-67),
        dict(id="FE-110", mac="00:1A:2B:3C:4D:0A", ip="192.168.1.110", zone="Room 203",   model_id=1, status="offline",     battery=0,  admin_idx=4, temp=18, hum=60, pres=13.8, sig=-95),
    ]

    created_extinguishers = []
    for d in devices_data:
        if exists(Extinguisher, mac_address=d["mac"]):
            print(f"  [skip] Extinguisher: {d['id']}")
            ext = db.query(Extinguisher).filter_by(mac_address=d["mac"]).first()
            created_extinguishers.append(ext)
            continue

        zone = get_zone(d["zone"])
        admin = get_admin(d["admin_idx"])

        node = None
        if zone:
            node = FloorNode(
                floor_id=zone.floor_id,
                zone_id=zone.zone_id,
                x=round(random.uniform(15, 85), 2),
                y=round(random.uniform(15, 85), 2),
                node_type="normal",
            )
            db.add(node)
            db.flush()

        ext = Extinguisher(
            id=d["id"],
            mac_address=d["mac"],
            ip_address=d["ip"],
            model_id=d["model_id"],
            zone_id=zone.zone_id if zone else None,
            node_id=node.floor_node_id if node else None,
            admin_id=admin.admin_id if admin else None,
            status=d["status"],
            battery_level=d["battery"],
            manufacture_date="2023-10-01",
            install_date="2024-01-15",
            expiry_date="2027-01-15",
            last_ping_at=ago(hours=random.randint(0, 12)),
        )
        db.add(ext)
        db.flush()
        created_extinguishers.append(ext)

        # 최근 3일치 센서 로그
        for day in range(3):
            add_sensor_log(ext.extinguisher_id,
                           d["temp"] + random.uniform(-1, 1),
                           d["hum"]  + random.uniform(-2, 2),
                           d["pres"] + random.uniform(-0.1, 0.1),
                           d["sig"]  + random.uniform(-3, 3),
                           days_ago=day)

        print(f"  [추가] Extinguisher: {d['id']} ({d['zone']}, {d['status']})")
    db.flush()

    # ── 6. 점검 로그 ──────────────────────────────────────────────────────────
    if admins and created_extinguishers:
        for ext in created_extinguishers[:5]:
            if db.query(MaintenanceLog).filter_by(extinguisher_id=ext.extinguisher_id).count() == 0:
                db.add(MaintenanceLog(
                    extinguisher_id=ext.extinguisher_id,
                    admin_id=admins[0].admin_id,
                    action_taken="정기 점검 완료",
                    created_at=ago(days=30),
                ))
                print(f"  [추가] MaintenanceLog: {ext.id}")

    # ── 7. 알림 ───────────────────────────────────────────────────────────────
    alert_type_map = {a.alert_type_name: a for a in db.query(AlertType).all()}

    alerts_data = [
        dict(ext_idx=2, type="Obstacle",   detail="소화기 앞 장애물 감지",      status="active",   days=0),
        dict(ext_idx=4, type="Missing",    detail="소화기 위치 이탈 감지",       status="active",   days=1),
        dict(ext_idx=7, type="Inspection", detail="정기 점검 기한 초과",          status="active",   days=2),
        dict(ext_idx=0, type="Obstacle",   detail="복도 소화기 주변 적치물 감지", status="resolved", days=5),
        dict(ext_idx=1, type="Fire",       detail="화재 감지 센서 임계값 초과",   status="resolved", days=7),
        dict(ext_idx=3, type="Inspection", detail="분기 점검 완료 요청",          status="resolved", days=10),
    ]
    for a in alerts_data:
        ext = created_extinguishers[a["ext_idx"]] if a["ext_idx"] < len(created_extinguishers) else None
        at  = alert_type_map.get(a["type"])
        if ext and at:
            if db.query(Alert).filter_by(extinguisher_id=ext.extinguisher_id, alert_type_id=at.alert_type_id, status=a["status"]).count() == 0:
                db.add(Alert(
                    extinguisher_id=ext.extinguisher_id,
                    alert_type_id=at.alert_type_id,
                    detail=a["detail"],
                    status=a["status"],
                    created_at=ago(days=a["days"]),
                ))
                print(f"  [추가] Alert: {a['type']} / {a['detail'][:20]}...")

    # ── 8. 이벤트 로그 ────────────────────────────────────────────────────────
    if db.query(EventLog).count() == 0:
        events = [
            EventLog(event_type="info",    text="시스템 시작",          sub="서버 초기화 완료",              timestamp=ago(days=1, hours=2)),
            EventLog(event_type="warning", text="배터리 부족 경고",     sub="FE-103 배터리 62% 이하",         timestamp=ago(hours=5)),
            EventLog(event_type="error",   text="소화기 이탈 감지",     sub="FE-105 위치 이탈",               timestamp=ago(hours=3)),
            EventLog(event_type="info",    text="정기 점검 완료",       sub="FE-101 점검 정상",               timestamp=ago(hours=1)),
            EventLog(event_type="warning", text="신호 약화",            sub="FE-108 신호강도 -78dBm",         timestamp=ago(minutes=30) if hasattr(timedelta, 'minutes') else ago()),
        ]
        db.add_all(events)
        print(f"  [추가] EventLog: {len(events)}개")

    # ── 9. 설정 ───────────────────────────────────────────────────────────────
    if not exists(AlertSettings, alert_setting_id=1):
        db.add(AlertSettings(alert_setting_id=1, obstacle_alert=True, missing_extinguisher_alert=True, fire_alert=True, humidity_alert=True, inspection_schedule_alert=True))
        print("  [추가] AlertSettings")
    if not exists(InspectionSettings, inspection_setting_id=1):
        db.add(InspectionSettings(inspection_setting_id=1, inspection_cycle=30, inspection_reminder=True, missed_inspection_warning=True))
        print("  [추가] InspectionSettings")
    if not exists(EmergencySettings, emergency_setting_id=1):
        db.add(EmergencySettings(emergency_setting_id=1, led_auto_on=True, buzzer_auto_run=True, emergency_mode=False))
        print("  [추가] EmergencySettings")
    if not exists(VisionSettings, vision_setting_id=1):
        db.add(VisionSettings(vision_setting_id=1, inference_interval_minutes=30))
        print("  [추가] VisionSettings")

    db.commit()
    print("\n✅ 테스트 데이터 삽입 완료")

except Exception as e:
    db.rollback()
    print(f"\n❌ 오류 발생: {e}")
    raise
finally:
    db.close()
