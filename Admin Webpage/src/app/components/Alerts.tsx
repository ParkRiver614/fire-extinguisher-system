import { useMemo, useState, useEffect } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  Droplets,
  Filter,
  Flame,
  PackageX,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { downloadTextFile, toCsv } from "../utils/download";
import { RealtimeStatus } from "./EventLog";
import { AdminRole } from "../types";
import { hasMinRole } from "../permissions";

export type AlertType = "Obstacle" | "Missing" | "Fire" | "Inspection" | "Humidity";
export type AlertStatus = "active" | "resolved";

export interface Alert {
  id: string;
  timestamp: string;
  timestampFull: string;
  zone: string;
  extinguisherId: string;
  type: AlertType;
  detail: string;
  status: AlertStatus;
}

export const INITIAL_ALERTS: Alert[] = [];

const TYPE_CONFIG: Record<AlertType, { label: string; color: string; bg: string; textColor: string; Icon: React.ElementType }> = {
  Obstacle:   { label: "장애물", color: "#F59E0B", bg: "#FEF3C7", textColor: "#92400E", Icon: AlertTriangle },
  Missing:    { label: "미감지", color: "#94A3B8", bg: "#F1F5F9", textColor: "#475569", Icon: PackageX },
  Fire:       { label: "화재",   color: "#EF4444", bg: "#FEE2E2", textColor: "#991B1B", Icon: Flame },
  Inspection: { label: "점검",   color: "#3B82F6", bg: "#DBEAFE", textColor: "#1D4ED8", Icon: Calendar },
  Humidity:   { label: "습도",   color: "#0891B2", bg: "#CFFAFE", textColor: "#0E7490", Icon: Droplets },
};

const STATUS_CONFIG: Record<AlertStatus, { label: string; color: string }> = {
  active: { label: "진행 중", color: "#EF4444" },
  resolved: { label: "해결 완료", color: "#94A3B8" },
};

const PAGE_SIZE = 10;

interface AlertsProps {
  alerts: Alert[];
  status: RealtimeStatus;
  error?: string | null;
  onRefresh: () => Promise<void> | void;
  onResolve: (id: string) => Promise<void> | void;
  externalSearch?: string;
  currentRole?: AdminRole;
}

export function Alerts({ alerts, status, error, onRefresh, onResolve, externalSearch, currentRole = "admin" }: AlertsProps) {
  const canResolve = hasMinRole(currentRole, "operator");
  const [search, setSearch] = useState("");
  const [searchFilter, setSearchFilter] = useState<"all" | "id" | "zone" | "extinguisherId" | "detail">("all");
  const [typeFilter, setTypeFilter] = useState<AlertType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "all">("active");
  const [dateRange, setDateRange] = useState<string>("all");
  const [sortField, setSortField] = useState<keyof Alert | null>("timestampFull");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    if (externalSearch) {
      setSearch(externalSearch);
      setStatusFilter("all");
      setPage(0);
    }
  }, [externalSearch]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const now = new Date();

    return alerts.filter((alert) => {
      const matchType = typeFilter === "all" || alert.type === typeFilter;
      const matchStatus = statusFilter === "all" || alert.status === statusFilter;
      let matchSearch = true;
      if (q) {
        if (searchFilter === "id") matchSearch = alert.id.toLowerCase().includes(q);
        else if (searchFilter === "zone") matchSearch = alert.zone.toLowerCase().includes(q);
        else if (searchFilter === "extinguisherId") matchSearch = alert.extinguisherId.toLowerCase().includes(q);
        else if (searchFilter === "detail") matchSearch = alert.detail.toLowerCase().includes(q);
        else
          matchSearch =
            alert.id.toLowerCase().includes(q) ||
            alert.zone.toLowerCase().includes(q) ||
            alert.extinguisherId.toLowerCase().includes(q) ||
            alert.detail.toLowerCase().includes(q);
      }

      let matchDate = true;
      if (dateRange !== "all") {
        const alertDate = parseAlertDate(alert.timestampFull);
        if (!alertDate) {
          matchDate = false;
        } else {
          const diffDays = Math.floor((startOfDay(now).getTime() - startOfDay(alertDate).getTime()) / 86400000);
          if (dateRange === "today") matchDate = diffDays === 0;
          if (dateRange === "week") matchDate = diffDays >= 0 && diffDays <= 7;
          if (dateRange === "month") matchDate = diffDays >= 0 && diffDays <= 30;
        }
      }

      return matchType && matchStatus && matchSearch && matchDate;
    });
  }, [alerts, dateRange, search, searchFilter, statusFilter, typeFilter]);

  const sorted = useMemo(() => {
    if (!sortField) return filtered;

    return [...filtered].sort((a, b) => {
      const av = String(a[sortField]);
      const bv = String(b[sortField]);
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortDir, sortField]);

  const pageCount = Math.ceil(sorted.length / PAGE_SIZE);
  const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const stats = {
    total: alerts.length,
    active: alerts.filter((alert) => alert.status === "active").length,
    resolved: alerts.filter((alert) => alert.status === "resolved").length,
    fire: alerts.filter((alert) => alert.type === "Fire" && alert.status === "active").length,
  };

  const handleSort = (field: keyof Alert) => {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else {
        setSortField(null);
        setSortDir("asc");
      }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await ensureMinDuration(Promise.resolve(onRefresh()));
      setPage(0);
    } finally {
      setRefreshing(false);
    }
  };

  const handleResolve = async (id: string) => {
    if (resolvingId) return;
    setResolvingId(id);
    try {
      await ensureMinDuration(Promise.resolve(onResolve(id)));
    } finally {
      setResolvingId(null);
    }
  };

  const handleExport = () => {
    const csv = toCsv(
      sorted.map((alert) => ({
        id: alert.id,
        timestamp: alert.timestampFull,
        zone: alert.zone,
        extinguisherId: alert.extinguisherId,
        type: alert.type,
        detail: alert.detail,
        status: alert.status,
      })),
    );
    downloadTextFile("firewatch-alerts.csv", csv, "text/csv;charset=utf-8");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#F4F6F9" }}>
      <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0">
        <div>
          <h1 className="text-slate-800" style={{ fontSize: "17px", fontWeight: 800 }}>알림 및 이벤트</h1>
          <p className="text-slate-400" style={{ fontSize: "11px" }}>System Alerts & Event Logs · 서버 실시간 스트림</p>
        </div>

        <div className="flex items-center gap-2">
          <StatusChip status={status} />
          <StatChip icon={AlertCircle} color="#2563EB" bg="#DBEAFE" count={stats.total} label="전체 알림" />
          <StatChip icon={AlertTriangle} color="#EF4444" bg="#FEE2E2" count={stats.active} label="진행 중" />
          <StatChip icon={Flame} color="#DC2626" bg="#FEE2E2" count={stats.fire} label="화재 경고" />
          <StatChip icon={CheckCircle} color="#16A34A" bg="#DCFCE7" count={stats.resolved} label="해결 완료" />
        </div>
      </div>

      <div className="flex-1 mx-6 mb-6 overflow-hidden">
        <div
          className="bg-white rounded-2xl flex flex-col overflow-hidden h-full"
          style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "1px solid #EEF2F7" }}
        >
          <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid #F1F5F9" }}>
            <SelectShell icon={Calendar} minWidth={140}>
              <select
                value={dateRange}
                onChange={(event) => {
                  setDateRange(event.target.value);
                  setPage(0);
                }}
                className="flex-1 bg-transparent outline-none text-slate-700 cursor-pointer appearance-none pr-4"
                style={{ fontSize: "12px" }}
              >
                <option value="all">전체 기간</option>
                <option value="today">오늘</option>
                <option value="week">최근 7일</option>
                <option value="month">최근 30일</option>
              </select>
            </SelectShell>

            <SelectShell icon={Filter} minWidth={140}>
              <select
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value as AlertType | "all");
                  setPage(0);
                }}
                className="flex-1 bg-transparent outline-none text-slate-700 cursor-pointer appearance-none pr-4"
                style={{ fontSize: "12px" }}
              >
                <option value="all">전체 유형</option>
                {(Object.keys(TYPE_CONFIG) as AlertType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
                ))}
              </select>
            </SelectShell>

            <div className="flex items-center gap-1.5">
              {(["all", "active", "resolved"] as const).map((filter) => {
                const isActive = statusFilter === filter;
                const label = filter === "all" ? "전체" : STATUS_CONFIG[filter].label;
                return (
                  <button
                    key={filter}
                    onClick={() => {
                      setStatusFilter(filter);
                      setPage(0);
                    }}
                    className="px-2.5 py-1 rounded-lg transition-all"
                    style={{
                      fontSize: "10px",
                      fontWeight: isActive ? 700 : 500,
                      background: isActive ? (filter === "active" ? "#FEE2E2" : filter === "resolved" ? "#F1F5F9" : "#EFF6FF") : "#F8FAFC",
                      color: isActive ? (filter === "active" ? "#991B1B" : filter === "resolved" ? "#475569" : "#2563EB") : "#64748B",
                      border: `1px solid ${isActive ? (filter === "active" ? "#FCA5A5" : filter === "resolved" ? "#CBD5E1" : "#BFDBFE") : "#E2E8F0"}`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex-1" />

            <div className="flex items-center bg-slate-50 rounded-xl border border-slate-100 w-80 focus-within:border-blue-300 focus-within:bg-white transition-all overflow-hidden">
              <select
                value={searchFilter}
                onChange={(event) => {
                  setSearchFilter(event.target.value as "all" | "id" | "zone" | "extinguisherId" | "detail");
                  setPage(0);
                }}
                className="outline-none bg-transparent cursor-pointer text-slate-500 hover:text-slate-700 transition-colors"
                style={{ fontSize: "11px", fontWeight: 700, padding: "8px 6px 8px 10px", flexShrink: 0, borderRight: "1px solid #E2E8F0" }}
              >
                <option value="all">전체</option>
                <option value="id">ID</option>
                <option value="zone">구역</option>
                <option value="extinguisherId">장치</option>
                <option value="detail">상세</option>
              </select>
              <div className="flex items-center gap-2 flex-1 px-2.5 py-2 min-w-0">
                <Search size={13} style={{ color: "#94A3B8", flexShrink: 0 }} />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(0);
                  }}
                  placeholder={
                    searchFilter === "id"             ? "알림 ID 검색…" :
                    searchFilter === "zone"           ? "구역 검색…" :
                    searchFilter === "extinguisherId" ? "장치 ID 검색…" :
                    searchFilter === "detail"         ? "상세 내용 검색…" :
                    "ID, 구역, 장치, 상세 내용 검색"
                  }
                  className="flex-1 bg-transparent outline-none text-slate-700 placeholder-slate-300 min-w-0"
                  style={{ fontSize: "12px" }}
                />
                {search && <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500"><X size={11} /></button>}
              </div>
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-500 hover:bg-slate-50 transition-colors"
              style={{ fontSize: "11px", fontWeight: 500, border: "1px solid #E2E8F0", opacity: refreshing ? 0.65 : 1 }}
              title="서버에서 알림 다시 불러오기"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            </button>

            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-500 hover:bg-slate-50 transition-colors"
              style={{ fontSize: "11px", fontWeight: 500, border: "1px solid #E2E8F0" }}
            >
              <Download size={12} />
              내보내기
            </button>
          </div>

          {error && (
            <div className="mx-5 my-4 rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-red-600" style={{ fontSize: "12px" }}>
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            <table className="w-full border-collapse" style={{ height: "100%" }}>
              <thead className="sticky top-0" style={{ background: "#FAFBFC", borderBottom: "1px solid #EEF2F7", zIndex: 10 }}>
                <tr>
                  <Th label="#" align="center" />
                  <Th label="알림 ID" field="id" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <Th label="발생 시각" field="timestampFull" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <Th label="구역" field="zone" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <Th label="장치 ID" field="extinguisherId" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <Th label="유형" field="type" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <Th label="알림 상세" field="detail" />
                  <Th label="상태" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="center" />
                  <Th label="작업" align="center" />
                </tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-slate-300" style={{ fontSize: "13px" }}>
                      서버에서 수신된 알림이 없습니다
                    </td>
                  </tr>
                ) : (
                  <>
                    {pageItems.map((alert, idx) => {
                    const typeConfig = TYPE_CONFIG[alert.type];
                    const rowNum = page * PAGE_SIZE + idx + 1;
                    const isActive = alert.status === "active";
                    return (
                      <tr
                        key={alert.id}
                        className="transition-colors group"
                        style={{ height: `${100 / PAGE_SIZE}%`, background: "white", borderBottom: "1px solid #F8FAFC" }}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.background = "#FAFBFC";
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.background = "white";
                        }}
                      >
                        <td className="px-4 py-3.5 text-center text-slate-300" style={{ fontSize: "11px" }}>{rowNum}</td>
                        <td className="px-4 py-3.5">
                          <span className="text-slate-700" style={{ fontSize: "12px", fontWeight: 700, fontFamily: "monospace" }}>
                            {alert.id}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div>
                            <div className="text-slate-700" style={{ fontSize: "12px", fontWeight: 600 }}>{alert.timestamp}</div>
                            <div className="text-slate-400" style={{ fontSize: "10px", fontFamily: "monospace" }}>
                              {alert.timestampFull.split(" ")[1] ?? ""}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-slate-600" style={{ fontSize: "12px" }}>{alert.zone}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: isActive ? "#EF4444" : "#94A3B8" }} />
                            <span className="text-slate-800" style={{ fontSize: "12px", fontWeight: 700 }}>
                              {alert.extinguisherId}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full"
                            style={{ fontSize: "10px", fontWeight: 700, background: typeConfig.bg, color: typeConfig.textColor }}
                          >
                            <typeConfig.Icon size={9} />
                            {typeConfig.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-slate-600" style={{ fontSize: "12px" }}>{alert.detail}</span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span
                            className="inline-block px-2 py-0.5 rounded-md"
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              background: isActive ? "#FEE2E2" : "#F1F5F9",
                              color: isActive ? "#991B1B" : "#64748B",
                            }}
                          >
                            {STATUS_CONFIG[alert.status].label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {isActive && canResolve ? (
                            <button
                              onClick={() => handleResolve(alert.id)}
                              disabled={resolvingId === alert.id}
                              className="px-3 py-1.5 rounded-lg transition-all hover:opacity-90 disabled:opacity-60"
                              style={{
                                fontSize: "11px",
                                fontWeight: 600,
                                background: "linear-gradient(135deg, #16A34A, #22C55E)",
                                color: "white",
                                boxShadow: "0 2px 8px rgba(22,163,74,0.25)",
                              }}
                            >
                              {resolvingId === alert.id ? "처리 중" : "해결"}
                            </button>
                          ) : isActive ? (
                            <span className="text-slate-300" style={{ fontSize: "10px" }}>진행 중</span>
                          ) : (
                            <span className="text-slate-300" style={{ fontSize: "10px" }}>완료</span>
                          )}
                        </td>
                      </tr>
                    );
                    })}
                    {Array.from({ length: PAGE_SIZE - pageItems.length }, (_, i) => (
                      <tr key={`ph-${i}`} style={{ height: `${100 / PAGE_SIZE}%`, borderBottom: "1px solid #F8FAFC" }}>
                        <td colSpan={9} />
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>

          <div
            className="flex items-center justify-between px-5 py-3 flex-shrink-0"
            style={{ borderTop: "1px solid #F1F5F9", background: "#FAFBFC" }}
          >
            <p className="text-slate-400" style={{ fontSize: "11px" }}>
              {sorted.length > 0
                ? `${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, sorted.length)} / 총 ${sorted.length}개 알림`
                : "0개 알림"}
            </p>
            <div className="flex items-center gap-1">
              <PageBtn disabled={page === 0} onClick={() => setPage(page - 1)} label="‹" />
              {Array.from({ length: pageCount }, (_, i) => (
                <PageBtn key={i} active={i === page} onClick={() => setPage(i)} label={String(i + 1)} />
              ))}
              <PageBtn disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)} label="›" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectShell({ icon: Icon, minWidth, children }: { icon: React.ElementType; minWidth: number; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div
        className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100 min-w-[140px] cursor-pointer hover:border-blue-300 hover:bg-white transition-all"
        style={{ minWidth }}
      >
        <Icon size={13} style={{ color: "#94A3B8", flexShrink: 0 }} />
        {children}
        <ChevronDown size={11} style={{ color: "#94A3B8", position: "absolute", right: "10px", pointerEvents: "none" }} />
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: RealtimeStatus }) {
  const isLive = status === "connected";
  const isError = status === "error";
  const label = status === "connecting" ? "연결 중" : isLive ? "LIVE" : isError ? "오류" : "오프라인";

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: isLive ? "#ECFDF5" : isError ? "#FEF2F2" : "#F8FAFC", border: "1px solid #E2E8F0" }}>
      <span className={`w-2 h-2 rounded-full ${isLive ? "bg-green-400 animate-pulse" : isError ? "bg-red-400" : "bg-slate-300"}`} />
      <span className="text-slate-600" style={{ fontSize: "10px", fontWeight: 700 }}>{label}</span>
    </div>
  );
}

function StatChip({ icon: Icon, color, bg, count, label }: { icon: React.ElementType; color: string; bg: string; count: number; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: bg, border: `1px solid ${color}20` }}>
      <Icon size={13} style={{ color }} />
      <div>
        <p style={{ fontSize: "15px", fontWeight: 800, color: "#0F172A", lineHeight: "1" }}>{count}</p>
        <p style={{ fontSize: "9px", color: "#94A3B8", lineHeight: "1" }}>{label}</p>
      </div>
    </div>
  );
}

function Th({
  label,
  field,
  sortField,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  field?: keyof Alert;
  sortField?: keyof Alert | null;
  sortDir?: "asc" | "desc";
  onSort?: (field: keyof Alert) => void;
  align?: "left" | "center";
}) {
  const isActive = field && sortField === field;
  return (
    <th
      className={`px-4 py-3 ${align === "center" ? "text-center" : "text-left"} ${field && onSort ? "cursor-pointer select-none" : ""}`}
      style={{ fontSize: "10px", fontWeight: 700, color: isActive ? "#2563EB" : "#94A3B8", letterSpacing: "0", whiteSpace: "nowrap" }}
      onClick={() => field && onSort?.(field)}
    >
      <div className={`flex items-center gap-1 ${align === "center" ? "justify-center" : ""}`}>
        {label.toUpperCase()}
        {field && onSort && (
          <span style={{ opacity: 0.5 }}>
            {isActive ? (
              sortDir === "asc" ? <ChevronUp size={10} style={{ color: "#2563EB", opacity: 1 }} /> : <ChevronDown size={10} style={{ color: "#2563EB", opacity: 1 }} />
            ) : (
              <ChevronsUpDown size={10} />
            )}
          </span>
        )}
      </div>
    </th>
  );
}

function PageBtn({ label, active, disabled, onClick }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
      style={{
        fontSize: "11px",
        fontWeight: active ? 700 : 400,
        background: active ? "#2563EB" : disabled ? "transparent" : "#F8FAFC",
        color: active ? "white" : disabled ? "#CBD5E1" : "#475569",
        border: active ? "none" : "1px solid #E2E8F0",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

const MIN_LOADING_MS = 400;

async function ensureMinDuration<T>(promise: Promise<T>): Promise<T> {
  const [result] = await Promise.all([promise, new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS))]);
  return result;
}

function parseAlertDate(value: string) {
  const normalized = value.replace(/\./g, "-");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}
