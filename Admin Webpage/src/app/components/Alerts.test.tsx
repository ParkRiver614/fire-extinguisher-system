import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Alerts, type Alert } from "./Alerts";
import * as downloadModule from "../utils/download";

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Alerts", () => {
  it("shows an empty state when there are no alerts", () => {
    render(<Alerts alerts={[]} status="connected" onRefresh={vi.fn()} onResolve={vi.fn()} />);
    expect(screen.getByText("서버에서 수신된 알림이 없습니다")).toBeInTheDocument();
  });

  it("defaults to showing only active alerts", () => {
    const alerts = [makeAlert({ id: "active-1", status: "active" }), makeAlert({ id: "resolved-1", status: "resolved" })];
    render(<Alerts alerts={alerts} status="connected" onRefresh={vi.fn()} onResolve={vi.fn()} />);

    expect(screen.getByText("active-1")).toBeInTheDocument();
    expect(screen.queryByText("resolved-1")).not.toBeInTheDocument();
  });

  it("filters alerts by search term across id/zone/extinguisherId/detail", async () => {
    const user = userEvent.setup();
    const alerts = [
      makeAlert({ id: "a1", zone: "1층 로비", extinguisherId: "FE-101", detail: "센서 이상" }),
      makeAlert({ id: "a2", zone: "2층 복도", extinguisherId: "FE-202", detail: "배터리 부족" }),
    ];
    render(<Alerts alerts={alerts} status="connected" onRefresh={vi.fn()} onResolve={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("ID, 구역, 장치, 상세 내용 검색"), "FE-202");

    expect(screen.queryByText("a1")).not.toBeInTheDocument();
    expect(screen.getByText("a2")).toBeInTheDocument();
  });

  it("applies externalSearch by switching the status filter to all and prefilling search", () => {
    const alerts = [makeAlert({ id: "resolved-1", status: "resolved", extinguisherId: "FE-999" })];
    render(
      <Alerts alerts={alerts} status="connected" onRefresh={vi.fn()} onResolve={vi.fn()} externalSearch="FE-999" />,
    );

    expect(screen.getByDisplayValue("FE-999")).toBeInTheDocument();
    expect(screen.getByText("resolved-1")).toBeInTheDocument();
  });

  it("calls onResolve with the alert id when resolving an active alert", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn().mockResolvedValue(undefined);
    const alerts = [makeAlert({ id: "a1", status: "active" })];
    render(<Alerts alerts={alerts} status="connected" onRefresh={vi.fn()} onResolve={onResolve} />);

    await user.click(screen.getByRole("button", { name: "해결" }));

    expect(onResolve).toHaveBeenCalledWith("a1");
  });

  it("calls onRefresh when the refresh button is clicked", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<Alerts alerts={[]} status="connected" onRefresh={onRefresh} onResolve={vi.fn()} />);

    await user.click(screen.getByTitle("서버에서 알림 다시 불러오기"));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("displays an error message when provided", () => {
    render(<Alerts alerts={[]} status="error" error="네트워크 오류" onRefresh={vi.fn()} onResolve={vi.fn()} />);
    expect(screen.getByText("네트워크 오류")).toBeInTheDocument();
  });

  it("exports the currently sorted/filtered alerts as CSV on export click", async () => {
    const user = userEvent.setup();
    const toCsvSpy = vi.spyOn(downloadModule, "toCsv");
    const downloadSpy = vi.spyOn(downloadModule, "downloadTextFile").mockImplementation(() => {});
    const alerts = [makeAlert({ id: "a1", status: "active" })];
    render(<Alerts alerts={alerts} status="connected" onRefresh={vi.fn()} onResolve={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /내보내기/ }));

    expect(toCsvSpy).toHaveBeenCalledWith([
      expect.objectContaining({ id: "a1", extinguisherId: "FE-101" }),
    ]);
    expect(downloadSpy).toHaveBeenCalledWith("firewatch-alerts.csv", expect.any(String), "text/csv;charset=utf-8");
  });

  it("paginates results beyond the page size", () => {
    const alerts = Array.from({ length: 15 }, (_, i) => makeAlert({ id: `a${i}`, status: "active" }));
    render(<Alerts alerts={alerts} status="connected" onRefresh={vi.fn()} onResolve={vi.fn()} />);

    expect(screen.getByText("1-10 / 총 15개 알림")).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    expect(within(rows[0]).getByText("알림 ID")).toBeInTheDocument();
  });

  it("shows alert statistics counts in the header chips", () => {
    const alerts = [
      makeAlert({ id: "a1", status: "active", type: "Obstacle" }),
      makeAlert({ id: "a2", status: "active", type: "Fire" }),
      makeAlert({ id: "a3", status: "resolved", type: "Missing" }),
    ];
    render(<Alerts alerts={alerts} status="connected" onRefresh={vi.fn()} onResolve={vi.fn()} />);

    const chipCount = (label: string) =>
      within(screen.getByText(label, { selector: "p" }).closest("div")!.parentElement!).getByText;

    expect(chipCount("전체 알림")("3")).toBeInTheDocument();
    expect(chipCount("진행 중")("2")).toBeInTheDocument();
    expect(chipCount("화재 경고")("1")).toBeInTheDocument();
    expect(chipCount("해결 완료")("1")).toBeInTheDocument();
  });

  it("restricts search to the selected field when using the search scope dropdown", async () => {
    const user = userEvent.setup();
    const alerts = [
      makeAlert({ id: "a1", zone: "특수구역", detail: "일반 내용", status: "active" }),
      makeAlert({ id: "a2", zone: "1층 로비", detail: "특수구역 발생", status: "active" }),
    ];
    render(<Alerts alerts={alerts} status="connected" onRefresh={vi.fn()} onResolve={vi.fn()} />);

    await user.selectOptions(screen.getByDisplayValue("전체"), "구역");
    await user.type(screen.getByPlaceholderText("구역 검색…"), "특수구역");

    expect(screen.getByText("a1")).toBeInTheDocument();
    expect(screen.queryByText("a2")).not.toBeInTheDocument();
  });

  it("sorts rows by Alert ID ascending, then descending, then back to original order on repeated header clicks", async () => {
    const user = userEvent.setup();
    const alerts = [
      makeAlert({ id: "b2", status: "active" }),
      makeAlert({ id: "a1", status: "active" }),
    ];
    render(<Alerts alerts={alerts} status="connected" onRefresh={vi.fn()} onResolve={vi.fn()} />);

    const rowOrder = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).queryByText(/^[ab][12]$/)?.textContent)
        .filter((text): text is string => Boolean(text));

    expect(rowOrder()).toEqual(["b2", "a1"]);

    const idHeader = screen.getByText("알림 ID");
    await user.click(idHeader);
    expect(rowOrder()).toEqual(["a1", "b2"]);

    await user.click(idHeader);
    expect(rowOrder()).toEqual(["b2", "a1"]);

    await user.click(idHeader);
    expect(rowOrder()).toEqual(["b2", "a1"]);
  });
});
