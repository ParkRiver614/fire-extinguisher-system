import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_BASE, apiFetch, apiJson, deviceHeaders, getToken, login, shortTestId } from "./client";

interface FloorDetail {
  zones: { zone_id: number }[];
}
interface DeviceModel {
  model_id: number;
}
interface ExtinguisherView {
  extinguisher_id: number;
}
interface SsePayload {
  type: string;
  event?: { sub?: string; text?: string };
  alert?: { extinguisher_display_id?: string };
}

/**
 * SSE 스트림에서 predicate를 만족하는 메시지가 올 때까지 읽는다.
 * 스트림은 끝나지 않는 연결이라 timeoutMs 안에 못 찾으면 실패시킨다.
 */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (payload: SsePayload) => boolean,
  timeoutMs: number,
): Promise<SsePayload> {
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const result = await Promise.race([
      reader.read(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining)),
    ]);
    if (!result || result.done) break;

    buffer += decoder.decode(result.value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      try {
        const payload = JSON.parse(dataLine.slice("data: ".length)) as SsePayload;
        if (predicate(payload)) return payload;
      } catch {
        // 파싱 안 되는 라인은 무시
      }
    }
  }
  throw new Error("SSE 스트림에서 기대한 이벤트를 제한 시간 내에 받지 못했습니다.");
}

describe("실시간 SSE 스트림 (실제 서버)", () => {
  const testMac = `AA:SS:ES:T0:00:${String(Date.now()).slice(-2)}`;
  const testId = shortTestId("ITS-");
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

  it(
    "연결하면 snapshot을 먼저 받고, 이후 발생한 이벤트가 실시간으로 도착한다",
    { timeout: 20000 },
    async () => {
      const controller = new AbortController();
      const res = await fetch(`${API_BASE}/api/events/stream?token=${encodeURIComponent(getToken())}`, {
        signal: controller.signal,
      });
      expect(res.ok).toBe(true);
      expect(res.body).not.toBeNull();
      const reader = res.body!.getReader();

      try {
        // 1) 연결 직후 snapshot 메시지가 온다
        const snapshot = await readUntil(reader, (p) => p.type === "snapshot", 10000);
        expect(snapshot.type).toBe("snapshot");

        // 2) 우리 테스트 장치에 센서 이벤트를 발생시킨다
        const sensorRes = await apiFetch("/api/sensors/update", {
          method: "POST",
          headers: deviceHeaders(),
          body: JSON.stringify({ extinguisher_id: extinguisherId, status: "obstacle_detected" }),
        });
        expect(sensorRes.ok).toBe(true);

        // 3) 그 이벤트가 실시간 스트림으로 도착하는지 확인
        const arrived = await readUntil(
          reader,
          (p) => p.type === "event.created" && !!p.event?.sub?.includes(testId),
          10000,
        );
        expect(arrived.event?.sub).toContain(testId);
      } finally {
        controller.abort();
      }
    },
  );
});
