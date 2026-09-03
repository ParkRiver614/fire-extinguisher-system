import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiFetch, apiJson, login, shortTestId } from "./client";

interface FloorDetail {
  floor_id: number;
  zones: { zone_id: number; zone_name: string }[];
}
interface DeviceModel {
  model_id: number;
  model_name: string;
}
interface ExtinguisherView {
  extinguisher_id: number;
  id: string;
  mac_address: string;
  ip_address: string | null;
  status: string;
  zone_name: string;
  floor_name: string;
}

describe("장치 API (실제 서버)", () => {
  const testId = shortTestId("ITD-");
  const testMac = `AA:IT:ES:T0:00:${String(Date.now()).slice(-2)}`;
  let createdExtinguisherId: number | null = null;
  let zoneId: number;
  let modelId: number;

  beforeAll(async () => {
    await login();
    const floors = await apiJson<FloorDetail[]>("/api/floors/detail");
    const floorWithZone = floors.find((f) => f.zones.length > 0);
    if (!floorWithZone) throw new Error("테스트 가능한 구역(zone)이 서버에 하나도 없습니다.");
    zoneId = floorWithZone.zones[0].zone_id;

    const models = await apiJson<DeviceModel[]>("/api/devices/models");
    if (models.length === 0) throw new Error("테스트 가능한 소화기 모델이 서버에 하나도 없습니다.");
    modelId = models[0].model_id;
  });

  afterAll(async () => {
    if (createdExtinguisherId != null) {
      await apiFetch(`/api/devices/${createdExtinguisherId}`, { method: "DELETE" });
    }
  });

  it("장치 목록을 조회하면 배열을 반환한다", async () => {
    const devices = await apiJson<ExtinguisherView[]>("/api/devices");
    expect(Array.isArray(devices)).toBe(true);
  });

  it("장치를 등록하면 목록에 나타나고, 수정과 삭제가 정상 동작한다", async () => {
    const created = await apiJson<ExtinguisherView>("/api/devices", {
      method: "POST",
      body: JSON.stringify({
        id: testId,
        mac_address: testMac,
        zone_id: zoneId,
        model_id: modelId,
      }),
    });
    createdExtinguisherId = created.extinguisher_id;
    expect(created.id).toBe(testId);
    expect(created.mac_address).toBe(testMac);

    const afterCreate = await apiJson<ExtinguisherView[]>("/api/devices");
    expect(afterCreate.some((d) => d.id === testId)).toBe(true);

    const updated = await apiJson<ExtinguisherView>(`/api/devices/${created.extinguisher_id}`, {
      method: "PUT",
      body: JSON.stringify({ ip_address: "192.0.2.123" }),
    });
    expect(updated.ip_address).toBe("192.0.2.123");

    const deleteRes = await apiFetch(`/api/devices/${created.extinguisher_id}`, { method: "DELETE" });
    expect(deleteRes.ok).toBe(true);
    createdExtinguisherId = null;

    const afterDelete = await apiJson<ExtinguisherView[]>("/api/devices");
    expect(afterDelete.some((d) => d.id === testId)).toBe(false);
  });
});
