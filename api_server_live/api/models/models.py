from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Date, ForeignKey, Boolean, JSON,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from core.database import Base


STATUS_NAME_MAP = {
    "normal":             "정상",
    "obstacle_detected":  "장애물 감지",
    "missing":            "이탈/분실",
    "fire_detected":      "화재 감지",
    "humidity_warning":   "습도 경고",
    "offline":            "오프라인",
    "maintenance":        "유지보수 중",
}


# ── 건물 / 층 / 구역 ───────────────────────────────────────────────────────────

class Building(Base):
    __tablename__ = "buildings"
    building_id   = Column(Integer, primary_key=True)
    building_name = Column(String(100), nullable=False)
    floors        = relationship("Floor", back_populates="building")


class Floor(Base):
    __tablename__ = "floors"
    floor_id    = Column(Integer, primary_key=True)
    floor_name  = Column(String(20),  nullable=False)
    floor_label = Column(String(100), nullable=True)
    level       = Column(Integer,     nullable=False)
    image_key           = Column(String(50),  nullable=True)
    image_ratio         = Column(Float,       nullable=True)
    hydrant_positions   = Column(JSON,        nullable=True)
    building_id         = Column(Integer, ForeignKey("buildings.building_id"))
    building    = relationship("Building", back_populates="floors")
    zones       = relationship("Zone",      back_populates="floor")
    nodes       = relationship("FloorNode", back_populates="floor")


class Zone(Base):
    __tablename__ = "zones"
    zone_id   = Column(Integer, primary_key=True)
    zone_name = Column(String(100), nullable=False)
    floor_id  = Column(Integer, ForeignKey("floors.floor_id"))
    floor     = relationship("Floor", back_populates="zones")
    nodes     = relationship("FloorNode", back_populates="zone")


# ── 맵 노드 / 엣지 ────────────────────────────────────────────────────────────

class FloorNode(Base):
    __tablename__ = "floor_nodes"
    floor_node_id = Column(Integer, primary_key=True)
    zone_id       = Column(Integer, ForeignKey("zones.zone_id"), nullable=True)   # ERD
    x             = Column(Float,   nullable=False)
    y             = Column(Float,   nullable=False)
    node_type     = Column(String(20), default="normal")
    is_blocked    = Column(Boolean, default=False)
    floor_id      = Column(Integer, ForeignKey("floors.floor_id"))
    floor         = relationship("Floor", back_populates="nodes")
    zone          = relationship("Zone",  back_populates="nodes")


class FloorEdge(Base):
    __tablename__ = "floor_edges"
    edge_id          = Column(Integer, primary_key=True)
    from_node_id     = Column(Integer, ForeignKey("floor_nodes.floor_node_id"))
    to_node_id       = Column(Integer, ForeignKey("floor_nodes.floor_node_id"))
    weight           = Column(Float,   nullable=False)
    is_bidirectional = Column(Boolean, default=True)                               # ERD
    floor_id         = Column(Integer, ForeignKey("floors.floor_id"))


# ── 소화기 모델 ────────────────────────────────────────────────────────────────

class ExtinguisherModel(Base):
    __tablename__ = "extinguisher_models"
    model_id     = Column(Integer, primary_key=True)
    model_name   = Column(String(50), nullable=False)
    agent_type   = Column(String(30), nullable=False)
    total_weight = Column(Float, nullable=False)
    empty_weight = Column(Float, nullable=False)


# ── 관리자 ─────────────────────────────────────────────────────────────────────

class Admin(Base):
    __tablename__ = "admins"
    admin_id          = Column(Integer, primary_key=True, index=True)
    admin_name        = Column(String(100), nullable=False)
    email             = Column(String(255), unique=True, nullable=False)
    password_hash     = Column(String(255), nullable=False)
    role              = Column(String(20),  default="operator")
    phone_number      = Column(String(20),  nullable=True)
    assigned_floor_id = Column(Integer, ForeignKey("floors.floor_id"), nullable=True)
    assigned_floor    = relationship("Floor")
    created_at        = Column(DateTime, default=datetime.utcnow)
    last_login        = Column(DateTime, nullable=True)


# ── 센서 타입 (ERD: sensor_types) ─────────────────────────────────────────────

class SensorType(Base):
    __tablename__ = "sensor_types"
    sensor_type_id   = Column(Integer, primary_key=True)
    sensor_type_name = Column(String(50), nullable=False, unique=True)
    unit             = Column(String(20), nullable=True)


# ── 이벤트 타입 (ERD: event_types) ───────────────────────────────────────────

class EventType(Base):
    __tablename__ = "event_types"
    event_type_id   = Column(Integer, primary_key=True)
    event_type_name = Column(String(50), nullable=False, unique=True)


# ── 소화기 ─────────────────────────────────────────────────────────────────────

class Extinguisher(Base):
    __tablename__ = "extinguishers"
    extinguisher_id  = Column(Integer, primary_key=True)
    id               = Column(String(20), unique=True, nullable=True)
    node_id          = Column(Integer, ForeignKey("floor_nodes.floor_node_id"), nullable=True)
    model_id         = Column(Integer, ForeignKey("extinguisher_models.model_id"), nullable=True)
    mac_address      = Column(String(50), unique=True, nullable=False)
    ip_address       = Column(String(50), nullable=True)
    manufacture_date = Column(Date, nullable=True)
    install_date     = Column(Date, nullable=True)
    expiry_date      = Column(Date, nullable=True)
    admin_id         = Column(Integer, ForeignKey("admins.admin_id"), nullable=True)
    zone_id          = Column(Integer, ForeignKey("zones.zone_id"),   nullable=True)
    status           = Column(String(30), default="normal")
    battery_level    = Column(Integer, nullable=True)
    last_ping_at     = Column(DateTime, nullable=True)

    model            = relationship("ExtinguisherModel")
    node             = relationship("FloorNode")
    zone             = relationship("Zone")
    admin            = relationship("Admin")
    sensor_logs      = relationship("SensorLog",      back_populates="extinguisher",
                                    order_by="SensorLog.created_at")
    maintenance_logs = relationship("MaintenanceLog", back_populates="extinguisher")
    vision_logs      = relationship("VisionLog",      back_populates="extinguisher")


# ── 센서 로그 묶음 (ERD: sensor_logs) ────────────────────────────────────────

class SensorLog(Base):
    __tablename__ = "sensor_logs"
    log_id          = Column(Integer, primary_key=True)
    extinguisher_id = Column(Integer, ForeignKey("extinguishers.extinguisher_id"))
    event_type_id   = Column(Integer, ForeignKey("event_types.event_type_id"), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    extinguisher = relationship("Extinguisher", back_populates="sensor_logs")
    event_type   = relationship("EventType")
    sensor_data  = relationship("SensorData", back_populates="sensor_log")
    vision_logs  = relationship("VisionLog",  back_populates="sensor_log")


# ── 개별 센서 측정값 (ERD: sensor_data) ──────────────────────────────────────

class SensorData(Base):
    __tablename__ = "sensor_data"
    data_id        = Column(Integer, primary_key=True)
    log_id         = Column(Integer, ForeignKey("sensor_logs.log_id"))
    sensor_type_id = Column(Integer, ForeignKey("sensor_types.sensor_type_id"))
    value          = Column(Float, nullable=False)

    sensor_log  = relationship("SensorLog",  back_populates="sensor_data")
    sensor_type = relationship("SensorType")


# ── AI 비전 분석 로그 (ERD: vision_analysis_logs) ─────────────────────────────

class VisionLog(Base):
    __tablename__ = "vision_logs"
    vision_log_id    = Column(Integer, primary_key=True)
    log_id           = Column(Integer, ForeignKey("sensor_logs.log_id"), nullable=True)  # ERD
    extinguisher_id  = Column(Integer, ForeignKey("extinguishers.extinguisher_id"))
    snapshot_url     = Column(String(255), nullable=True)
    detected_class   = Column(String(100), nullable=True)
    confidence_score = Column(Float, nullable=True)
    model_version    = Column(String(50),  nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow)

    sensor_log   = relationship("SensorLog",   back_populates="vision_logs")
    extinguisher = relationship("Extinguisher", back_populates="vision_logs")


# ── 유지보수 로그 ──────────────────────────────────────────────────────────────

class MaintenanceLog(Base):
    __tablename__ = "maintenance_logs"
    maintenance_id  = Column(Integer, primary_key=True)
    extinguisher_id = Column(Integer, ForeignKey("extinguishers.extinguisher_id"))
    admin_id        = Column(Integer, ForeignKey("admins.admin_id"))
    action_taken    = Column(String(255), nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow)

    extinguisher = relationship("Extinguisher", back_populates="maintenance_logs")
    admin        = relationship("Admin")


# ── 알림 타입 / 알림 ──────────────────────────────────────────────────────────

class AlertType(Base):
    __tablename__ = "alert_types"
    alert_type_id   = Column(Integer, primary_key=True)
    alert_type_name = Column(String(50), nullable=False)


class Alert(Base):
    __tablename__ = "alerts"
    alert_id        = Column(Integer, primary_key=True)
    extinguisher_id = Column(Integer, ForeignKey("extinguishers.extinguisher_id"))
    log_id          = Column(Integer, ForeignKey("sensor_logs.log_id"), nullable=True)  # ERD
    alert_type_id   = Column(Integer, ForeignKey("alert_types.alert_type_id"))
    detail          = Column(String(500), nullable=True)
    status          = Column(String(20),  default="active")
    resolved_by     = Column(Integer, ForeignKey("admins.admin_id"), nullable=True)
    resolved_at     = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    alert_type_rel = relationship("AlertType")
    extinguisher   = relationship("Extinguisher")
    sensor_log     = relationship("SensorLog")


# ── UI 이벤트 로그 (관제 화면 표시용) ─────────────────────────────────────────

class EventLog(Base):
    __tablename__ = "event_logs"
    event_log_id    = Column(Integer, primary_key=True)
    extinguisher_id = Column(Integer, ForeignKey("extinguishers.extinguisher_id"), nullable=True)
    event_type      = Column(String(50),  nullable=False)
    title           = Column(String(255), nullable=False)
    description     = Column(String(255), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    extinguisher = relationship("Extinguisher")


# ── 사용자 위치 로그 (ERD: user_location_logs) ────────────────────────────────

class UserLocationLog(Base):
    __tablename__ = "user_location_logs"
    user_log_id = Column(Integer, primary_key=True)
    user_id     = Column(Integer, nullable=True)
    zone_id     = Column(Integer, ForeignKey("zones.zone_id"), nullable=True)
    x_coord     = Column(Float, nullable=True)
    y_coord     = Column(Float, nullable=True)
    timestamp   = Column(DateTime, default=datetime.utcnow)

    zone = relationship("Zone")


# ── 설정 테이블 ────────────────────────────────────────────────────────────────

class AlertSettings(Base):
    __tablename__ = "alert_settings"
    alert_setting_id            = Column(Integer, primary_key=True, default=1)
    obstacle_alert              = Column(Boolean, default=True,  nullable=False)
    missing_extinguisher_alert  = Column(Boolean, default=True,  nullable=False)
    fire_alert                  = Column(Boolean, default=True,  nullable=False)
    humidity_alert              = Column(Boolean, default=True,  nullable=False)
    inspection_schedule_alert   = Column(Boolean, default=True,  nullable=False)
    updated_at                  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class InspectionSettings(Base):
    __tablename__ = "inspection_settings"
    inspection_setting_id    = Column(Integer, primary_key=True, default=1)
    inspection_cycle         = Column(Integer, default=30,   nullable=False)
    inspection_reminder      = Column(Boolean, default=True, nullable=False)
    missed_inspection_warning = Column(Boolean, default=True, nullable=False)
    updated_at               = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EmergencySettings(Base):
    __tablename__ = "emergency_settings"
    emergency_setting_id = Column(Integer, primary_key=True, default=1)
    led_auto_on    = Column(Boolean, default=True,  nullable=False)
    buzzer_auto_run = Column(Boolean, default=True, nullable=False)
    emergency_mode = Column(Boolean, default=False, nullable=False)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class VisionSettings(Base):
    __tablename__ = "vision_settings"
    vision_setting_id        = Column(Integer, primary_key=True, default=1)
    inference_interval_minutes = Column(Integer, default=30, nullable=False)
    updated_at               = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
