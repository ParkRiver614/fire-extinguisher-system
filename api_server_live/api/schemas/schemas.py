from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field
from typing import Optional, List, Any, Literal
from datetime import datetime, date

# models.STATUS_NAME_MAP의 키와 동일하게 유지 — 여기 없는 값은 요청 단계에서 422로 거부됨
ExtinguisherStatus = Literal[
    "normal", "obstacle_detected", "missing",
    "fire_detected", "humidity_warning", "offline", "maintenance",
]


# ── Auth ─────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str
    rememberMe: bool = False


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str


class LoginResponse(BaseModel):
    token: str
    user: UserOut


class MeResponse(BaseModel):
    user: UserOut


# ── Sensor Reading ────────────────────────────────────────
class SensorReadingOut(BaseModel):
    sensor_type_name: str
    value: float
    unit: Optional[str]


# ── Maintenance Log ───────────────────────────────────────
class MaintenanceLogOut(BaseModel):
    maintenance_id: int
    extinguisher_id: int
    admin_id: Optional[int]
    admin_name: Optional[str]
    action_taken: str
    created_at: datetime


class MaintenanceLogCreate(BaseModel):
    action_taken: str
    admin_id: Optional[int] = None


class MaintenanceLogUpdate(BaseModel):
    action_taken: str


# ── Vision Log ────────────────────────────────────────────
class VisionLogOut(BaseModel):
    vision_log_id: int
    snapshot_url: Optional[str]
    detected_class: Optional[str]
    confidence_score: Optional[float]
    model_version: Optional[str]
    created_at: datetime


# ── Extinguisher ──────────────────────────────────────────
class ExtinguisherView(BaseModel):
    extinguisher_id: int
    id: Optional[str]
    mac_address: str
    ip_address: Optional[str]
    battery_level: Optional[int]
    last_ping_at: Optional[datetime]
    manufacture_date: Optional[date]
    install_date: Optional[date]
    expiry_date: Optional[date]

    status: str
    status_name: str

    model_id: Optional[int]
    model_name: Optional[str]
    agent_type: Optional[str]
    total_weight: Optional[float]
    empty_weight: Optional[float]

    node_id: Optional[int]
    x_coord: Optional[float]
    y_coord: Optional[float]
    zone_id: Optional[int]
    zone_name: Optional[str]
    floor_id: Optional[int]
    floor_name: Optional[str]
    level: Optional[int]
    building_id: Optional[int]
    building_name: Optional[str]

    admin_id: Optional[int]
    admin_name: Optional[str]
    admin_phone: Optional[str]

    sensor_readings: List[SensorReadingOut] = []
    maintenance_logs: List[MaintenanceLogOut] = []
    latest_vision: Optional[VisionLogOut]

    class Config:
        pass


# ── Admin ─────────────────────────────────────────────────────────
class AdminOut(BaseModel):
    admin_id: int
    admin_name: str
    email: EmailStr
    role: str
    phone_number: Optional[str]
    assigned_floor_id: Optional[int]
    assigned_floor_name: Optional[str]
    created_at: datetime
    last_login: Optional[datetime]


class AdminCreate(BaseModel):
    admin_name: str
    email: EmailStr
    password: str
    role: str = "operator"
    phone_number: Optional[str] = None
    assigned_floor_id: Optional[int] = None


class AdminUpdate(BaseModel):
    admin_name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    role: Optional[str] = None
    phone_number: Optional[str] = None
    assigned_floor_id: Optional[int] = None


# ── Alerts / Events ───────────────────────────────────────────────
class AlertOut(BaseModel):
    id: str
    extinguisher_id: int
    extinguisher_display_id: Optional[str]
    zone: Optional[str]
    type: str
    detail: Optional[str]
    status: str
    created_at: datetime


class AlertsResponse(BaseModel):
    alerts: List[AlertOut] = []


class EventOut(BaseModel):
    id: str
    type: str
    text: str
    sub: Optional[str]
    time: str
    timestamp: datetime


class EventsResponse(BaseModel):
    events: List[EventOut] = []


# ── Floors / Map ─────────────────────────────────────────────────
class FloorListResponse(BaseModel):
    floors: List[str] = []


class FloorMapNodeOut(BaseModel):
    id: str
    x: float
    y: float
    type: str


class FloorMapEdgeOut(BaseModel):
    from_: str = Field(..., alias="from")
    to: str
    weight: float


class FloorMapResponse(BaseModel):
    floor: str
    imageRatio: Optional[float]
    nodes: List[FloorMapNodeOut]
    edges: List[FloorMapEdgeOut]
    exitNodeIds: List[str]
    extinguisherNodeIds: List[str]


# ── Map / Navigation ──────────────────────────────────────────────
class NodeOut(BaseModel):
    floor_node_id: str
    x: float
    y: float
    node_type: str
    is_blocked: bool


class MapResponse(BaseModel):
    nodes: List[NodeOut]
    edges: List[Any]
    extinguisher_nodes: dict = {}


class RouteRequest(BaseModel):
    floor: str
    current_user_node: str
    route_type: str


class RouteResponse(BaseModel):
    route_type: str
    target_node: str
    route: List[str]


# ── Map admin helpers ────────────────────────────────────────────
class PixelConvertRequest(BaseModel):
    pixel_x: float
    pixel_y: float
    image_width: float
    image_height: float


class PixelConvertResponse(BaseModel):
    x_percent: float
    y_percent: float


class EdgeCreate(BaseModel):
    from_node_id: int
    to_node_id: int
    weight: float


class NodeCreate(BaseModel):
    floor_node_id: int
    x_coord: float
    y_coord: float
    node_type: Optional[str] = "normal"
    zone_id: Optional[int] = None


class NodeUpdate(BaseModel):
    x_coord: Optional[float] = None
    y_coord: Optional[float] = None
    node_type: Optional[str] = None
    is_blocked: Optional[bool] = None
    zone_id: Optional[int] = None


# ── Extinguisher create/update / sensor update ────────────────────
class ExtinguisherCreate(BaseModel):
    id: Optional[str] = None
    node_id: Optional[int] = None
    zone_id: Optional[int] = None
    model_id: Optional[int] = None
    mac_address: str
    ip_address: Optional[str] = None
    manufacture_date: Optional[date] = None
    install_date: Optional[date] = None
    expiry_date: Optional[date] = None
    admin_id: Optional[int] = None
    x_coord: Optional[float] = None
    y_coord: Optional[float] = None


class ExtinguisherUpdate(BaseModel):
    id: Optional[str] = None
    node_id: Optional[int] = None
    zone_id: Optional[int] = None
    model_id: Optional[int] = None
    mac_address: Optional[str] = None
    ip_address: Optional[str] = None
    manufacture_date: Optional[date] = None
    install_date: Optional[date] = None
    expiry_date: Optional[date] = None
    admin_id: Optional[int] = None
    x_coord: Optional[float] = None
    y_coord: Optional[float] = None
    status: Optional[ExtinguisherStatus] = None
    battery_level: Optional[int] = None


class VisionIn(BaseModel):
    detected_class: Optional[str] = None
    confidence_score: Optional[float] = None
    model_version: Optional[str] = None


class SensorReadingIn(BaseModel):
    sensor_type_name: str
    value: float
    unit: Optional[str] = None


class SensorUpdateRequest(BaseModel):
    # 과도기 지원: 기존 클라이언트는 extinguisher_id로, 새 클라이언트는
    # 자신의 실제 mac_address로 장치를 식별할 수 있음 (mac_address 우선)
    extinguisher_id: Optional[int] = None
    mac_address: Optional[str] = None
    status: ExtinguisherStatus
    battery_level: Optional[int] = None
    ip_address: Optional[str] = None
    sensor_readings: Optional[List[SensorReadingIn]] = []
    vision: Optional[VisionIn] = None
    snapshot_url: Optional[str] = None


# ── Extinguisher Model ───────────────────────────────────────────
class ExtinguisherModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    model_id: int
    model_name: str
    agent_type: str
    total_weight: float
    empty_weight: float


# ── Alert Settings ────────────────────────────────────────────────
class AlertSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    obstacle_alert: bool
    missing_extinguisher_alert: bool
    fire_alert: bool
    humidity_alert: bool
    inspection_schedule_alert: bool
    updated_at: Optional[datetime]


class AlertSettingsUpdate(BaseModel):
    obstacle_alert: Optional[bool] = None
    missing_extinguisher_alert: Optional[bool] = None
    fire_alert: Optional[bool] = None
    humidity_alert: Optional[bool] = None
    inspection_schedule_alert: Optional[bool] = None


# ── Inspection Settings ───────────────────────────────────────────
class InspectionSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    inspection_cycle: int
    inspection_reminder: bool
    missed_inspection_warning: bool
    updated_at: Optional[datetime]


class InspectionSettingsUpdate(BaseModel):
    inspection_cycle: Optional[int] = None
    inspection_reminder: Optional[bool] = None
    missed_inspection_warning: Optional[bool] = None


# ── Emergency Settings ────────────────────────────────────────────
class EmergencySettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    led_auto_on: bool
    buzzer_auto_run: bool
    emergency_mode: bool
    updated_at: Optional[datetime]


class EmergencySettingsUpdate(BaseModel):
    led_auto_on: Optional[bool] = None
    buzzer_auto_run: Optional[bool] = None
    emergency_mode: Optional[bool] = None


# ── Vision Settings ─────────────────────────────────────────────
class VisionSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    inference_interval_minutes: int
    updated_at: Optional[datetime]


class VisionSettingsUpdate(BaseModel):
    inference_interval_minutes: Optional[int] = None


# ── Floor / Zone CRUD ────────────────────────────────────────────
class ZoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    zone_id: int
    zone_name: str
    floor_id: int


class FloorDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    floor_id: int
    floor_name: str
    floor_label: Optional[str]
    level: int
    image_key: Optional[str] = None
    image_ratio: Optional[float] = None
    hydrant_positions: Optional[List[dict]] = None
    zones: List[ZoneOut] = []


class FloorImageOut(BaseModel):
    image_key: str
    image_url: str
    image_ratio: float


class FloorCreate(BaseModel):
    floor_name: str
    floor_label: Optional[str] = None
    level: int = 0
    zone_names: List[str] = []
    hydrant_positions: Optional[List[dict]] = None


class FloorUpdate(BaseModel):
    floor_name: Optional[str] = None
    floor_label: Optional[str] = None
    level: Optional[int] = None
    zone_names: Optional[List[str]] = None
    hydrant_positions: Optional[List[dict]] = None


# ── Emergency / Misc ────────────────────────────────────────────
class EmergencyAlertRequest(BaseModel):
    zone_id: int
    fire_level: str


class EmergencyAlertResponse(BaseModel):
    success: bool
    activated_devices: int = 0