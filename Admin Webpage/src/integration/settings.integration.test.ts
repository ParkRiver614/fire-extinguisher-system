import { beforeAll, describe, expect, it } from "vitest";
import { apiJson, login } from "./client";

interface AlertSettings {
  obstacle_alert: boolean;
  missing_extinguisher_alert: boolean;
  fire_alert: boolean;
  humidity_alert: boolean;
  inspection_schedule_alert: boolean;
}
interface InspectionSettings {
  inspection_cycle: number;
  inspection_reminder: boolean;
  missed_inspection_warning: boolean;
}
interface EmergencySettings {
  led_auto_on: boolean;
  buzzer_auto_run: boolean;
  emergency_mode: boolean;
}
interface VisionSettings {
  inference_interval_minutes: number;
}

describe("설정 API (실제 서버, 값 복원 보장)", () => {
  beforeAll(async () => {
    await login();
  });

  it("알림 설정을 조회/저장할 수 있고, 저장 후 원래 값으로 복원된다", async () => {
    const original = await apiJson<AlertSettings>("/api/settings/alerts");
    try {
      const toggled = { ...original, humidity_alert: !original.humidity_alert };
      const updated = await apiJson<AlertSettings>("/api/settings/alerts", {
        method: "PUT",
        body: JSON.stringify(toggled),
      });
      expect(updated.humidity_alert).toBe(!original.humidity_alert);

      const refetched = await apiJson<AlertSettings>("/api/settings/alerts");
      expect(refetched.humidity_alert).toBe(!original.humidity_alert);
    } finally {
      await apiJson<AlertSettings>("/api/settings/alerts", { method: "PUT", body: JSON.stringify(original) });
    }

    const restored = await apiJson<AlertSettings>("/api/settings/alerts");
    expect(restored.humidity_alert).toBe(original.humidity_alert);
  });

  it("점검 설정을 조회/저장할 수 있고, 저장 후 원래 값으로 복원된다", async () => {
    const original = await apiJson<InspectionSettings>("/api/settings/inspection");
    try {
      const toggled = { ...original, missed_inspection_warning: !original.missed_inspection_warning };
      const updated = await apiJson<InspectionSettings>("/api/settings/inspection", {
        method: "PUT",
        body: JSON.stringify(toggled),
      });
      expect(updated.missed_inspection_warning).toBe(!original.missed_inspection_warning);
    } finally {
      await apiJson<InspectionSettings>("/api/settings/inspection", { method: "PUT", body: JSON.stringify(original) });
    }

    const restored = await apiJson<InspectionSettings>("/api/settings/inspection");
    expect(restored.missed_inspection_warning).toBe(original.missed_inspection_warning);
    expect(restored.inspection_cycle).toBe(original.inspection_cycle);
  });

  it("비상 대응 설정을 조회/저장할 수 있고, 저장 후 원래 값으로 복원된다", async () => {
    const original = await apiJson<EmergencySettings>("/api/settings/emergency");
    try {
      const toggled = { ...original, buzzer_auto_run: !original.buzzer_auto_run };
      const updated = await apiJson<EmergencySettings>("/api/settings/emergency", {
        method: "PUT",
        body: JSON.stringify(toggled),
      });
      expect(updated.buzzer_auto_run).toBe(!original.buzzer_auto_run);
    } finally {
      await apiJson<EmergencySettings>("/api/settings/emergency", { method: "PUT", body: JSON.stringify(original) });
    }

    const restored = await apiJson<EmergencySettings>("/api/settings/emergency");
    expect(restored.buzzer_auto_run).toBe(original.buzzer_auto_run);
    expect(restored.emergency_mode).toBe(original.emergency_mode);
  });

  it("비전 추론 설정을 조회/저장할 수 있고, 저장 후 원래 값으로 복원된다", async () => {
    const original = await apiJson<VisionSettings>("/api/settings/vision");
    try {
      const toggled = { inference_interval_minutes: original.inference_interval_minutes + 1 };
      const updated = await apiJson<VisionSettings>("/api/settings/vision", {
        method: "PUT",
        body: JSON.stringify(toggled),
      });
      expect(updated.inference_interval_minutes).toBe(original.inference_interval_minutes + 1);
    } finally {
      await apiJson<VisionSettings>("/api/settings/vision", { method: "PUT", body: JSON.stringify(original) });
    }

    const restored = await apiJson<VisionSettings>("/api/settings/vision");
    expect(restored.inference_interval_minutes).toBe(original.inference_interval_minutes);
  });
});
