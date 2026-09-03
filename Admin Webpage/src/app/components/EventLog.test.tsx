import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventLog, EventLogEntry } from "./EventLog";

function makeEntry(overrides: Partial<EventLogEntry> = {}): EventLogEntry {
  return {
    id: "EV-1",
    type: "normal",
    text: "FE-101 정상 작동",
    sub: "센서 확인 완료",
    time: "10:00",
    ...overrides,
  };
}

describe("EventLog", () => {
  it("shows a connecting empty state when there are no entries and status is connecting", () => {
    render(<EventLog entries={[]} status="connecting" />);
    expect(screen.getByText("이벤트 스트림 연결 중")).toBeInTheDocument();
  });

  it("shows a no-events empty state when connected with no entries", () => {
    render(<EventLog entries={[]} status="connected" />);
    expect(screen.getByText("수신된 이벤트가 없습니다")).toBeInTheDocument();
    expect(screen.getByText("LIVE")).toBeInTheDocument();
  });

  it("renders entries with their text, sub, and time", () => {
    const entries = [makeEntry({ id: "EV-1", text: "FE-101 정상 작동", sub: "센서 확인 완료", time: "10:00" })];
    render(<EventLog entries={entries} status="connected" />);

    expect(screen.getByText("FE-101 정상 작동")).toBeInTheDocument();
    expect(screen.getByText("센서 확인 완료")).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();
    expect(screen.getByText("총 1개 이벤트 · 서버 실시간 스트림")).toBeInTheDocument();
  });

  it("counts entries per type in the summary badges", () => {
    const entries = [
      makeEntry({ id: "EV-1", type: "normal" }),
      makeEntry({ id: "EV-2", type: "warning" }),
      makeEntry({ id: "EV-3", type: "warning" }),
      makeEntry({ id: "EV-4", type: "error" }),
    ];
    render(<EventLog entries={entries} status="connected" />);

    expect(screen.getByText("정상 1")).toBeInTheDocument();
    expect(screen.getByText("경고 2")).toBeInTheDocument();
    expect(screen.getByText("이상 1")).toBeInTheDocument();
  });

  it("shows the error banner and disconnected label when status is error", () => {
    render(<EventLog entries={[]} status="error" error="스트림 연결이 끊어졌습니다." />);
    expect(screen.getByText("연결 오류")).toBeInTheDocument();
    expect(screen.getByText("스트림 연결이 끊어졌습니다.")).toBeInTheDocument();
  });
});
