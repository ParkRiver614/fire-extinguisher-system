/**
 * 실시간 알림/이벤트 수신 훅.
 *
 * 1) 로그인되면 먼저 /api/alerts, /api/events로 현재 목록을 한 번 받아오고(refresh)
 * 2) 이어서 스트림(SSE 기본, VITE_REALTIME_URL이 ws면 WebSocket)에 붙어 새 이벤트를 밀어 받는다.
 * 끊기면 지수 백오프로 자동 재연결하고, 화면에는 연결 상태(status)와 오류 메시지를 넘겨준다.
 * 서버 응답 필드명이 제각각(snake/camel)이라 normalizeAlert/normalizeEvent에서 한 형태로 맞춘다.
 */
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
const MAX_EVENTS = 100; // 이벤트 로그는 최근 100건만 메모리에 유지

export function useRealtimeEvents(enabled: boolean) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const [status, setStatus] = useState<RealtimeStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);

  // 초기 목록 로드(수동 새로고침에도 사용). 한쪽만 실패해도 성공한 쪽은 반영한다.
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

  // 알림 해제 — 서버 응답에 갱신된 알림이 오면 그것으로, 없으면 status만 resolved로 바꿔 화면에 반영.
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

    // 재연결 백오프: 1초 → 2 → 4 … 최대 30초. 연결에 성공하면 retryCount가 0으로 리셋된다.
    const scheduleReconnect = () => {
      if (stopped) return;
      const delay = Math.min(30000, 1000 * 2 ** retryCountRef.current);
      retryCountRef.current += 1;
      clearReconnectTimer();
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    };

    // 스트림 수신 처리 — "snapshot"은 목록 전체 교체, 그 외에는 알림/이벤트 1건씩 병합(같은 id는 최신으로 대체).
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

    // 스트림 연결. SSE는 커스텀 헤더를 못 붙이므로 토큰을 쿼리스트링으로 넘긴다.
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

// 응답이 배열이든 {alerts:[...]}/{events:[...]}든 배열로 꺼낸다.
function readArray(value: unknown, key: string) {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value[key])) return value[key];
  return [];
}

// 서버 알림 → 화면용 Alert. 필드명이 여러 형태로 와도 받아들이고, 시각은 표시용으로 미리 포맷한다.
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

// 서버 이벤트 → 이벤트 로그 한 줄. id가 없으면 시각+내용으로 만들어 중복 제거에 쓴다.
function normalizeEvent(value: unknown): EventLogEntry | null {
  if (!isRecord(value)) return null;

  const createdAt = toString(value.timestamp ?? value.createdAt ?? value.created_at);
  const date = createdAt ? parseServerDate(createdAt.replace(/\./g, "-")) : new Date();

  return {
    id: toString(value.id ?? `${date.getTime()}-${toString(value.text ?? value.message)}`),
    type: normalizeEventType(value.type ?? value.level ?? value.severity),
    text: toString(value.text ?? value.message ?? value.title),
    sub: toString(value.sub ?? value.detail ?? value.description),
    // 서버의 `time`은 UTC를 그대로 strftime한 문자열이라 9시간 어긋난다 — 쓰지 않고
    // created_at/timestamp를 parseServerDate로 변환한 값에서 직접 포맷한다.
    time: formatTime(date),
    timestamp: createdAt || date.toISOString(),
    extinguisherId: typeof value.extinguisher_id === "number" ? value.extinguisher_id : undefined,
    deviceStatus: toString(value.status) || undefined,
    deviceStatusName: toString(value.status_name) || undefined,
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

// 필수 항목이 빠진 레코드는 화면에 올리지 않는다.
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
