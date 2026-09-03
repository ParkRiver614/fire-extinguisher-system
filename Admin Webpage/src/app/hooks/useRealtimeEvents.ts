import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertStatus, AlertType } from "../components/Alerts";
import { EventLogEntry, EventLogType, RealtimeStatus } from "../components/EventLog";
import { authHeaders, getStoredToken } from "../auth";
import { parseServerDate } from "../utils/date";

type StreamPayload =
  | { type: "alert.created"; alert?: unknown; data?: unknown }
  | { type: "alert.updated"; alert?: unknown; data?: unknown }
  | { type: "alert.resolved"; alert?: unknown; data?: unknown }
  | { type: "event.created"; event?: unknown; data?: unknown }
  | { type: "snapshot"; alerts?: unknown; events?: unknown }
  | { type?: string; alert?: unknown; event?: unknown; data?: unknown };

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const REALTIME_URL = import.meta.env.VITE_REALTIME_URL as string | undefined;
const MAX_EVENTS = 100;

export function useRealtimeEvents(enabled: boolean) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const [status, setStatus] = useState<RealtimeStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    const [alertsResult, eventsResult] = await Promise.allSettled([
      fetchJson(`${API_BASE}/api/alerts`, authHeaders()),
      fetchJson(`${API_BASE}/api/events`, authHeaders()),
    ]);

    if (alertsResult.status === "fulfilled") {
      setAlerts(readArray(alertsResult.value, "alerts").map(normalizeAlert).filter(isAlert));
    }

    if (eventsResult.status === "fulfilled") {
      const parsed = readArray(eventsResult.value, "events").map(normalizeEvent).filter(isEvent);
      parsed.sort((a, b) => parseServerDate(b.timestamp).getTime() - parseServerDate(a.timestamp).getTime());
      setEvents(parsed);
    }

    const failures = [alertsResult, eventsResult].filter((result) => result.status === "rejected");
    if (failures.length > 0) {
      setError("초기 알림/이벤트 목록을 불러오지 못했습니다. 백엔드 API 상태를 확인하세요.");
    } else {
      setError(null);
    }
  }, [enabled]);

  const resolveAlert = useCallback(async (id: string) => {
    const response = await fetch(`${API_BASE}/api/alerts/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
    });

    if (!response.ok) {
      throw new Error(`Failed to resolve alert ${id}`);
    }

    const body = await readOptionalJson(response);
    const updated = normalizeAlert(body?.alert ?? body?.data ?? body);

    setAlerts((current) =>
      current.map((alert) => (alert.id === id ? (updated && isAlert(updated) ? updated : { ...alert, status: "resolved" }) : alert)),
    );
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus("disconnected");
      return;
    }

    refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return undefined;

    let stopped = false;
    let eventSource: EventSource | null = null;
    let socket: WebSocket | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (stopped) return;
      const delay = Math.min(30000, 1000 * 2 ** retryCountRef.current);
      retryCountRef.current += 1;
      clearReconnectTimer();
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    };

    const handlePayload = (payload: StreamPayload) => {
      if (payload.type === "snapshot") {
        setAlerts(readArray(payload.alerts, "alerts").map(normalizeAlert).filter(isAlert));
        const parsedEvents = readArray(payload.events, "events").map(normalizeEvent).filter(isEvent);
        parsedEvents.sort((a, b) => parseServerDate(b.timestamp).getTime() - parseServerDate(a.timestamp).getTime());
        setEvents(parsedEvents);
        return;
      }

      const incomingAlert = normalizeAlert(payload.alert ?? payload.data);
      if (incomingAlert && isAlert(incomingAlert)) {
        setAlerts((current) => upsertById(current, incomingAlert));
      }

      const incomingEvent = normalizeEvent(payload.event ?? payload.data);
      if (incomingEvent && isEvent(incomingEvent)) {
        setEvents((current) => [incomingEvent, ...current.filter((event) => event.id !== incomingEvent.id)].slice(0, MAX_EVENTS));
      }
    };

    const connect = () => {
      if (stopped) return;
      setStatus("connecting");

      if (REALTIME_URL?.startsWith("ws")) {
        socket = new WebSocket(REALTIME_URL);
        socket.onopen = () => {
          retryCountRef.current = 0;
          setStatus("connected");
          setError(null);
        };
        socket.onmessage = (message) => handlePayload(JSON.parse(message.data));
        socket.onerror = () => {
          setStatus("error");
          setError("WebSocket 실시간 스트림 연결에 실패했습니다.");
        };
        socket.onclose = () => {
          if (!stopped) {
            setStatus("disconnected");
            scheduleReconnect();
          }
        };
        return;
      }

      const base = REALTIME_URL ?? `${API_BASE}/api/events/stream`;
      const token = getStoredToken();
      const streamUrl = token ? `${base}?token=${encodeURIComponent(token)}` : base;
      eventSource = new EventSource(streamUrl);
      eventSource.onopen = () => {
        retryCountRef.current = 0;
        setStatus("connected");
        setError(null);
      };
      eventSource.onmessage = (message) => handlePayload(JSON.parse(message.data));
      eventSource.onerror = () => {
        eventSource?.close();
        setStatus("error");
        setError("SSE 실시간 스트림 연결에 실패했습니다.");
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      stopped = true;
      clearReconnectTimer();
      eventSource?.close();
      socket?.close();
    };
  }, [enabled]);

  return {
    alerts,
    events,
    status,
    error,
    refresh,
    resolveAlert,
  };
}

async function fetchJson(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  return response.json();
}

async function readOptionalJson(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function readArray(value: unknown, key: string) {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value[key])) return value[key];
  return [];
}

function normalizeAlert(value: unknown): Alert | null {
  if (!isRecord(value)) return null;

  const createdAt = toString(value.timestampFull ?? value.timestamp ?? value.createdAt ?? value.created_at);
  const date = createdAt ? parseServerDate(createdAt.replace(/\./g, "-")) : new Date();
  const timestampFull = formatFullDate(date);

  return {
    id: toString(value.id ?? value.alertId ?? value.alert_id),
    timestamp: formatShortDate(date),
    timestampFull,
    zone: toString(value.zone ?? value.location ?? value.area),
    extinguisherId: toString(
      value.extinguisher_display_id ?? value.extinguisherId ?? value.extinguisher_id ?? value.deviceId ?? value.device_id
    ),
    type: normalizeAlertType(value.type),
    detail: toString(value.detail ?? value.message ?? value.description),
    status: normalizeAlertStatus(value.status),
  };
}

function normalizeEvent(value: unknown): EventLogEntry | null {
  if (!isRecord(value)) return null;

  const createdAt = toString(value.timestamp ?? value.createdAt ?? value.created_at);
  const date = createdAt ? parseServerDate(createdAt.replace(/\./g, "-")) : new Date();

  return {
    id: toString(value.id ?? `${date.getTime()}-${toString(value.text ?? value.message)}`),
    type: normalizeEventType(value.type ?? value.level ?? value.severity),
    text: toString(value.text ?? value.message ?? value.title),
    sub: toString(value.sub ?? value.detail ?? value.description),
    time: toString(value.time) || formatTime(date),
    timestamp: createdAt || date.toISOString(),
    extinguisherId: typeof value.extinguisher_id === "number" ? value.extinguisher_id : undefined,
    deviceStatus: toString(value.status) || undefined,
  };
}

function normalizeAlertType(value: unknown): AlertType {
  if (value === "Missing" || value === "missing") return "Missing";
  if (value === "Fire" || value === "fire") return "Fire";
  if (value === "Inspection" || value === "inspection") return "Inspection";
  if (value === "Humidity" || value === "humidity") return "Humidity";
  return "Obstacle";
}

function normalizeAlertStatus(value: unknown): AlertStatus {
  return value === "resolved" ? "resolved" : "active";
}

function normalizeEventType(value: unknown): EventLogType {
  if (value === "warning" || value === "warn") return "warning";
  if (value === "error" || value === "critical") return "error";
  if (value === "info") return "info";
  return "normal";
}

function isAlert(value: Alert | null): value is Alert {
  return Boolean(value?.id && value.extinguisherId && value.detail);
}

function isEvent(value: EventLogEntry | null): value is EventLogEntry {
  return Boolean(value?.id && value.text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toString(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  return [item, ...items.filter((current) => current.id !== item.id)];
}

function formatFullDate(value: Date) {
  if (Number.isNaN(value.getTime())) return "";
  return `${value.getFullYear()}.${pad(value.getMonth() + 1)}.${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function formatShortDate(value: Date) {
  if (Number.isNaN(value.getTime())) return "";
  return `${pad(value.getMonth() + 1)}.${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function formatTime(value: Date) {
  if (Number.isNaN(value.getTime())) return "";
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
