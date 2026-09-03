import { describe, expect, it } from "vitest";
import { getDefaultMapPosition, nextExtinguisherId, normalizeDevice } from "./devices";
import { Device } from "../types";

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    extinguisher_id: 1,
    id: "FE-101",
    mac_address: "AA:BB:CC:DD:EE:FF",
    ip_address: "192.168.0.1",
    battery_level: 90,
    last_ping_at: "2026-07-06T10:00:00",
    install_date: "2024-01-01",
    expiry_date: "2029-01-01",
    status: "normal",
    status_name: "정상",
    model_id: 1,
    model_name: "ABC",
    agent_type: "powder",
    total_weight: 5,
    empty_weight: 2,
    node_id: 1,
    x_coord: 10,
    y_coord: 20,
    zone_id: 1,
    zone_name: "1층 로비",
    floor_id: 1,
    floor_name: "1층",
    level: 1,
    building_id: 1,
    building_name: "본관",
    sensor_readings: [],
    maintenance_logs: [],
    ...overrides,
  };
}

describe("getDefaultMapPosition", () => {
  it("returns a fixed fallback coordinate regardless of zone", () => {
    expect(getDefaultMapPosition("1층 로비")).toEqual({ x_coord: 50, y_coord: 50 });
    expect(getDefaultMapPosition("")).toEqual({ x_coord: 50, y_coord: 50 });
  });
});

describe("nextExtinguisherId", () => {
  it("returns 1 for an empty device list", () => {
    expect(nextExtinguisherId([])).toBe(1);
  });

  it("returns one greater than the maximum existing id", () => {
    const devices = [makeDevice({ extinguisher_id: 3 }), makeDevice({ extinguisher_id: 7 }), makeDevice({ extinguisher_id: 2 })];
    expect(nextExtinguisherId(devices)).toBe(8);
  });
});

describe("normalizeDevice", () => {
  it("passes through a fully populated device unchanged", () => {
    const device = makeDevice();
    expect(normalizeDevice(device)).toEqual(device);
  });

  it("fills in missing status fields with defaults", () => {
    const device = makeDevice({ status: undefined, status_name: undefined } as unknown as Partial<Device>);
    const result = normalizeDevice(device);
    expect(result.status).toBe("normal");
    expect(result.status_name).toBe("정상");
  });

  it("defaults sensor_readings and maintenance_logs to empty arrays", () => {
    const device = makeDevice({ sensor_readings: undefined, maintenance_logs: undefined } as unknown as Partial<Device>);
    const result = normalizeDevice(device);
    expect(result.sensor_readings).toEqual([]);
    expect(result.maintenance_logs).toEqual([]);
  });

  it("falls back to default map position when coordinates are missing", () => {
    const device = makeDevice({ x_coord: undefined, y_coord: undefined } as unknown as Partial<Device>);
    const result = normalizeDevice(device);
    expect(result.x_coord).toBe(50);
    expect(result.y_coord).toBe(50);
  });

  it("preserves explicit coordinates over the fallback", () => {
    const device = makeDevice({ x_coord: 12.5, y_coord: 88.25 });
    const result = normalizeDevice(device);
    expect(result.x_coord).toBe(12.5);
    expect(result.y_coord).toBe(88.25);
  });
});
