import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiFetch, apiJson, login, shortTestId } from "./client";

interface FloorDetailOut {
  floor_id: number;
  floor_name: string;
  floor_label: string | null;
  level: number;
}

describe("층 관리 API (실제 서버)", () => {
  const testFloorName = shortTestId("ITF-");
  let createdFloorId: number | null = null;

  beforeAll(async () => {
    await login();
  });

  afterAll(async () => {
    if (createdFloorId != null) {
      await apiFetch(`/api/floors/${createdFloorId}`, { method: "DELETE" });
    }
  });

  it("층 상세 목록을 조회하면 배열을 반환한다", async () => {
    const floors = await apiJson<FloorDetailOut[]>("/api/floors/detail");
    expect(Array.isArray(floors)).toBe(true);
  });

  it("층을 등록하면 목록에 나타나고, 수정과 삭제가 정상 동작한다", async () => {
    const created = await apiJson<FloorDetailOut>("/api/floors", {
      method: "POST",
      body: JSON.stringify({ floor_name: testFloorName, floor_label: "ITEST", level: 999, zone_names: [] }),
    });
    createdFloorId = created.floor_id;
    expect(created.floor_name).toBe(testFloorName);

    const afterCreate = await apiJson<FloorDetailOut[]>("/api/floors/detail");
    expect(afterCreate.some((f) => f.floor_id === createdFloorId)).toBe(true);

    const updated = await apiJson<FloorDetailOut>(`/api/floors/${createdFloorId}`, {
      method: "PUT",
      body: JSON.stringify({ floor_label: "ITEST-수정됨" }),
    });
    expect(updated.floor_label).toBe("ITEST-수정됨");

    const deleteRes = await apiFetch(`/api/floors/${createdFloorId}`, { method: "DELETE" });
    expect(deleteRes.ok).toBe(true);
    createdFloorId = null;

    const afterDelete = await apiJson<FloorDetailOut[]>("/api/floors/detail");
    expect(afterDelete.some((f) => f.floor_name === testFloorName)).toBe(false);
  });
});
