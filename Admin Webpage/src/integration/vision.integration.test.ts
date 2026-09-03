import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_BASE, apiFetch, apiJson, deviceHeaders, login, shortTestId } from "./client";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

interface FloorDetail {
  zones: { zone_id: number }[];
}
interface DeviceModel {
  model_id: number;
}
interface EventsResponse {
  events: { id: string; sub: string }[];
}
interface ExtinguisherView {
  extinguisher_id: number;
  id: string;
  latest_vision?: {
    detected_class: string | null;
    confidence_score: number | null;
    model_version: string | null;
    snapshot_url: string | null;
  };
}

describe("비전 감지 스냅샷 계약 테스트 (실제 서버, 하드웨어 없이 API 계약만 검증)", () => {
  const testMac = `AA:VS:ES:T0:00:${String(Date.now()).slice(-2)}`;
  const testId = shortTestId("ITV-");
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
      body: JSON.stringify({ id: testId, mac_address: testMac, zone_id: zoneId, model_id: models[0].model_id }),
    });
    extinguisherId = created.extinguisher_id;
  });

  afterAll(async () => {
    if (extinguisherId != null) {
      await apiFetch(`/api/devices/${extinguisherId}`, { method: "DELETE" });
    }
  });

  it("센서 업데이트로 비전 감지 데이터를 보내면, 장치 조회 시 latest_vision에 그대로 반영된다", async () => {
    const sensorRes = await apiFetch("/api/sensors/update", {
      method: "POST",
      headers: deviceHeaders(),
      body: JSON.stringify({
        extinguisher_id: extinguisherId,
        status: "normal",
        snapshot_url: "https://example.com/snapshots/itest.jpg",
        vision: {
          detected_class: "extinguisher",
          confidence_score: 0.97,
          model_version: "itest-v1",
        },
      }),
    });
    expect(sensorRes.ok).toBe(true);

    const devices = await apiJson<ExtinguisherView[]>("/api/devices");
    const ourDevice = devices.find((d) => d.id === testId);
    expect(ourDevice?.latest_vision?.detected_class).toBe("extinguisher");
    expect(ourDevice?.latest_vision?.confidence_score).toBeCloseTo(0.97);
    expect(ourDevice?.latest_vision?.model_version).toBe("itest-v1");
    expect(ourDevice?.latest_vision?.snapshot_url).toBe("https://example.com/snapshots/itest.jpg");
  });
  it("같은 상태로 주기 촬영본을 연달아 보내면, 스냅샷은 갱신되지만 이벤트 로그는 중복으로 쌓이지 않는다", async () => {
    const send = (snapshotUrl: string) =>
      apiFetch("/api/sensors/update", {
        method: "POST",
        headers: deviceHeaders(),
        body: JSON.stringify({
          extinguisher_id: extinguisherId,
          status: "obstacle_detected",
          snapshot_url: snapshotUrl,
        }),
      });

    // 첫 전송: 상태 전환(normal → obstacle_detected)이므로 이벤트가 하나 생긴다
    expect((await send("https://example.com/snapshots/cycle-1.jpg")).ok).toBe(true);
    const afterFirst = await apiJson<EventsResponse>("/api/events");
    const countFor = (r: EventsResponse) => r.events.filter((e) => e.sub.startsWith(testId)).length;
    const baseline = countFor(afterFirst);
    expect(baseline).toBeGreaterThan(0);

    // 두 번째 전송: 같은 상태의 주기 촬영본 — 사진만 갱신되고 이벤트는 늘지 않아야 한다
    expect((await send("https://example.com/snapshots/cycle-2.jpg")).ok).toBe(true);

    const devices = await apiJson<ExtinguisherView[]>("/api/devices");
    const ourDevice = devices.find((d) => d.id === testId);
    expect(ourDevice?.latest_vision?.snapshot_url).toBe("https://example.com/snapshots/cycle-2.jpg");

    expect(countFor(await apiJson<EventsResponse>("/api/events"))).toBe(baseline);
  });
  it("정상 사이클 스냅샷은 최신 한 장만 남고, 직전 주기 사진 파일은 서버에서 삭제된다", async () => {
    const uploadSnapshot = async () => {
      const form = new FormData();
      form.append("file", new Blob([Buffer.from(ONE_PIXEL_PNG_BASE64, "base64")], { type: "image/png" }), "cycle.png");
      form.append("mac_address", testMac);
      const { snapshot_url } = await apiJson<{ snapshot_url: string }>("/api/sensors/snapshot", {
        method: "POST",
        headers: deviceHeaders(),
        body: form,
      });
      return snapshot_url;
    };
    const reportNormal = (snapshotUrl: string) =>
      apiFetch("/api/sensors/update", {
        method: "POST",
        headers: deviceHeaders(),
        body: JSON.stringify({ extinguisher_id: extinguisherId, status: "normal", snapshot_url: snapshotUrl }),
      });
    const staticPath = (url: string) => url.slice(url.indexOf("/static/"));

    const first = await uploadSnapshot();
    expect((await reportNormal(first)).ok).toBe(true);
    expect((await fetch(`${API_BASE}${staticPath(first)}`)).status).toBe(200);

    const second = await uploadSnapshot();
    expect((await reportNormal(second)).ok).toBe(true);

    // 최신 사진만 남고, 직전 주기 사진은 파일까지 지워져야 한다
    const devices = await apiJson<ExtinguisherView[]>("/api/devices");
    expect(devices.find((d) => d.id === testId)?.latest_vision?.snapshot_url).toBe(second);
    expect((await fetch(`${API_BASE}${staticPath(second)}`)).status).toBe(200);
    expect((await fetch(`${API_BASE}${staticPath(first)}`)).status).toBe(404);
  });
});
