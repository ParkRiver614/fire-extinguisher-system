import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiFetch, apiJson, login, shortTestId } from "./client";

// 1x1 투명 PNG (실제 이미지 파일이어야 서버가 Pillow로 열어서 비율을 계산할 수 있음)
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

interface FloorDetailOut {
  floor_id: number;
  floor_name: string;
  image_key: string | null;
}
interface FloorImageOut {
  image_key: string;
  image_url: string;
  image_ratio: number;
}

describe("층 도면 이미지 API (실제 서버)", () => {
  let floorId: number;

  beforeAll(async () => {
    await login();
    const created = await apiJson<FloorDetailOut>("/api/floors", {
      method: "POST",
      body: JSON.stringify({ floor_name: shortTestId("ITI-"), floor_label: "ITEST-IMG", level: 999, zone_names: [] }),
    });
    floorId = created.floor_id;
  });

  afterAll(async () => {
    if (floorId != null) {
      await apiFetch(`/api/floors/${floorId}`, { method: "DELETE" });
    }
  });

  it("이미지를 업로드하면 층 상세 조회에 반영되고, 삭제하면 다시 사라진다", async () => {
    const bytes = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64");
    const blob = new Blob([bytes], { type: "image/png" });
    const form = new FormData();
    form.append("file", blob, "test.png");

    const uploaded = await apiJson<FloorImageOut>(`/api/floors/${floorId}/image`, {
      method: "POST",
      body: form,
    });
    expect(uploaded.image_key).toBeTruthy();
    expect(uploaded.image_ratio).toBeGreaterThan(0);

    const afterUpload = await apiJson<FloorDetailOut[]>("/api/floors/detail");
    const ourFloor = afterUpload.find((f) => f.floor_id === floorId);
    expect(ourFloor?.image_key).toBe(uploaded.image_key);

    const deleteRes = await apiFetch(`/api/floors/${floorId}/image`, { method: "DELETE" });
    expect(deleteRes.ok).toBe(true);

    const afterDelete = await apiJson<FloorDetailOut[]>("/api/floors/detail");
    const ourFloorAfterDelete = afterDelete.find((f) => f.floor_id === floorId);
    expect(ourFloorAfterDelete?.image_key).toBeNull();
  });

  it("이미지가 아닌 파일을 업로드하면 400 에러를 반환한다", async () => {
    const blob = new Blob([Buffer.from("not an image")], { type: "text/plain" });
    const form = new FormData();
    form.append("file", blob, "test.txt");

    const res = await apiFetch(`/api/floors/${floorId}/image`, { method: "POST", body: form });
    expect(res.status).toBe(400);
  });
});
