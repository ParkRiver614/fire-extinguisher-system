import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Header } from "./Header";
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

describe("Header", () => {
  it("shows the page title and subtitle for the active page", () => {
    render(<Header activePage="dashboard" />);
    expect(screen.getByText("실시간 모니터링")).toBeInTheDocument();
    expect(screen.getByText("Live Dashboard")).toBeInTheDocument();
  });

  it("shows a back button with the device id when showBack is set", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<Header activePage="devices" showBack onBack={onBack} deviceId="FE-101" />);

    expect(screen.getByText("FE-101")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /돌아가기/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows matching device suggestions while typing and runs a search on selection", async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();
    render(
      <Header
        activePage="dashboard"
        onSearch={onSearch}
        devices={[makeDevice({ id: "FE-101" }), makeDevice({ id: "FE-202", extinguisher_id: 2 })]}
      />,
    );

    await user.type(screen.getByPlaceholderText("장치 ID, 알림 ID 검색"), "FE-1");
    const suggestion = await screen.findByText(
      (_, element) => element?.tagName.toLowerCase() === "span" && element.textContent === "FE-101",
    );
    expect(suggestion).toBeInTheDocument();

    await user.click(suggestion);
    expect(onSearch).toHaveBeenCalledWith("FE-101");
  });

  it("shows the active alert count badge and navigates to alerts from the bell menu", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <Header
        activePage="dashboard"
        onNavigate={onNavigate}
        alerts={[makeAlert({ id: "AL-1" }), makeAlert({ id: "AL-2", status: "resolved" })]}
      />,
    );

    expect(screen.getByText("1")).toBeInTheDocument();

    const bellButton = container.querySelector(".lucide-bell")!.closest("button")!;
    await user.click(bellButton);
    await user.click(screen.getByText("모든 알림 보기"));
    expect(onNavigate).toHaveBeenCalledWith("alerts");
  });

  it("shows an empty state in the bell menu when there are no active alerts", async () => {
    const user = userEvent.setup();
    const { container } = render(<Header activePage="dashboard" alerts={[]} />);

    const bellButton = container.querySelector(".lucide-bell")!.closest("button")!;
    await user.click(bellButton);
    expect(await screen.findByText("확인이 필요한 알람이 없습니다")).toBeInTheDocument();
  });
});
