import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { AuthUser } from "./auth";
import type { Device } from "./types";

const adminUser: AuthUser = { id: "1", email: "admin@example.com", name: "Admin User", role: "admin" };

const mockGetCurrentUser = vi.fn();
const mockLogout = vi.fn().mockResolvedValue(undefined);

vi.mock("./auth", async () => {
  const actual = await vi.importActual<typeof import("./auth")>("./auth");
  return {
    ...actual,
    getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
  };
});

const mockResolveAlert = vi.fn();
const mockRefresh = vi.fn();
let mockRealtimeAlerts: { id: string; status: string }[] = [];

vi.mock("./hooks/useRealtimeEvents", () => ({
  useRealtimeEvents: () => ({
    alerts: mockRealtimeAlerts,
    events: [],
    status: "connected",
    error: null,
    refresh: mockRefresh,
    resolveAlert: mockResolveAlert,
  }),
}));

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

vi.mock("./components/FloorMap", () => ({
  FloorMap: ({ devices, onSelectDevice }: { devices: Device[]; onSelectDevice: (d: Device) => void }) => (
    <div data-testid="floor-map">
      FloorMap ({devices.length}대)
      {devices[0] && <button onClick={() => onSelectDevice(devices[0])}>select-first-device</button>}
    </div>
  ),
}));

vi.mock("./components/DeviceDetail", () => ({
  DeviceDetail: ({ device }: { device: Device }) => <div data-testid="device-detail">DeviceDetail: {device.id}</div>,
}));

vi.mock("./components/DeviceManagement", () => ({
  DeviceManagement: () => <div data-testid="device-management">DeviceManagement</div>,
}));

vi.mock("./components/ManagersPage", () => ({
  ManagersPage: () => <div data-testid="managers-page">ManagersPage</div>,
}));

vi.mock("./components/Reports", () => ({
  Reports: () => <div data-testid="reports-page">Reports</div>,
}));

vi.mock("./components/Settings", () => ({
  Settings: () => <div data-testid="settings-page">Settings</div>,
}));

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body } as Response);
}

beforeEach(() => {
  mockRealtimeAlerts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/api/devices")) return jsonResponse([makeDevice()]);
      if (url.includes("/api/admins")) return jsonResponse([]);
      return jsonResponse({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("App", () => {
  it("shows a session-checking placeholder before auth resolves", () => {
    mockGetCurrentUser.mockReturnValue(new Promise(() => {}));
    render(<App />);
    expect(screen.getByText("세션을 확인하는 중입니다...")).toBeInTheDocument();
  });

  it("shows the login page when there is no authenticated user", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    render(<App />);
    expect(await screen.findByPlaceholderText("비밀번호를 입력하세요")).toBeInTheDocument();
  });

  it("shows the dashboard with the floor map once authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser);
    render(<App />);

    expect(await screen.findByTestId("floor-map")).toBeInTheDocument();
    expect(screen.getByText("Admin User")).toBeInTheDocument();
  });

  it("navigates between pages via the sidebar", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId("floor-map");

    await user.click(screen.getByText("장치 관리"));
    expect(await screen.findByTestId("device-management")).toBeInTheDocument();

    await user.click(screen.getByText("담당자 관리"));
    expect(await screen.findByTestId("managers-page")).toBeInTheDocument();

    await user.click(screen.getByText("보고서"));
    expect(await screen.findByTestId("reports-page")).toBeInTheDocument();

    await user.click(screen.getByText("설정"));
    expect(await screen.findByTestId("settings-page")).toBeInTheDocument();
  });

  it("shows the device detail view after selecting a device from the map, then returns via back", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId("floor-map");

    await user.click(screen.getByText("select-first-device"));
    expect(await screen.findByTestId("device-detail")).toBeInTheDocument();
    expect(screen.getByText("DeviceDetail: FE-101")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /돌아가기/ }));
    expect(await screen.findByTestId("floor-map")).toBeInTheDocument();
  });

  it("logs out and returns to the login page", async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId("floor-map");

    await user.click(screen.getByText("Admin User"));

    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    expect(await screen.findByPlaceholderText("비밀번호를 입력하세요")).toBeInTheDocument();
  });
});
