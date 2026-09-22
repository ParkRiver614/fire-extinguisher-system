import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Settings } from "./Settings";

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body } as Response);
}

const defaultAlerts = {
  obstacle_alert: true,
  missing_extinguisher_alert: true,
  fire_alert: true,
  humidity_alert: true,
  inspection_schedule_alert: true,
};
const defaultInspection = { inspection_cycle: 30, inspection_reminder: true, missed_inspection_warning: true };
const defaultEmergency = { led_auto_on: true, buzzer_auto_run: true, emergency_mode: false };
const defaultVision = { inference_interval_minutes: 30 };

function mockFetchImpl(overrides: Partial<Record<string, unknown>> = {}) {
  return vi.fn((url: string) => {
    if (url.includes("/api/floors/detail")) return jsonResponse(overrides.floors ?? []);
    if (url.includes("/api/settings/alerts")) return jsonResponse(overrides.alerts ?? defaultAlerts);
    if (url.includes("/api/settings/inspection")) return jsonResponse(overrides.inspection ?? defaultInspection);
    if (url.includes("/api/settings/emergency")) return jsonResponse(overrides.emergency ?? defaultEmergency);
    if (url.includes("/api/settings/vision")) return jsonResponse(overrides.vision ?? defaultVision);
    return jsonResponse({});
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetchImpl());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Settings", () => {
  it("renders the alerts category by default with loaded toggle states", async () => {
    render(<Settings />);
    expect(screen.getByRole("heading", { name: "알림 관리", level: 1 })).toBeInTheDocument();
    await screen.findByText("장애물 감지 알림");
    expect(screen.getByText("소화기 이탈 알림")).toBeInTheDocument();
    expect(screen.getByText("화재 발생 알림")).toBeInTheDocument();
    expect(screen.getByText("습도 경고 알림")).toBeInTheDocument();
  });

  it("switches category panels when clicking the sidebar items", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await screen.findByText("장애물 감지 알림");

    await user.click(screen.getByText("점검 관리"));
    expect(await screen.findByRole("heading", { name: "점검 관리", level: 1 })).toBeInTheDocument();

    await user.click(screen.getByText("비상 대응 설정"));
    expect(await screen.findByRole("heading", { name: "비상 대응 설정", level: 1 })).toBeInTheDocument();
  });

  it("enables the cancel button only after a toggle is changed, and cancel reverts it", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await screen.findByText("장애물 감지 알림");

    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();

    const fireRow = screen.getByText("화재 발생 알림").closest("div.flex.items-start") as HTMLElement;
    await user.click(within(fireRow).getByRole("button"));

    expect(screen.getByRole("button", { name: "취소" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
  });

  it("saves alert settings and shows a success message", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await screen.findByText("장애물 감지 알림");

    const fireRow = screen.getByText("화재 발생 알림").closest("div.flex.items-start") as HTMLElement;
    await user.click(within(fireRow).getByRole("button"));
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));

    expect(await screen.findByText("설정이 성공적으로 저장되었습니다.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/settings/alerts"),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("shows an error message when saving fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === "PUT") return jsonResponse({}, false);
        return mockFetchImpl()(url);
      }),
    );
    const user = userEvent.setup();
    render(<Settings />);
    await screen.findByText("장애물 감지 알림");

    const fireRow = screen.getByText("화재 발생 알림").closest("div.flex.items-start") as HTMLElement;
    await user.click(within(fireRow).getByRole("button"));
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));

    expect(await screen.findByText(/저장에 실패했습니다/)).toBeInTheDocument();
  });

  it("saves inspection settings and shows a success message", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await screen.findByText("장애물 감지 알림");

    await user.click(screen.getByText("점검 관리"));
    await screen.findByText("미점검 경고");

    const warningRow = screen.getByText("미점검 경고").closest("div.flex.items-start") as HTMLElement;
    await user.click(within(warningRow).getByRole("button"));
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));

    expect(await screen.findByText("설정이 성공적으로 저장되었습니다.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/settings/inspection"),
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ inspection_cycle: 30, inspection_reminder: true, missed_inspection_warning: false }) }),
    );
  });

  it("saves emergency settings and shows a success message", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await screen.findByText("장애물 감지 알림");

    await user.click(screen.getByText("비상 대응 설정"));
    await screen.findByText("비상 모드 활성화");

    const emergencyRow = screen.getByText("비상 모드 활성화").closest("div.flex.items-start") as HTMLElement;
    await user.click(within(emergencyRow).getByRole("button"));
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));

    expect(await screen.findByText("설정이 성공적으로 저장되었습니다.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/settings/emergency"),
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ led_auto_on: true, buzzer_auto_run: true, emergency_mode: true }) }),
    );
  });

  it("lists floors in the zones tab and supports adding a new floor", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetchImpl({ floors: [{ floor_id: 1, floor_name: "1층 (Floor 1)", floor_label: "1F", level: 1, image_key: null, zones: [{ zone_id: 1, zone_name: "로비" }] }] }),
    );
    render(<Settings />);
    await screen.findByText("장애물 감지 알림");

    await user.click(screen.getByText("층·구역 관리"));
    expect((await screen.findAllByText("1층 (Floor 1)")).length).toBeGreaterThan(0);

    await user.click(screen.getByText("층 추가"));
    expect((await screen.findAllByText("2층")).length).toBeGreaterThan(0);
  });
});
