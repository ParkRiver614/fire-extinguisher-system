import { Device } from "../types";

export function getDefaultMapPosition(_zone_name: string): { x_coord: number; y_coord: number } {
  return { x_coord: 50.00, y_coord: 50.00 };
}

export function nextExtinguisherId(devices: Device[]): number {
  return Math.max(0, ...devices.map((d) => d.extinguisher_id)) + 1;
}

export function normalizeDevice(device: Device): Device {
  const fallback = getDefaultMapPosition(device.zone_name ?? "");
  return {
    ...device,
    status: device.status ?? "normal",
    status_name: device.status_name ?? "정상",
    sensor_readings: device.sensor_readings ?? [],
    maintenance_logs: device.maintenance_logs ?? [],
    x_coord: device.x_coord ?? fallback.x_coord,
    y_coord: device.y_coord ?? fallback.y_coord,
  };
}
