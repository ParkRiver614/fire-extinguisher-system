import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiFetch, apiJson, deviceHeaders, login, shortTestId } from "./client";

interface AlertOut {
  id: string;
  extinguisher_id: number;
  status: string;
}
interface EventOut {
  id: string;
  type: string;
  text: string;
}
interface FloorDetail {
  zones: { zone_id: number }[];
}
interface DeviceModel {
  model_id: number;
}
interface ExtinguisherView {
  extinguisher_id: number;
}

describe("알림 API (실제 서버, 읽기 전용)", () => {
  beforeAll(async () => {
    await login();
  });

  it("알림 목록을 조회하면 alerts 배열을 반환한다", async () => {
    const body = await apiJson<{ alerts: AlertOut[] }>("/api/alerts");
    expect(Array.isArray(body.alerts)).toBe(true);
    for (const alert of body.alerts) {
      expect(["active", "resolved"]).toContain(alert.status);
    }
  });

  it("이벤트 로그 목록을 조회하면 events 배열을 반환한다", async () => {
    const body = await apiJson<{ events: EventOut[] }>("/api/events");
    expect(Array.isArray(body.events)).toBe(true);
  });
});

describe("알림 해결 처리 API (실제 서버, 자체 생성한 테스트 알림만 사용)", () => {
  const testMac = `AA:AL:ES:T0:00:${String(Date.now()).slice(-2)}`;
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
        id: shortTestId("ITA-"),
        mac_address: testMac,
        zone_id: zoneId,
        model_id: models[0].model_id,
      }),
    });
    extinguisherId = created.extinguisher_id;
  });

  afterAll(async () => {
    // 장치를 지우면 연결된 테스트 알림/이벤트 로그도 함께 정리됨 (cascade delete)
    if (extinguisherId != null) {
      await apiFetch(`/api/devices/${extinguisherId}`, { method: "DELETE" });
    }
  });

  it("센서 상태 업데이트로 알림을 발생시키고, 해결 처리하면 상태가 resolved로 바뀐다", async () => {
    // /api/sensors/update는 Edge 장치용 엔드포인트 — X-Device-Key로 장치 인증
    const sensorRes = await apiFetch("/api/sensors/update", {
      method: "POST",
      headers: deviceHeaders(),
      body: JSON.stringify({ extinguisher_id: extinguisherId, status: "obstacle_detected" }),
    });
    expect(sensorRes.ok).toBe(true);

    const body = await apiJson<{ alerts: AlertOut[] }>("/api/alerts?status=active");
    const ourAlert = body.alerts.find((a) => a.extinguisher_id === extinguisherId);
    expect(ourAlert).toBeDefined();

    const resolveResult = await apiJson<{ alert: { id: string; status: string } }>(
      `/api/alerts/${ourAlert!.id}/resolve`,
      { method: "POST" },
    );
    expect(resolveResult.alert.status).toBe("resolved");
  });
});
