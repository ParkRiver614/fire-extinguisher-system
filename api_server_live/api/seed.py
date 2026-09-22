"""
DB 테스트 데이터 시드 스크립트
실행: python seed.py  (fire_guard/ 디렉토리에서)
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import bcrypt
from datetime import datetime
from core.database import SessionLocal, engine, Base
from models.models import (
    Building, Floor, Zone, FloorNode,
    ExtinguisherModel, Admin, Extinguisher,
    SensorType, EventType, SensorLog, SensorData,
    MaintenanceLog, VisionLog,
    AlertType, Alert, EventLog,
    AlertSettings, InspectionSettings, EmergencySettings, VisionSettings,
)


def hash_pw(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def seed_password() -> str:
    """시드 계정의 초기 비밀번호. 소스에 박아두면 저장소를 본 사람이 그대로 로그인할 수 있어
    환경변수로만 받는다. 안 주면 실행을 거부한다 — 조용히 기본값으로 계정을 만드는 것보다 낫다."""
    pw = os.environ.get("SEED_PASSWORD", "")
    if len(pw) < 8:
        sys.exit(
            "SEED_PASSWORD 환경변수를 8자 이상으로 설정한 뒤 실행하세요.\n"
            "  예) SEED_PASSWORD='<직접 정한 비밀번호>' python seed.py"
        )
    return pw


def seed():
    # DB에 손대기 전에 먼저 검사한다 — 연결 에러에 가려 안내 메시지를 못 보는 일이 없도록.
    password = seed_password()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        if db.query(Building).count() > 0:
            print("이미 시드 데이터가 존재합니다. 종료합니다.")
            return

        # ── 1. Buildings ────────────────────────────────────────────────
        building = Building(building_id=1, building_name="본관")
        db.add(building)
        db.flush()

        # ── 2. Floors ────────────────────────────────────────────────────
        floors_data = [
            Floor(floor_id=1, floor_name="1F", level=1,  building_id=1),
            Floor(floor_id=2, floor_name="2F", level=2,  building_id=1),
            Floor(floor_id=3, floor_name="3F", level=3,  building_id=1),
            Floor(floor_id=4, floor_name="B1", level=-1, building_id=1),
            Floor(floor_id=5, floor_name="RF", level=99, building_id=1),
        ]
        db.add_all(floors_data)
        db.flush()

        # ── 3. Zones ─────────────────────────────────────────────────────
        zones_data = [
            Zone(zone_id=2,  zone_name="Corridor A",   floor_id=1),
            Zone(zone_id=3,  zone_name="Stairwell",    floor_id=1),
            Zone(zone_id=4,  zone_name="Cafeteria",    floor_id=1),
            Zone(zone_id=5,  zone_name="Room 101",     floor_id=1),
            Zone(zone_id=6,  zone_name="Room 102",     floor_id=1),
            Zone(zone_id=7,  zone_name="Room 105",     floor_id=1),
            Zone(zone_id=8,  zone_name="Lobby",        floor_id=2),
            Zone(zone_id=9,  zone_name="Corridor B",   floor_id=2),
            Zone(zone_id=10, zone_name="Room 201",     floor_id=2),
            Zone(zone_id=11, zone_name="Room 202",     floor_id=2),
            Zone(zone_id=12, zone_name="Meeting Room", floor_id=2),
            Zone(zone_id=13, zone_name="Room 301",     floor_id=3),
            Zone(zone_id=14, zone_name="Server Room",  floor_id=4),
            Zone(zone_id=15, zone_name="Parking",      floor_id=4),
            Zone(zone_id=16, zone_name="Rooftop",      floor_id=5),
        ]
        db.add_all(zones_data)
        db.flush()

        # ── 4. FloorNodes (zone_id 포함) ──────────────────────────────────
        nodes_data = [
            FloorNode(floor_node_id=101, floor_id=1, zone_id=5,  x=16.67, y=22.17),
            FloorNode(floor_node_id=102, floor_id=1, zone_id=2,  x=42.64, y=11.30),
            FloorNode(floor_node_id=103, floor_id=2, zone_id=10, x=12.08, y=75.00),
            FloorNode(floor_node_id=104, floor_id=1, zone_id=3,  x=86.81, y=47.39),
            FloorNode(floor_node_id=105, floor_id=4, zone_id=14, x=16.67, y=22.17),
            FloorNode(floor_node_id=106, floor_id=3, zone_id=13, x=16.67, y=22.17),
            FloorNode(floor_node_id=107, floor_id=1, zone_id=4,  x=86.81, y=75.00),
            FloorNode(floor_node_id=108, floor_id=2, zone_id=9,  x=64.17, y=47.39),
            FloorNode(floor_node_id=109, floor_id=1, zone_id=7,  x=86.81, y=22.17),
            FloorNode(floor_node_id=110, floor_id=2, zone_id=12, x=64.17, y=63.48),
            FloorNode(floor_node_id=201, floor_id=2, zone_id=8,  x=12.08, y=75.00),
            FloorNode(floor_node_id=202, floor_id=1, zone_id=5,  x=16.67, y=22.17),
            FloorNode(floor_node_id=301, floor_id=5, zone_id=16, x=50.00, y=50.00),
            FloorNode(floor_node_id=302, floor_id=4, zone_id=15, x=38.19, y=75.00),
        ]
        db.add_all(nodes_data)
        db.flush()

        # ── 5. ExtinguisherModels ─────────────────────────────────────────
        models_data = [
            ExtinguisherModel(model_id=1, model_name="CO2-5K",   agent_type="CO2",      total_weight=7.5, empty_weight=2.5),
            ExtinguisherModel(model_id=2, model_name="ABC-3K",   agent_type="ABC 분말", total_weight=5.0, empty_weight=2.0),
            ExtinguisherModel(model_id=3, model_name="HALON-2K", agent_type="할론",     total_weight=4.0, empty_weight=2.0),
        ]
        db.add_all(models_data)
        db.flush()

        # ── 6. Admins ──────────────────────────────────────────────────────
        pw = hash_pw(password)
        admins_data = [
            Admin(admin_id=1,  admin_name="김철수", email="chulsoo@firewatch.io",   password_hash=pw, role="admin",    phone_number="010-1234-5678", assigned_floor_id=1, created_at=datetime(2024,1,1,9,0)),
            Admin(admin_id=2,  admin_name="이영희", email="younghee@firewatch.io",  password_hash=pw, role="manager",  phone_number="010-2345-6789", assigned_floor_id=1, created_at=datetime(2024,1,1,9,0)),
            Admin(admin_id=3,  admin_name="박지훈", email="jihoon@firewatch.io",    password_hash=pw, role="operator", phone_number="010-3456-7890", assigned_floor_id=2, created_at=datetime(2024,1,1,9,0)),
            Admin(admin_id=4,  admin_name="최민준", email="minjun@firewatch.io",    password_hash=pw, role="operator", phone_number="010-4567-8901", assigned_floor_id=1, created_at=datetime(2024,1,1,9,0)),
            Admin(admin_id=5,  admin_name="정수현", email="soohyun@firewatch.io",   password_hash=pw, role="operator", phone_number="010-5678-9012", assigned_floor_id=4, created_at=datetime(2024,1,1,9,0)),
            Admin(admin_id=6,  admin_name="한예진", email="yejin@firewatch.io",     password_hash=pw, role="operator", phone_number="010-6789-0123", assigned_floor_id=3, created_at=datetime(2024,1,1,9,0)),
            Admin(admin_id=7,  admin_name="윤태양", email="taeyang@firewatch.io",   password_hash=pw, role="operator", phone_number="010-7890-1234", assigned_floor_id=1, created_at=datetime(2024,1,1,9,0)),
            Admin(admin_id=8,  admin_name="강서연", email="seoyeon@firewatch.io",   password_hash=pw, role="operator", phone_number="010-8901-2345", assigned_floor_id=2, created_at=datetime(2024,1,1,9,0)),
            Admin(admin_id=9,  admin_name="조현우", email="hyunwoo@firewatch.io",   password_hash=pw, role="operator", phone_number="010-9012-3456", assigned_floor_id=1, created_at=datetime(2024,1,1,9,0)),
            Admin(admin_id=10, admin_name="임지아", email="jia@firewatch.io",       password_hash=pw, role="operator", phone_number="010-0123-4567", assigned_floor_id=2, created_at=datetime(2024,1,1,9,0)),
            Admin(admin_id=11, admin_name="신동혁", email="donghyuk@firewatch.io",  password_hash=pw, role="operator", phone_number="010-1111-2222", assigned_floor_id=2, created_at=datetime(2024,2,1,9,0)),
            Admin(admin_id=12, admin_name="오세희", email="sehee@firewatch.io",     password_hash=pw, role="operator", phone_number="010-3333-4444", assigned_floor_id=1, created_at=datetime(2024,2,1,9,0)),
            Admin(admin_id=13, admin_name="문준서", email="junseo@firewatch.io",    password_hash=pw, role="operator", phone_number="010-5555-6666", assigned_floor_id=5, created_at=datetime(2024,3,1,9,0)),
            Admin(admin_id=14, admin_name="배소영", email="soyoung@firewatch.io",   password_hash=pw, role="operator", phone_number="010-7777-8888", assigned_floor_id=4, created_at=datetime(2024,3,1,9,0)),
        ]
        db.add_all(admins_data)
        db.flush()

        # ── 7. Extinguishers ──────────────────────────────────────────────
        extinguishers_data = [
            Extinguisher(extinguisher_id=101, id="FE-101", node_id=101, zone_id=5,  model_id=1, mac_address="00:1A:2B:3C:4D:5E", ip_address="192.168.1.101", battery_level=86,  manufacture_date="2023-10-15", install_date="2024-01-10", expiry_date="2027-01-10", admin_id=1,  status="normal",            last_ping_at=datetime(2024,1,20,10,42)),
            Extinguisher(extinguisher_id=102, id="FE-102", node_id=102, zone_id=2,  model_id=2, mac_address="00:1A:2B:3C:4D:5F", ip_address="192.168.1.102", battery_level=91,  manufacture_date="2023-10-20", install_date="2024-01-10", expiry_date="2027-01-10", admin_id=2,  status="normal",            last_ping_at=datetime(2024,1,20,10,40)),
            Extinguisher(extinguisher_id=103, id="FE-103", node_id=103, zone_id=10, model_id=1, mac_address="00:1A:2B:3C:4D:60", ip_address="192.168.1.103", battery_level=62,  manufacture_date="2023-11-05", install_date="2024-01-11", expiry_date="2027-01-11", admin_id=3,  status="obstacle_detected", last_ping_at=datetime(2024,1,20,10,41)),
            Extinguisher(extinguisher_id=104, id="FE-104", node_id=104, zone_id=3,  model_id=2, mac_address="00:1A:2B:3C:4D:61", ip_address="192.168.1.104", battery_level=78,  manufacture_date="2023-11-20", install_date="2024-01-11", expiry_date="2027-01-11", admin_id=4,  status="normal",            last_ping_at=datetime(2024,1,20,10,42)),
            Extinguisher(extinguisher_id=105, id="FE-105", node_id=105, zone_id=14, model_id=3, mac_address="00:1A:2B:3C:4D:62", ip_address="192.168.1.105", battery_level=15,  manufacture_date="2023-09-01", install_date="2024-01-12", expiry_date="2027-01-12", admin_id=5,  status="missing",           last_ping_at=datetime(2024,1,20,10,8)),
            Extinguisher(extinguisher_id=106, id="FE-106", node_id=106, zone_id=13, model_id=1, mac_address="00:1A:2B:3C:4D:63", ip_address="192.168.1.106", battery_level=94,  manufacture_date="2023-10-25", install_date="2024-01-12", expiry_date="2027-01-12", admin_id=6,  status="normal",            last_ping_at=datetime(2024,1,20,10,42)),
            Extinguisher(extinguisher_id=107, id="FE-107", node_id=107, zone_id=4,  model_id=2, mac_address="00:1A:2B:3C:4D:64", ip_address="192.168.1.107", battery_level=82,  manufacture_date="2023-12-01", install_date="2024-01-13", expiry_date="2027-01-13", admin_id=7,  status="normal",            last_ping_at=datetime(2024,1,20,10,37)),
            Extinguisher(extinguisher_id=108, id="FE-108", node_id=108, zone_id=9,  model_id=1, mac_address="00:1A:2B:3C:4D:65", ip_address="192.168.1.108", battery_level=53,  manufacture_date="2023-11-15", install_date="2024-01-13", expiry_date="2027-01-13", admin_id=8,  status="obstacle_detected", last_ping_at=datetime(2024,1,20,10,39)),
            Extinguisher(extinguisher_id=109, id="FE-109", node_id=109, zone_id=7,  model_id=2, mac_address="00:1A:2B:3C:4D:66", ip_address="192.168.1.109", battery_level=88,  manufacture_date="2023-12-10", install_date="2024-01-14", expiry_date="2027-01-14", admin_id=9,  status="normal",            last_ping_at=datetime(2024,1,20,10,42)),
            Extinguisher(extinguisher_id=110, id="FE-110", node_id=110, zone_id=12, model_id=1, mac_address="00:1A:2B:3C:4D:67", ip_address="192.168.1.110", battery_level=71,  manufacture_date="2023-10-30", install_date="2024-01-14", expiry_date="2027-01-14", admin_id=10, status="normal",            last_ping_at=datetime(2024,1,20,10,30)),
            Extinguisher(extinguisher_id=201, id="FE-201", node_id=201, zone_id=8,  model_id=2, mac_address="00:2A:2B:3C:4D:5E", ip_address="192.168.1.201", battery_level=95,  manufacture_date="2023-11-10", install_date="2024-02-01", expiry_date="2027-02-01", admin_id=11, status="normal",            last_ping_at=datetime(2024,2,1,10,42)),
            Extinguisher(extinguisher_id=202, id="FE-202", node_id=202, zone_id=5,  model_id=1, mac_address="00:2A:2B:3C:4D:5F", ip_address="192.168.1.202", battery_level=79,  manufacture_date="2023-12-20", install_date="2024-02-01", expiry_date="2027-02-01", admin_id=12, status="normal",            last_ping_at=datetime(2024,2,1,10,41)),
            Extinguisher(extinguisher_id=301, id="FE-301", node_id=301, zone_id=16, model_id=1, mac_address="00:3A:2B:3C:4D:5E", ip_address="192.168.1.301", battery_level=8,   manufacture_date="2024-01-05", install_date="2024-03-01", expiry_date="2027-03-01", admin_id=13, status="missing",           last_ping_at=datetime(2024,3,1,9,42)),
            Extinguisher(extinguisher_id=302, id="FE-302", node_id=302, zone_id=15, model_id=2, mac_address="00:3A:2B:3C:4D:5F", ip_address="192.168.1.302", battery_level=0,   manufacture_date="2023-12-15", install_date="2024-03-01", expiry_date="2027-03-01", admin_id=14, status="offline",           last_ping_at=datetime(2024,3,1,7,42)),
        ]
        db.add_all(extinguishers_data)
        db.flush()

        # ── 8. SensorTypes ────────────────────────────────────────────────
        sensor_types = {
            "온도":     SensorType(sensor_type_id=1, sensor_type_name="온도",     unit="°C"),
            "습도":     SensorType(sensor_type_id=2, sensor_type_name="습도",     unit="%"),
            "기압":     SensorType(sensor_type_id=3, sensor_type_name="기압",     unit="MPa"),
            "신호강도": SensorType(sensor_type_id=4, sensor_type_name="신호강도", unit="dBm"),
        }
        db.add_all(sensor_types.values())
        db.flush()

        # ── 9. EventTypes ─────────────────────────────────────────────────
        event_types = {
            name: EventType(event_type_name=name)
            for name in ["normal", "obstacle_detected", "missing", "fire_detected", "offline", "maintenance"]
        }
        db.add_all(event_types.values())
        db.flush()

        # ── 10. SensorLogs + SensorData ───────────────────────────────────
        now = datetime(2024, 1, 20, 10, 42)
        sensor_rows = [
            # (extinguisher_id, status, [(sensor_type_name, value)])
            (101, "normal",            [("온도", 24), ("습도", 45), ("기압", 14.2), ("신호강도", -68)]),
            (102, "normal",            [("온도", 22), ("습도", 48), ("기압", 14.1), ("신호강도", -72)]),
            (103, "obstacle_detected", [("온도", 29), ("습도", 38), ("기압", 14.3), ("신호강도", -75)]),
            (104, "normal",            [("온도", 23), ("습도", 44), ("기압", 14.2), ("신호강도", -69)]),
            (105, "missing",           [("온도", 35), ("습도", 30), ("기압", 14.8), ("신호강도", -85)]),
            (106, "normal",            [("온도", 22), ("습도", 50), ("기압", 14.1), ("신호강도", -66)]),
            (107, "normal",            [("온도", 26), ("습도", 55), ("기압", 14.2), ("신호강도", -71)]),
            (108, "obstacle_detected", [("온도", 27), ("습도", 42), ("기압", 14.4), ("신호강도", -78)]),
            (109, "normal",            [("온도", 23), ("습도", 47), ("기압", 14.2), ("신호강도", -67)]),
            (110, "normal",            [("온도", 22), ("습도", 46), ("기압", 14.1), ("신호강도", -70)]),
            (201, "normal",            [("온도", 21), ("습도", 49), ("기압", 14.0), ("신호강도", -65)]),
            (202, "normal",            [("온도", 23), ("습도", 45), ("기압", 14.2), ("신호강도", -68)]),
            (301, "missing",           [("온도", 38), ("습도", 25), ("기압", 15.0), ("신호강도", -90)]),
            (302, "offline",           [("온도", 18), ("습도", 60), ("기압", 13.8), ("신호강도", -95)]),
        ]
        for ext_id, status, readings in sensor_rows:
            log = SensorLog(
                extinguisher_id=ext_id,
                event_type_id=event_types[status].event_type_id,
                created_at=now,
            )
            db.add(log)
            db.flush()
            for type_name, value in readings:
                db.add(SensorData(
                    log_id=log.log_id,
                    sensor_type_id=sensor_types[type_name].sensor_type_id,
                    value=value,
                ))
        db.flush()

        # ── 11. MaintenanceLogs ───────────────────────────────────────────
        maint_rows = [
            (1,  101, 1,  "정기 점검 완료",              "2024-01-10"),
            (2,  102, 2,  "정기 점검 완료",              "2024-01-10"),
            (3,  103, 3,  "배터리 교체 필요",            "2024-01-11"),
            (4,  104, 4,  "정기 점검 완료",              "2024-01-11"),
            (5,  105, 5,  "이탈 감지 – 현장 확인 필요", "2024-01-12"),
            (6,  106, 6,  "정기 점검 완료",              "2024-01-12"),
            (7,  107, 7,  "정기 점검 완료",              "2024-01-13"),
            (8,  108, 8,  "배터리 잔량 부족 경고",       "2024-01-13"),
            (9,  109, 9,  "정기 점검 완료",              "2024-01-14"),
            (10, 110, 10, "정기 점검 완료",              "2024-01-14"),
            (11, 201, 11, "정기 점검 완료",              "2024-02-01"),
            (12, 202, 12, "정기 점검 완료",              "2024-02-01"),
            (13, 301, 13, "이탈 감지 – 긴급 점검 필요", "2024-03-01"),
            (14, 302, 14, "연결 끊김 – 전원 확인 필요", "2024-03-01"),
        ]
        db.add_all([
            MaintenanceLog(
                maintenance_id=mid, extinguisher_id=eid, admin_id=aid,
                action_taken=action,
                created_at=datetime.strptime(date, "%Y-%m-%d"),
            )
            for mid, eid, aid, action, date in maint_rows
        ])
        db.flush()

        # ── 12. AlertTypes ────────────────────────────────────────────────
        alert_types = [
            AlertType(alert_type_id=1, alert_type_name="Missing"),
            AlertType(alert_type_id=2, alert_type_name="Fire"),
            AlertType(alert_type_id=3, alert_type_name="Obstacle"),
            AlertType(alert_type_id=4, alert_type_name="Inspection"),
            AlertType(alert_type_id=5, alert_type_name="Humidity"),
        ]
        db.add_all(alert_types)
        db.flush()

        # ── 13. Alerts ────────────────────────────────────────────────────
        alerts_data = [
            Alert(alert_id=1, extinguisher_id=105, alert_type_id=1, detail="FE-105 이탈 감지 – Server Room",    status="active",   created_at=datetime(2024,1,20,10,8)),
            Alert(alert_id=2, extinguisher_id=103, alert_type_id=3, detail="FE-103 장애물 감지 – Room 201",    status="active",   created_at=datetime(2024,1,20,10,41)),
            Alert(alert_id=3, extinguisher_id=301, alert_type_id=1, detail="FE-301 이탈 감지 – Rooftop",       status="active",   created_at=datetime(2024,3,1,9,42)),
            Alert(alert_id=4, extinguisher_id=108, alert_type_id=3, detail="FE-108 장애물 감지 – Corridor B",  status="resolved", created_at=datetime(2024,1,15,8,0), resolved_at=datetime(2024,1,15,9,0)),
        ]
        db.add_all(alerts_data)
        db.flush()

        # ── 14. EventLogs ─────────────────────────────────────────────────
        events_data = [
            EventLog(event_id=1, event_type="warning", text="FE-103 배터리 잔량 낮음",  sub="Room 201 – 62%",       timestamp=datetime(2024,1,20,10,41)),
            EventLog(event_id=2, event_type="error",   text="FE-105 이탈 감지",          sub="Server Room",           timestamp=datetime(2024,1,20,10,8)),
            EventLog(event_id=3, event_type="info",    text="FE-101 정기 점검 완료",     sub="Room 101",              timestamp=datetime(2024,1,10,9,0)),
            EventLog(event_id=4, event_type="error",   text="FE-301 이탈 감지",          sub="Rooftop – 긴급",        timestamp=datetime(2024,3,1,9,42)),
            EventLog(event_id=5, event_type="warning", text="FE-302 연결 끊김",          sub="Parking B1",            timestamp=datetime(2024,3,1,7,42)),
            EventLog(event_id=6, event_type="normal",  text="시스템 시작",               sub="FireGuard 서버 온라인", timestamp=datetime(2024,1,1,0,0)),
        ]
        db.add_all(events_data)
        db.flush()

        # ── 15. Settings (기본값) ─────────────────────────────────────────
        db.add(AlertSettings(
            alert_setting_id=1,
            obstacle_alert=True,
            missing_extinguisher_alert=True,
            fire_alert=True,
            humidity_alert=True,
            inspection_schedule_alert=True,
        ))
        db.add(InspectionSettings(
            inspection_setting_id=1,
            inspection_cycle=30,
            inspection_reminder=True,
            missed_inspection_warning=True,
        ))
        db.add(EmergencySettings(
            emergency_setting_id=1,
            led_auto_on=True,
            buzzer_auto_run=True,
            emergency_mode=False,
        ))
        db.add(VisionSettings(
            vision_setting_id=1,
            inference_interval_minutes=30,
        ))

        db.commit()
        print("✓ 시드 데이터 삽입 완료!")
        print()
        print("── 로그인 계정 (비밀번호는 SEED_PASSWORD로 준 값) ──")
        print("  admin   : chulsoo@firewatch.io   (role: admin)")
        print("  manager : younghee@firewatch.io  (role: manager)")
        print("  operator: jihoon@firewatch.io    (role: operator)")
        print()
        print("── 삽입 요약 ────────────────────────────────")
        print("  건물: 1, 층: 5, 구역: 15")
        print("  FloorNode: 14 (zone_id 포함), 소화기 모델: 3")
        print("  관리자: 14, 소화기: 14")
        print(f"  SensorType: {len(sensor_types)}, EventType: {len(event_types)}")
        print(f"  SensorLog: {len(sensor_rows)}, SensorData: {sum(len(r) for _, _, r in sensor_rows)}")
        print("  유지보수 로그: 14, 알림: 4, 이벤트: 6")

    except Exception as e:
        db.rollback()
        print(f"✗ 오류 발생: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
