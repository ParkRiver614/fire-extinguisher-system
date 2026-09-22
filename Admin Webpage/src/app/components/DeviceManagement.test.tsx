import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceManagement } from "./DeviceManagement";
import { Admin, Device } from "../types";
import * as downloadModule from "../utils/download";

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

function renderDeviceManagement(devices: Device[], admins: Admin[] = []) {
  const setDevices = vi.fn();
  const setAdmins = vi.fn();
  const utils = render(
    <DeviceManagement devices={devices} setDevices={setDevices} admins={admins} setAdmins={setAdmins} />,
  );
  return { ...utils, setDevices, setAdmins };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/api/floors/detail")) return jsonResponse([]);
      if (url.includes("/api/devices/models")) return jsonResponse([]);
      return jsonResponse({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DeviceManagement", () => {
  it("shows an empty state when there are no devices", async () => {
    renderDeviceManagement([]);
    expect(await screen.findByText("등록된 장치가 없습니다")).toBeInTheDocument();
  });

  it("lists registered devices", async () => {
    renderDeviceManagement([makeDevice({ id: "FE-101" }), makeDevice({ id: "FE-102", extinguisher_id: 2 })]);
    expect(await screen.findByText("FE-101")).toBeInTheDocument();
    expect(screen.getByText("FE-102")).toBeInTheDocument();
  });

  it("renders a device with obstacle status", async () => {
    renderDeviceManagement([
      makeDevice({ id: "FE-012", status: "obstacle", status_name: "obstacle" }),
    ]);
    expect(await screen.findByText("FE-012")).toBeInTheDocument();
    expect(screen.getAllByText("장애물").length).toBeGreaterThan(0);
  });

  it("renders a device whose status is unknown to the frontend without crashing", async () => {
    renderDeviceManagement([
      makeDevice({ id: "FE-013", status: "no_such_status" as Device["status"], status_name: "정의되지 않은 상태" }),
    ]);
    expect(await screen.findByText("FE-013")).toBeInTheDocument();
    expect(screen.getByText("정의되지 않은 상태")).toBeInTheDocument();
  });

  it("filters devices by status", async () => {
    const user = userEvent.setup();
    renderDeviceManagement([
      makeDevice({ id: "FE-normal", status: "normal" }),
      makeDevice({ id: "FE-fire", status: "fire", extinguisher_id: 2 }),
    ]);
    await screen.findByText("FE-normal");

    await user.click(screen.getByRole("button", { name: "화재" }));

    expect(screen.queryByText("FE-normal")).not.toBeInTheDocument();
    expect(screen.getByText("FE-fire")).toBeInTheDocument();
  });

  it("filters devices by search text within the selected search field", async () => {
    const user = userEvent.setup();
    renderDeviceManagement([
      makeDevice({ id: "FE-101", zone_name: "1층 로비" }),
      makeDevice({ id: "FE-202", zone_name: "2층 복도", extinguisher_id: 2 }),
    ]);
    await screen.findByText("FE-101");

    await user.type(screen.getByPlaceholderText("ID, 구역, 담당자, 모델명, 날짜 검색…"), "FE-202");

    expect(screen.queryByText("FE-101")).not.toBeInTheDocument();
    expect(screen.getByText("FE-202")).toBeInTheDocument();
  });

  it("shows validation errors when submitting without required fields", async () => {
    const user = userEvent.setup();
    renderDeviceManagement([]);
    await screen.findByText("등록된 장치가 없습니다");

    await user.click(screen.getByRole("button", { name: "장치 추가" }));

    expect(await screen.findByText("구역을 선택하세요.")).toBeInTheDocument();
    expect(screen.getByText("모델을 선택하세요.")).toBeInTheDocument();
  });

  it("requires a confirmation click before deleting a device", async () => {
    const user = userEvent.setup();
    const { setDevices } = renderDeviceManagement([makeDevice({ id: "FE-101" })]);
    await screen.findByText("FE-101");

    await user.click(screen.getByTitle("장치 삭제"));
    expect(setDevices).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "확인" }));
    await waitFor(() => expect(setDevices).toHaveBeenCalled());
  });

  it("populates the edit form when clicking the edit action", async () => {
    const user = userEvent.setup();
    renderDeviceManagement([makeDevice({ id: "FE-101", mac_address: "11:22:33:44:55:66" })]);
    await screen.findByText("FE-101");

    await user.click(screen.getByTitle("장치 수정"));

    expect(await screen.findByText("장치 정보 수정")).toBeInTheDocument();
    expect(screen.getByDisplayValue("11:22:33:44:55:66")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "수정 저장" })).toBeInTheDocument();
  });

  it("selects a device row and enables bulk action buttons", async () => {
    const user = userEvent.setup();
    renderDeviceManagement([makeDevice({ id: "FE-101" }), makeDevice({ id: "FE-102", extinguisher_id: 2 })]);
    await screen.findByText("FE-101");

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]);

    expect(screen.getByText("1개 유지보수 예약")).toBeInTheDocument();
    expect(screen.getByText("1개 삭제")).toBeInTheDocument();
  });

  it("sorts rows by Device ID ascending, then descending, then back to original order on repeated header clicks", async () => {
    const user = userEvent.setup();
    renderDeviceManagement([
      makeDevice({ id: "FE-202", extinguisher_id: 2 }),
      makeDevice({ id: "FE-101", extinguisher_id: 1 }),
    ]);
    await screen.findByText("FE-202");

    const rowOrder = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).queryByText(/^FE-\d+$/)?.textContent)
        .filter((text): text is string => Boolean(text));

    expect(rowOrder()).toEqual(["FE-202", "FE-101"]);

    await user.click(screen.getByText("장치 ID"));
    expect(rowOrder()).toEqual(["FE-101", "FE-202"]);

    await user.click(screen.getByText("장치 ID"));
    expect(rowOrder()).toEqual(["FE-202", "FE-101"]);

    await user.click(screen.getByText("장치 ID"));
    expect(rowOrder()).toEqual(["FE-202", "FE-101"]);
  });

  it("paginates beyond the page size", async () => {
    const user = userEvent.setup();
    const devices = Array.from({ length: 15 }, (_, i) =>
      makeDevice({ id: `FE-${100 + i}`, extinguisher_id: i + 1 }),
    );
    renderDeviceManagement(devices);
    await screen.findByText("FE-100");

    expect(screen.getByText("1–10 / 총 15개")).toBeInTheDocument();
    expect(screen.queryByText("FE-110")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "2" }));

    expect(screen.getByText("11–15 / 총 15개")).toBeInTheDocument();
    expect(screen.getByText("FE-110")).toBeInTheDocument();
    expect(screen.queryByText("FE-100")).not.toBeInTheDocument();
  });

  it("exports the currently sorted/filtered devices as CSV on export click", async () => {
    const toCsvSpy = vi.spyOn(downloadModule, "toCsv");
    const downloadSpy = vi.spyOn(downloadModule, "downloadTextFile").mockImplementation(() => {});
    const user = userEvent.setup();
    renderDeviceManagement([makeDevice({ id: "FE-101" })]);
    await screen.findByText("FE-101");

    await user.click(screen.getByText("CSV 내보내기"));

    expect(toCsvSpy).toHaveBeenCalledWith([expect.objectContaining({ id: "FE-101" })]);
    expect(downloadSpy).toHaveBeenCalledWith("firewatch-devices.csv", expect.any(String), "text/csv;charset=utf-8");
  });

  it("calls onSelectDevice when clicking a Device ID link", async () => {
    const onSelectDevice = vi.fn();
    const user = userEvent.setup();
    const setDevices = vi.fn();
    const setAdmins = vi.fn();
    render(
      <DeviceManagement
        devices={[makeDevice({ id: "FE-101" })]}
        setDevices={setDevices}
        admins={[]}
        setAdmins={setAdmins}
        onSelectDevice={onSelectDevice}
      />,
    );
    await screen.findByText("FE-101");

    await user.click(screen.getByText("FE-101"));

    expect(onSelectDevice).toHaveBeenCalledWith(expect.objectContaining({ id: "FE-101" }));
  });

  it("bulk-deletes selected devices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes("/api/floors/detail")) return jsonResponse([]);
        if (url.includes("/api/devices/models")) return jsonResponse([]);
        if (init?.method === "DELETE") return jsonResponse({});
        return jsonResponse({});
      }),
    );
    const user = userEvent.setup();
    const { setDevices } = renderDeviceManagement([
      makeDevice({ id: "FE-101", extinguisher_id: 1 }),
      makeDevice({ id: "FE-102", extinguisher_id: 2 }),
    ]);
    await screen.findByText("FE-101");

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]);
    await user.click(checkboxes[2]);
    await user.click(screen.getByText("2개 삭제"));

    await waitFor(() => expect(setDevices).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/devices/1"), expect.objectContaining({ method: "DELETE" }));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/devices/2"), expect.objectContaining({ method: "DELETE" }));
  });

  it("reserves maintenance for selected non-maintenance devices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes("/api/floors/detail")) return jsonResponse([]);
        if (url.includes("/api/devices/models")) return jsonResponse([]);
        if (init?.method === "PUT") return jsonResponse({});
        return jsonResponse({});
      }),
    );
    const user = userEvent.setup();
    const { setDevices } = renderDeviceManagement([makeDevice({ id: "FE-101", extinguisher_id: 1, status: "normal" })]);
    await screen.findByText("FE-101");

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]);
    await user.click(screen.getByText("1개 유지보수 예약"));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/devices/1"),
        expect.objectContaining({ method: "PUT", body: JSON.stringify({ status: "maintenance" }) }),
      ),
    );
    expect(setDevices).toHaveBeenCalled();
  });

  it("registers a new device successfully after filling the required fields", async () => {
    const created = makeDevice({ id: "FE-999", extinguisher_id: 9 });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes("/api/floors/detail")) {
          return jsonResponse([
            { floor_id: 1, floor_name: "1F", floor_label: "1층", level: 1, zones: [{ zone_id: 1, zone_name: "로비" }] },
          ]);
        }
        if (url.includes("/api/devices/models")) {
          return jsonResponse([{ model_id: 1, model_name: "ABC", agent_type: "powder", total_weight: 5, empty_weight: 2 }]);
        }
        if (url.includes("/api/devices") && init?.method === "POST") {
          return jsonResponse({ device: created });
        }
        return jsonResponse({});
      }),
    );
    const user = userEvent.setup();
    const { setDevices } = renderDeviceManagement([]);
    await screen.findByText("등록된 장치가 없습니다");

    await user.selectOptions(await screen.findByDisplayValue("층 선택…"), "1층");
    await user.selectOptions(await screen.findByDisplayValue("구역 선택…"), "로비");
    await user.selectOptions(screen.getByDisplayValue("모델 선택…"), "ABC (powder)");
    await user.type(screen.getByPlaceholderText("예: 00:1A:2B:3C:4D:5E"), "AA:BB:CC:DD:EE:99");

    await user.click(screen.getByRole("button", { name: "장치 추가" }));

    expect(await screen.findByText("장치가 성공적으로 등록되었습니다!")).toBeInTheDocument();
    expect(setDevices).toHaveBeenCalled();
  });

  it("locks zone and admin until a floor is chosen, then offers only that floor's admins", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/api/floors/detail")) {
          return jsonResponse([
            { floor_id: 1, floor_name: "1F", floor_label: "1층", level: 1, zones: [{ zone_id: 1, zone_name: "로비" }] },
            { floor_id: 2, floor_name: "2F", floor_label: "2층", level: 2, zones: [{ zone_id: 2, zone_name: "복도" }] },
          ]);
        }
        if (url.includes("/api/devices/models")) return jsonResponse([]);
        return jsonResponse({});
      }),
    );
    const admins: Admin[] = [
      { admin_id: 1, admin_name: "김일층", email: "a@example.com", role: "operator", assigned_floor_id: 1, created_at: "2026-01-01" },
      { admin_id: 2, admin_name: "박이층", email: "b@example.com", role: "operator", assigned_floor_id: 2, created_at: "2026-01-01" },
    ];
    const user = userEvent.setup();
    renderDeviceManagement([], admins);
    await screen.findByText("등록된 장치가 없습니다");

    const [zoneSelect, adminSelect] = screen.getAllByDisplayValue("층을 먼저 선택하세요");
    expect(zoneSelect).toBeDisabled();
    expect(adminSelect).toBeDisabled();

    await user.selectOptions(await screen.findByDisplayValue("층 선택…"), "2층");
    expect(screen.getByDisplayValue("구역 선택…")).toBeEnabled();
    const admin = screen.getByDisplayValue("담당자 미지정");
    expect(within(admin).getByText("박이층")).toBeInTheDocument();
    expect(within(admin).queryByText("김일층")).not.toBeInTheDocument();
  });

  it("requires a valid, unique MAC address when registering a new device", async () => {
    const user = userEvent.setup();
    renderDeviceManagement([makeDevice({ id: "FE-101", mac_address: "AA:BB:CC:DD:EE:FF" })]);
    await screen.findByText("FE-101");

    await user.click(screen.getByRole("button", { name: "장치 추가" }));
    expect(await screen.findByText("실제 장치의 MAC 주소를 입력하세요.")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("예: 00:1A:2B:3C:4D:5E"), "not-a-mac");
    await user.click(screen.getByRole("button", { name: "장치 추가" }));
    expect(await screen.findByText(/MAC 주소 형식이 올바르지 않습니다/)).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText("예: 00:1A:2B:3C:4D:5E"));
    await user.type(screen.getByPlaceholderText("예: 00:1A:2B:3C:4D:5E"), "AA:BB:CC:DD:EE:FF");
    await user.click(screen.getByRole("button", { name: "장치 추가" }));
    expect(await screen.findByText("이미 등록된 MAC 주소입니다.")).toBeInTheDocument();
  });
});
