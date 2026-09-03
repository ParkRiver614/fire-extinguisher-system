import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceDetail } from "./DeviceDetail";
import { ExtinguisherView, MaintenanceLog } from "../types";
import type { Alert } from "./Alerts";
import * as downloadModule from "../utils/download";

function makeLog(overrides: Partial<MaintenanceLog> = {}): MaintenanceLog {
  return {
    maintenance_id: 1,
    extinguisher_id: 1,
    admin_id: 1,
    admin_name: "홍길동",
    action_taken: "소화약제 충전",
    created_at: "2026-06-01T00:00:00",
    ...overrides,
  };
}

function makeDevice(overrides: Partial<ExtinguisherView> = {}): ExtinguisherView {
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
    floor_name: "1F",
    level: 1,
    building_id: 1,
    building_name: "본관",
    sensor_readings: [],
    maintenance_logs: [],
    ...overrides,
  };
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "a1",
    timestamp: "07-06 10:00",
    timestampFull: "2026-07-06 10:00:00",
    zone: "1층 로비",
    extinguisherId: "FE-101",
    type: "Fire",
    detail: "센서 이상 감지",
    status: "active",
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DeviceDetail", () => {
  it("renders core device info", () => {
    render(<DeviceDetail device={makeDevice()} />);
    expect(screen.getByText("FE-101")).toBeInTheDocument();
    expect(screen.getByText("상태: 정상")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("shows an empty state for maintenance logs and alerts when there are none", () => {
    render(<DeviceDetail device={makeDevice()} />);
    expect(screen.getByText("기록 없음")).toBeInTheDocument();
    expect(screen.getByText("알림 없음")).toBeInTheDocument();
  });

  it("only shows alerts belonging to this device", () => {
    const alerts = [
      makeAlert({ id: "a1", extinguisherId: "FE-101", detail: "이 장치 알림" }),
      makeAlert({ id: "a2", extinguisherId: "FE-999", detail: "다른 장치 알림" }),
    ];
    render(<DeviceDetail device={makeDevice()} alerts={alerts} />);

    expect(screen.getByText("이 장치 알림")).toBeInTheDocument();
    expect(screen.queryByText("다른 장치 알림")).not.toBeInTheDocument();
  });

  it("expands maintenance logs beyond the preview count", async () => {
    const user = userEvent.setup();
    const logs = [
      makeLog({ maintenance_id: 1, action_taken: "작업 1" }),
      makeLog({ maintenance_id: 2, action_taken: "작업 2" }),
      makeLog({ maintenance_id: 3, action_taken: "작업 3" }),
    ];
    render(<DeviceDetail device={makeDevice({ maintenance_logs: logs })} />);

    expect(screen.queryByText("작업 3")).not.toBeInTheDocument();
    await user.click(screen.getByText("1개 더 보기"));
    expect(screen.getByText("작업 3")).toBeInTheDocument();
  });

  it("starts maintenance and calls onUpdateDevice with maintenance status", async () => {
    const user = userEvent.setup();
    const onUpdateDevice = vi.fn();
    render(<DeviceDetail device={makeDevice({ status: "normal" })} onUpdateDevice={onUpdateDevice} />);

    await user.click(screen.getByRole("button", { name: /유지보수 시작/ }));

    await waitFor(() => expect(onUpdateDevice).toHaveBeenCalledWith(
      expect.objectContaining({ status: "maintenance", status_name: "유지보수" }),
    ));
  });

  it("opens the complete-maintenance modal for a device already under maintenance", async () => {
    const user = userEvent.setup();
    render(<DeviceDetail device={makeDevice({ status: "maintenance", status_name: "유지보수" })} onUpdateDevice={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "유지보수 완료" }));

    expect(await screen.findByPlaceholderText("예: 소화약제 충전, 안전핀 교체, 본체 외관 점검 등")).toBeInTheDocument();
  });

  it("completes maintenance with a note and appends a new maintenance log", async () => {
    const user = userEvent.setup();
    const onUpdateDevice = vi.fn();
    (fetch as any).mockImplementation((url: string) => {
      if (url.includes("/maintenance")) {
        return Promise.resolve({ ok: true, json: async () => makeLog({ maintenance_id: 2, action_taken: "필터 교체" }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    render(<DeviceDetail device={makeDevice({ status: "maintenance", status_name: "유지보수" })} onUpdateDevice={onUpdateDevice} />);

    await user.click(screen.getByRole("button", { name: "유지보수 완료" }));
    await user.type(screen.getByPlaceholderText("예: 소화약제 충전, 안전핀 교체, 본체 외관 점검 등"), "필터 교체");
    await user.click(screen.getByRole("button", { name: "완료 처리" }));

    await waitFor(() => expect(onUpdateDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "normal",
        maintenance_logs: expect.arrayContaining([expect.objectContaining({ action_taken: "필터 교체" })]),
      }),
    ));
  });

  it("deletes a maintenance log via the delete action", async () => {
    const user = userEvent.setup();
    const onUpdateDevice = vi.fn();
    const log = makeLog({ maintenance_id: 1, action_taken: "작업 1" });
    render(<DeviceDetail device={makeDevice({ maintenance_logs: [log] })} onUpdateDevice={onUpdateDevice} />);

    await user.click(screen.getByTitle("삭제"));

    await waitFor(() => expect(onUpdateDevice).toHaveBeenCalledWith(
      expect.objectContaining({ maintenance_logs: [] }),
    ));
  });

  it("triggers a report download when clicking the download button", async () => {
    const user = userEvent.setup();
    const downloadSpy = vi.spyOn(downloadModule, "downloadTextFile").mockImplementation(() => {});
    render(<DeviceDetail device={makeDevice()} />);

    await user.click(screen.getByRole("button", { name: "보고서 다운로드" }));

    expect(downloadSpy).toHaveBeenCalledWith(
      "FE-101-report.txt",
      expect.stringContaining("Device ID  : FE-101"),
    );
  });
});
