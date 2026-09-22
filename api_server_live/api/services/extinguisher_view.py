from models.models import Extinguisher, STATUS_NAME_MAP
from schemas.schemas import (
    ExtinguisherView, SensorReadingOut, MaintenanceLogOut, VisionLogOut
)


_STATUS_TO_FRONTEND = {
    "obstacle_detected": "obstacle",
    "missing":           "error",
    "fire_detected":     "fire",
    "humidity_warning":  "warning",
}


def build_extinguisher_view(e: Extinguisher) -> ExtinguisherView:
    node     = e.node
    zone     = e.zone
    floor    = node.floor if node else (zone.floor if zone else None)
    building = floor.building if floor else None
    model    = e.model
    admin    = e.admin

    # 센서 타입별 최신값 수집 (SensorLog → SensorData → SensorType)
    seen: dict[str, SensorReadingOut] = {}
    for log in sorted(e.sensor_logs, key=lambda x: (x.created_at, x.log_id)):
        for sd in log.sensor_data:
            if sd.sensor_type:
                seen[sd.sensor_type.sensor_type_name] = SensorReadingOut(
                    sensor_type_name=sd.sensor_type.sensor_type_name,
                    value=sd.value,
                    unit=sd.sensor_type.unit,
                )

    maint_logs = [
        MaintenanceLogOut(
            maintenance_id=m.maintenance_id,
            extinguisher_id=m.extinguisher_id,
            admin_id=m.admin_id,
            admin_name=m.admin.admin_name if m.admin else None,
            action_taken=m.action_taken,
            created_at=m.created_at,
        )
        for m in e.maintenance_logs
    ]

    # 최신 비전 로그 (extinguisher 직접 연결 관계 사용)
    latest_vision = None
    if e.vision_logs:
        v = max(e.vision_logs, key=lambda x: (x.created_at, x.vision_log_id))
        latest_vision = VisionLogOut(
            vision_log_id=v.vision_log_id,
            snapshot_url=v.snapshot_url,
            detected_class=v.detected_class,
            confidence_score=v.confidence_score,
            model_version=v.model_version,
            created_at=v.created_at,
        )

    frontend_status = _STATUS_TO_FRONTEND.get(e.status, e.status)

    return ExtinguisherView(
        extinguisher_id=e.extinguisher_id,
        id=e.id,
        mac_address=e.mac_address,
        ip_address=e.ip_address,
        battery_level=e.battery_level,
        last_ping_at=e.last_ping_at,
        manufacture_date=e.manufacture_date,
        install_date=e.install_date,
        expiry_date=e.expiry_date,
        status=frontend_status,
        status_name=STATUS_NAME_MAP.get(e.status, e.status),
        model_id=model.model_id       if model else None,
        model_name=model.model_name   if model else None,
        agent_type=model.agent_type   if model else None,
        total_weight=model.total_weight if model else None,
        empty_weight=model.empty_weight if model else None,
        node_id=node.floor_node_id    if node else None,
        x_coord=node.x               if node else None,
        y_coord=node.y               if node else None,
        zone_id=zone.zone_id         if zone else None,
        zone_name=zone.zone_name     if zone else None,
        floor_id=floor.floor_id      if floor else None,
        floor_name=floor.floor_name  if floor else None,
        level=floor.level            if floor else None,
        building_id=building.building_id     if building else None,
        building_name=building.building_name if building else None,
        admin_id=admin.admin_id       if admin else None,
        admin_name=admin.admin_name   if admin else None,
        admin_phone=admin.phone_number if admin else None,
        sensor_readings=list(seen.values()),
        maintenance_logs=maint_logs,
        latest_vision=latest_vision,
    )
