import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRealtimeEvents } from "./useRealtimeEvents";

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

const validAlertPayload = {
  id: "a1",
  extinguisher_id: "FE-101",
  detail: "센서 이상 감지",
  timestamp: "2026.07.06 10:00:00",
  zone: "1층 로비",
  type: "Fire",
  status: "active",
};

const validEventPayload = {
  id: "e1",
  text: "장치가 오프라인 상태입니다",
  type: "warning",
  timestamp: "2026.07.06 10:00:00",
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("useRealtimeEvents", () => {
  it("stays disconnected and skips network calls when disabled", () => {
    const { result } = renderHook(() => useRealtimeEvents(false));
    expect(result.current.status).toBe("disconnected");
    expect(fetch).not.toHaveBeenCalled();
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("loads alerts and events on mount when enabled", async () => {
    (fetch as any).mockImplementation((url: string) => {
      if (url.includes("/api/alerts")) return Promise.resolve(jsonResponse({ alerts: [validAlertPayload] }));
      if (url.includes("/api/events")) return Promise.resolve(jsonResponse({ events: [validEventPayload] }));
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const { result } = renderHook(() => useRealtimeEvents(true));

    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    expect(result.current.alerts[0].id).toBe("a1");
    expect(result.current.alerts[0].extinguisherId).toBe("FE-101");
    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].id).toBe("e1");
    expect(result.current.error).toBeNull();
  });

  it("filters out malformed alerts/events missing required fields", async () => {
    (fetch as any).mockImplementation((url: string) => {
      if (url.includes("/api/alerts")) return Promise.resolve(jsonResponse({ alerts: [{ id: "bad-alert" }] }));
      if (url.includes("/api/events")) return Promise.resolve(jsonResponse({ events: [{ id: "bad-event" }] }));
      return Promise.reject(new Error("unexpected"));
    });

    const { result } = renderHook(() => useRealtimeEvents(true));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.alerts).toHaveLength(0);
    expect(result.current.events).toHaveLength(0);
  });

  it("sets an error message when the initial fetch fails", async () => {
    (fetch as any).mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useRealtimeEvents(true));

    await waitFor(() => expect(result.current.error).not.toBeNull());
  });

  it("opens an EventSource stream and transitions to connected on open", async () => {
    (fetch as any).mockResolvedValue(jsonResponse({ alerts: [], events: [] }));

    const { result } = renderHook(() => useRealtimeEvents(true));

    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    const source = MockEventSource.instances[0];

    act(() => {
      source.onopen?.();
    });

    expect(result.current.status).toBe("connected");
  });

  it("upserts an incoming alert pushed over the stream, keeping it unique by id", async () => {
    (fetch as any).mockResolvedValue(jsonResponse({ alerts: [validAlertPayload], events: [] }));

    const { result } = renderHook(() => useRealtimeEvents(true));
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    const source = MockEventSource.instances[0];

    act(() => {
      source.emitMessage({ type: "alert.updated", alert: { ...validAlertPayload, detail: "업데이트된 상세" } });
    });

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].detail).toBe("업데이트된 상세");
  });

  it("resolveAlert posts to the resolve endpoint and marks the alert resolved", async () => {
    (fetch as any).mockImplementation((url: string) => {
      if (url.includes("/resolve")) {
        return Promise.resolve({ ok: true, text: async () => "" } as Response);
      }
      if (url.includes("/api/alerts")) return Promise.resolve(jsonResponse({ alerts: [validAlertPayload] }));
      if (url.includes("/api/events")) return Promise.resolve(jsonResponse({ events: [] }));
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const { result } = renderHook(() => useRealtimeEvents(true));
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));

    await act(async () => {
      await result.current.resolveAlert("a1");
    });

    expect(result.current.alerts[0].status).toBe("resolved");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/alerts/a1/resolve"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("resolveAlert throws when the server responds with an error", async () => {
    (fetch as any).mockImplementation((url: string) => {
      if (url.includes("/api/alerts")) return Promise.resolve(jsonResponse({ alerts: [] }));
      if (url.includes("/api/events")) return Promise.resolve(jsonResponse({ events: [] }));
      if (url.includes("/resolve")) return Promise.resolve({ ok: false } as Response);
      return Promise.reject(new Error("unexpected"));
    });

    const { result } = renderHook(() => useRealtimeEvents(true));
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    await expect(result.current.resolveAlert("missing-id")).rejects.toThrow();
  });
});
