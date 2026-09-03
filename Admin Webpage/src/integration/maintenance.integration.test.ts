import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiFetch, apiJson, login, shortTestId } from "./client";

interface FloorDetail {
  zones: { zone_id: number }[];
}
interface DeviceModel {
  model_id: number;
}
interface ExtinguisherView {
  extinguisher_id: number;
}
interface MaintenanceLogOut {
  maintenance_id: number;
  extinguisher_id: number;
  action_taken: string;
}

describe("유지보수 이력 API (실제 서버)", () => {
  const testMac = `AA:MT:ES:T0:00:${String(Date.now()).slice(-2)}`;
  let extinguisherId: number;

  beforeAll(async () => {
    await login();
    const floors = await apiJson<FloorDetail[]>("/api/floors/detail");
    const floorWithZone = floors.find((f) => f.zones.length > 0);
    if (!floorWithZone) throw new Error("테스트 가능한 구역(zone)이 서버에 하나도 없습니다.");
    const zoneId = floorWithZone.zones[0].zone_id;

    const models = await apiJson<DeviceModel[]>("/api/devices/models");
    if (models.length === 0) throw new Error("테스트 가능한 소화기 모델이 서버에 하나도 없습니다.");

    const created = await apiJson<ExtinguisherView>("/api/devices", {
      method: "POST",
      body: JSON.stringify({
        id: shortTestId("ITM-"),
        mac_address: testMac,
        zone_id: zoneId,
        model_id: models[0].model_id,
      }),
    });
    extinguisherId = created.extinguisher_id;
  });

  afterAll(async () => {
    if (extinguisherId != null) {
      await apiFetch(`/api/devices/${extinguisherId}`, { method: "DELETE" });
    }
  });

  it("유지보수 이력을 추가하고, 수정하고, 삭제할 수 있다", async () => {
    const created = await apiJson<MaintenanceLogOut>(`/api/devices/${extinguisherId}/maintenance`, {
      method: "POST",
      body: JSON.stringify({ action_taken: "통합테스트: 소화약제 충전" }),
    });
    expect(created.extinguisher_id).toBe(extinguisherId);
    expect(created.action_taken).toBe("통합테스트: 소화약제 충전");

    const updated = await apiJson<MaintenanceLogOut>(
      `/api/devices/${extinguisherId}/maintenance/${created.maintenance_id}`,
      { method: "PUT", body: JSON.stringify({ action_taken: "통합테스트: 안전핀 교체" }) },
    );
    expect(updated.action_taken).toBe("통합테스트: 안전핀 교체");

    const deleteRes = await apiFetch(`/api/devices/${extinguisherId}/maintenance/${created.maintenance_id}`, {
      method: "DELETE",
    });
    expect(deleteRes.ok).toBe(true);
  });
});
