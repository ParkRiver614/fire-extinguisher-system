import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Reports } from "./Reports";
import * as downloadModule from "../utils/download";
import { Alert } from "./Alerts";
import { Device } from "../types";

function makeDevice(overrides: Partial<Device> = {}): Device {
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
    id: "AL-1001",
    timestamp: "10:00",
    timestampFull: "2026-07-06 10:00:00",
    zone: "1층 로비",
    extinguisherId: "FE-101",
    type: "Fire",
    detail: "화재 감지",
    status: "active",
    ...overrides,
  };
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("Reports", () => {
  it("shows KPI counts for total, issue, and low-battery devices", () => {
    const devices = [
      makeDevice({ extinguisher_id: 1, status: "normal" }),
      makeDevice({ extinguisher_id: 2, status: "warning", battery_level: 15 }),
    ];
    render(<Reports devices={devices} />);

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("전체 소화기")).toBeInTheDocument();
    expect(screen.getByText("이상 장치")).toBeInTheDocument();
  });

  it("shows a proper label for devices with obstacle status", () => {
    const devices = [
      makeDevice({ extinguisher_id: 1, status: "normal" }),
      makeDevice({ extinguisher_id: 2, status: "normal" }),
      makeDevice({ extinguisher_id: 3, status: "obstacle", status_name: "obstacle" }),
    ];
    render(<Reports devices={devices} />);

    expect(screen.getByText("정상")).toBeInTheDocument();
    expect(screen.getByText("장애물")).toBeInTheDocument();
  });

  it("shows a status label for devices with a status unknown to the frontend", () => {
    const devices = [
      makeDevice({ extinguisher_id: 1, status: "normal" }),
      makeDevice({ extinguisher_id: 2, status: "no_such_status" as Device["status"], status_name: "정의되지 않은 상태" }),
    ];
    render(<Reports devices={devices} />);

    expect(screen.getByText("정상")).toBeInTheDocument();
    expect(screen.getByText("정의되지 않은 상태")).toBeInTheDocument();
  });

  it("shows the low battery empty state when no devices are low on battery", () => {
    render(<Reports devices={[makeDevice({ battery_level: 90 })]} />);
    expect(screen.getByText("배터리 부족 장치 없음")).toBeInTheDocument();
  });

  it("lists devices with low battery", () => {
    render(<Reports devices={[makeDevice({ id: "FE-101", battery_level: 10 })]} />);
    expect(screen.getAllByText("FE-101").length).toBeGreaterThan(0);
    expect(screen.getByText("10%")).toBeInTheDocument();
  });

  it("does not treat a device with no battery reading as low battery", () => {
    render(<Reports devices={[makeDevice({ id: "FE-101", battery_level: null as unknown as number })]} />);
    expect(screen.getByText("배터리 부족 장치 없음")).toBeInTheDocument();
  });

  it("shows unresolved alert count and navigates to alerts on 바로가기 click", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(
      <Reports
        devices={[]}
        alerts={[makeAlert({ id: "AL-1", status: "active" }), makeAlert({ id: "AL-2", status: "resolved" })]}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByText("미처리 알림")).toBeInTheDocument();
    await user.click(screen.getByText("바로가기"));
    expect(onNavigate).toHaveBeenCalledWith("alerts");
  });

  it("exports devices as CSV when clicking CSV export", async () => {
    const toCsvSpy = vi.spyOn(downloadModule, "toCsv");
    const downloadSpy = vi.spyOn(downloadModule, "downloadTextFile").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<Reports devices={[makeDevice({ id: "FE-101" })]} />);

    await user.click(screen.getByText("내보내기"));
    await user.click(screen.getByText("CSV 내보내기"));

    expect(toCsvSpy).toHaveBeenCalledWith([expect.objectContaining({ id: "FE-101" })]);
    expect(downloadSpy).toHaveBeenCalledWith("firewatch-report.csv", expect.any(String), "text/csv;charset=utf-8");
  });

  it("HTML-escapes user-controlled fields before writing the PDF export window (XSS regression)", async () => {
    const maliciousDevice = makeDevice({
      id: "FE-101",
      floor_name: `<img src=x onerror=alert(1)>`,
      zone_name: `</td><script>alert('zone')</script>`,
      admin_name: `"><script>alert('admin')</script>`,
      maintenance_logs: [
        {
          maintenance_id: 1,
          extinguisher_id: 1,
          admin_id: 1,
          admin_name: `<script>alert('log-admin')</script>`,
          action_taken: `<img src=x onerror=alert('action')>`,
          created_at: "2026-07-06T10:00:00",
        },
      ],
    });

    let writtenHtml = "";
    const fakePrintWindow = {
      document: {
        write: (html: string) => { writtenHtml = html; },
        close: () => {},
      },
      addEventListener: () => {},
      focus: () => {},
      print: () => {},
    };
    vi.spyOn(window, "open").mockReturnValue(fakePrintWindow as unknown as Window);

    const user = userEvent.setup();
    render(<Reports devices={[maliciousDevice]} />);

    await user.click(screen.getByText("내보내기"));
    await user.click(screen.getByText("PDF 인쇄"));

    expect(writtenHtml).not.toContain("<script>alert");
    expect(writtenHtml).not.toContain("<img src=x onerror=");
    expect(writtenHtml).toContain("&lt;script&gt;alert(&#39;admin&#39;)&lt;/script&gt;");
    expect(writtenHtml).toContain("&lt;img src=x onerror=alert(&#39;action&#39;)&gt;");
  });

});
