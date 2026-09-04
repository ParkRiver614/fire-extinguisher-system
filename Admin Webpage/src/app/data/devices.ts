import { Device } from "../types";

// 위치가 지정되지 않은 소화기의 기본 좌표 — 평면도 한가운데에 두고 관리자가 끌어다 배치한다.
export function getDefaultMapPosition(_zone_name: string): { x_coord: number; y_coord: number } {
  return { x_coord: 50.00, y_coord: 50.00 };
}

// 새 소화기에 부여할 임시 ID(기존 최대값+1) — 서버 저장 전 화면에서만 쓰는 값.
export function nextExtinguisherId(devices: Device[]): number {
  return Math.max(0, ...devices.map((d) => d.extinguisher_id)) + 1;
}

// 서버 응답에 빠진 필드를 기본값으로 채워, 화면이 undefined를 만나지 않게 한다.
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
