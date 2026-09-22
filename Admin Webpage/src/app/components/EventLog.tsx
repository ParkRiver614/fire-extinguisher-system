/**
 * 대시보드 오른쪽 실시간 이벤트 로그 패널.
 * useRealtimeEvents가 받아 온 이벤트를 최신순으로 보여 주고,
 * 상단에 스트림 연결 상태(LIVE/연결 중/오프라인/오류)를 표시한다.
 */
import { AlertTriangle, CheckCircle, Clock, Loader2, PlugZap, Wifi, Zap } from "lucide-react";

export type EventLogType = "normal" | "warning" | "error" | "info";

export interface EventLogEntry {
  id: string;
  type: EventLogType;
  text: string;
  sub: string;
  time: string;
  timestamp?: string;
  extinguisherId?: number;
  deviceStatus?: string;
  deviceStatusName?: string;
}

export type RealtimeStatus = "connecting" | "connected" | "disconnected" | "error";

// 이벤트 종류별 아이콘·색상
const TYPE_CONFIG: Record<EventLogType, { icon: React.ElementType; color: string; bg: string; text: string }> = {
  normal: { icon: CheckCircle, color: "#22C55E", bg: "#F0FDF4", text: "정상" },
  warning: { icon: AlertTriangle, color: "#F59E0B", bg: "#FFFBEB", text: "경고" },
  error: { icon: Zap, color: "#EF4444", bg: "#FEF2F2", text: "이상" },
  info: { icon: Wifi, color: "#3B82F6", bg: "#EFF6FF", text: "정보" },
};

const STATUS_LABEL: Record<RealtimeStatus, string> = {
  connecting: "연결 중",
  connected: "LIVE",
  disconnected: "오프라인",
  error: "연결 오류",
};

interface EventLogProps {
  entries: EventLogEntry[];
  status: RealtimeStatus;
  error?: string | null;
}

export function EventLog({ entries, status, error }: EventLogProps) {
  const isLive = status === "connected";

  return (
    <div
      className="w-[280px] flex-shrink-0 bg-white flex flex-col overflow-hidden"
      style={{ borderLeft: "1px solid #F1F5F9" }}
    >
      <div className="px-4 pt-4 pb-3 border-b border-slate-50 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isLive ? "bg-green-400 animate-pulse" : "bg-slate-300"}`} />
            <span className="text-slate-700" style={{ fontSize: "13px", fontWeight: 700 }}>
              이벤트 로그
            </span>
          </div>
          <span
            className={status === "error" ? "text-red-500" : isLive ? "text-green-500" : "text-slate-400"}
            style={{ fontSize: "10px", fontWeight: 700 }}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {(["normal", "warning", "error"] as const).map((type) => {
            const config = TYPE_CONFIG[type];
            return (
              <span
                key={type}
                className="px-2 py-0.5 rounded-full"
                style={{ fontSize: "10px", fontWeight: 600, background: config.bg, color: config.color }}
              >
                {config.text} {entries.filter((entry) => entry.type === type).length}
              </span>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-red-600" style={{ fontSize: "11px" }}>
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {status === "connecting" && entries.length === 0 ? (
          <EmptyState icon={Loader2} title="이벤트 스트림 연결 중" description="서버에서 실시간 이벤트를 불러오고 있습니다." spin />
        ) : entries.length === 0 ? (
          <EmptyState icon={PlugZap} title="수신된 이벤트가 없습니다" description="실시간 스트림에서 이벤트가 도착하면 여기에 표시됩니다." />
        ) : (
          entries.map((entry) => {
            const config = TYPE_CONFIG[entry.type];
            const Icon = config.icon;
            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors"
              >
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: config.bg }}
                >
                  <Icon size={12} style={{ color: config.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-700 truncate" style={{ fontSize: "11px", fontWeight: 600, lineHeight: "1.3" }}>
                    {entry.text}
                  </p>
                  <p className="text-slate-400 truncate" style={{ fontSize: "10px", lineHeight: "1.3", marginTop: "1px" }}>
                    {entry.sub}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <Clock size={8} style={{ color: "#CBD5E1" }} />
                    <span style={{ fontSize: "9px", color: "#CBD5E1" }}>{entry.time}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-slate-50 bg-slate-50/50 flex-shrink-0">
        <p className="text-center text-slate-300" style={{ fontSize: "10px" }}>
          총 {entries.length}개 이벤트 · 서버 실시간 스트림
        </p>
      </div>
    </div>
  );
}

// 이벤트가 없거나 연결이 끊겼을 때 보여 주는 안내
function EmptyState({
  icon: Icon,
  title,
  description,
  spin,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  spin?: boolean;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-center text-slate-400">
      <Icon size={22} className={spin ? "animate-spin" : ""} />
      <p className="mt-3 text-slate-600" style={{ fontSize: "12px", fontWeight: 700 }}>
        {title}
      </p>
      <p className="mt-1" style={{ fontSize: "10px", lineHeight: "1.4" }}>
        {description}
      </p>
    </div>
  );
}
