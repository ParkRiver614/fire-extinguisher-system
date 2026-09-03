import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import { AuthUser } from "../auth";
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

const user: AuthUser = { id: "1", email: "admin@example.com", name: "Admin User", role: "admin" };

describe("Sidebar", () => {
  it("renders the user's initials, name and role", () => {
    render(<Sidebar activePage="dashboard" onNavigate={vi.fn()} user={user} alertCount={0} devices={[]} />);

    expect(screen.getByText("AU")).toBeInTheDocument();
    expect(screen.getByText("Admin User")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("calls onNavigate with the clicked page", async () => {
    const onNavigate = vi.fn();
    const u = userEvent.setup();
    render(<Sidebar activePage="dashboard" onNavigate={onNavigate} user={user} alertCount={0} devices={[]} />);

    await u.click(screen.getByText("장치 관리"));
    expect(onNavigate).toHaveBeenCalledWith("devices");
  });

  it("calls onLogout when the profile button is clicked", async () => {
    const onLogout = vi.fn();
    const u = userEvent.setup();
    render(<Sidebar activePage="dashboard" onNavigate={vi.fn()} onLogout={onLogout} user={user} alertCount={0} devices={[]} />);

    await u.click(screen.getByText("Admin User"));
    expect(onLogout).toHaveBeenCalled();
  });

  it("shows an alert count badge on the alerts item when not active", () => {
    render(<Sidebar activePage="dashboard" onNavigate={vi.fn()} user={user} alertCount={3} devices={[]} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("hides the alert badge when the alerts page is active", () => {
    render(<Sidebar activePage="alerts" onNavigate={vi.fn()} user={user} alertCount={3} devices={[]} />);
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  it("summarizes device status counts", () => {
    const devices = [
      makeDevice({ extinguisher_id: 1, status: "normal" }),
      makeDevice({ extinguisher_id: 2, status: "normal" }),
      makeDevice({ extinguisher_id: 3, status: "warning" }),
      makeDevice({ extinguisher_id: 4, status: "error" }),
      makeDevice({ extinguisher_id: 5, status: "fire" }),
      makeDevice({ extinguisher_id: 6, status: "offline" }),
    ];
    render(<Sidebar activePage="dashboard" onNavigate={vi.fn()} user={user} alertCount={0} devices={devices} />);

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
