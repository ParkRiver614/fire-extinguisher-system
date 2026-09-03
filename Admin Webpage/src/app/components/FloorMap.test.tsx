import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloorMap } from "./FloorMap";
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

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body } as Response);
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/api/floors/detail")) return jsonResponse([]);
      return jsonResponse({});
    }),
  );
  SVGSVGElement.prototype.getScreenCTM = () =>
    ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }) as unknown as DOMMatrix;
  SVGSVGElement.prototype.createSVGPoint = () => {
    const point = {
      x: 0,
      y: 0,
      matrixTransform(m: { a: number; b: number; c: number; d: number; e: number; f: number }) {
        return { x: m.a * point.x + m.c * point.y + m.e, y: m.b * point.x + m.d * point.y + m.f };
      },
    };
    return point as unknown as SVGPoint;
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("FloorMap", () => {
  it("defaults to floor 1F and shows only devices on that floor", () => {
    render(
      <FloorMap
        devices={[makeDevice({ id: "FE-101", floor_name: "1F" }), makeDevice({ extinguisher_id: 2, id: "FE-202", floor_name: "2F" })]}
        onSelectDevice={vi.fn()}
      />,
    );

    expect(screen.getByText("1층 (Floor 1)")).toBeInTheDocument();
    expect(screen.getByText("1개 장치")).toBeInTheDocument();
  });

  it("shows the no-map-uploaded fallback text when a floor has no map image", () => {
    render(<FloorMap devices={[]} onSelectDevice={vi.fn()} />);
    expect(screen.getByText("도면이 등록되지 않았습니다")).toBeInTheDocument();
  });

  it("switches floors from the dropdown and updates the device count", async () => {
    const user = userEvent.setup();
    render(
      <FloorMap
        devices={[makeDevice({ id: "FE-101", floor_name: "1F" }), makeDevice({ extinguisher_id: 2, id: "FE-202", floor_name: "2F" })]}
        onSelectDevice={vi.fn()}
      />,
    );

    await user.click(screen.getByText("1층 (Floor 1)"));
    await user.click(screen.getByText("2층 (Floor 2)"));

    expect(screen.getByText("1개 장치")).toBeInTheDocument();
    expect(screen.getByText("2F")).toBeInTheDocument();
  });

  it("toggles edit mode when clicking the position-adjust button", async () => {
    const user = userEvent.setup();
    render(<FloorMap devices={[]} onSelectDevice={vi.fn()} />);

    expect(screen.getByText("위치 조정")).toBeInTheDocument();

    await user.click(screen.getByText("위치 조정"));
    expect(screen.getByText("저장 완료")).toBeInTheDocument();
    expect(screen.getByText(/위치 편집 모드/)).toBeInTheDocument();
  });

  it("calls onSelectDevice after clicking a device marker", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const onSelectDevice = vi.fn();
    const device = makeDevice({ id: "FE-101", floor_name: "1F" });
    const { container } = render(<FloorMap devices={[device]} onSelectDevice={onSelectDevice} />);

    const marker = container.querySelector("svg g")!;
    await user.click(marker);
    vi.advanceTimersByTime(300);

    expect(onSelectDevice).toHaveBeenCalledWith(expect.objectContaining({ id: "FE-101" }));
    vi.useRealTimers();
  });

  it("calls onPositionChange with the dropped percentage coordinates after dragging a marker in edit mode", async () => {
    const user = userEvent.setup();
    const onPositionChange = vi.fn();
    const device = makeDevice({ id: "FE-101", floor_name: "1F" });
    const { container } = render(
      <FloorMap devices={[device]} onSelectDevice={vi.fn()} onPositionChange={onPositionChange} />,
    );

    await user.click(screen.getByText("위치 조정"));

    const marker = container.querySelector("svg g")!;
    const svg = marker.closest("svg")!;

    fireEvent.mouseDown(marker, { bubbles: true, cancelable: true });
    fireEvent.mouseMove(svg, { bubbles: true, cancelable: true, clientX: 360, clientY: 230 });
    fireEvent.mouseUp(svg, { bubbles: true, cancelable: true });

    expect(onPositionChange).toHaveBeenCalledWith("FE-101", 50, 50);
  });

  it("shows the device count in the legend", () => {
    render(
      <FloorMap
        devices={[makeDevice({ id: "FE-101", floor_name: "1F" }), makeDevice({ extinguisher_id: 2, id: "FE-202", floor_name: "1F" })]}
        onSelectDevice={vi.fn()}
      />,
    );
    expect(screen.getByText("2개 장치")).toBeInTheDocument();
  });
});
