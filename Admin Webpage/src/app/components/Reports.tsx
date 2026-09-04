/**
 * 보고서 화면.
 *
 * 소화기 목록과 알림을 집계해 KPI(총 대수·이상 건수·점검률 등), 상태 분포,
 * 층·구역별 현황, 유효기간 임박 목록, 유지보수 추이를 차트와 표로 보여 준다.
 * 서버에 따로 요청하지 않고 상위(App)가 들고 있는 데이터를 계산해 쓰며,
 * CSV 또는 인쇄용 PDF로 내보낼 수 있다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ElementType } from "react";
import { usePersistentState } from "../hooks/usePersistentState";
import type { Alert } from "./Alerts";
import { FloorConfig, DEFAULT_FLOORS } from "./Settings";
import {
  AlertTriangle,
  Battery,
  Bell,
  Calendar,
  CheckCircle,
  ChevronDown,
  ClipboardCheck,
  Download,
  MapPin,
  ShieldCheck,
  TrendingUp,
  Wrench,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { downloadTextFile, toCsv } from "../utils/download";
import { parseServerDate } from "../utils/date";
import type { Device, DeviceStatus } from "../types";
import type { SidebarPage } from "./Sidebar";

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

// PDF 출력은 HTML 문자열을 만들어 인쇄창에 넘기므로, 값에 든 태그 문자를 반드시 이스케이프한다.
function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c]);
}

interface ReportsProps {
  devices: Device[];
  alerts?: Alert[];
  onNavigate?: (page: SidebarPage) => void;
}

const STATUS_CONFIG: Record<DeviceStatus, { label: string; color: string; bg: string; text: string }> = {
  normal:      { label: "정상",     color: "#22C55E", bg: "#DCFCE7", text: "#15803D" },
  warning:     { label: "경고",     color: "#F59E0B", bg: "#FEF3C7", text: "#B45309" },
  error:       { label: "이탈",     color: "#EF4444", bg: "#FEE2E2", text: "#991B1B" },
  fire:        { label: "화재",     color: "#DC2626", bg: "#FEE2E2", text: "#991B1B" },
  offline:     { label: "오프라인", color: "#94A3B8", bg: "#F1F5F9", text: "#475569" },
  maintenance: { label: "유지보수", color: "#8B5CF6", bg: "#F3E8FF", text: "#6D28D9" },
  obstacle:    { label: "장애물",   color: "#FB923C", bg: "#FFEDD5", text: "#C2410C" },
};

export function Reports({ devices, alerts = [], onNavigate }: ReportsProps) {
  const today = useMemo(() => new Date(), []);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // 설정 화면에서 저장한 층 구성·점검 주기를 그대로 가져와 집계 기준으로 쓴다.
  const [floorConfigs] = usePersistentState<FloorConfig[]>("firewatch.settings.floors.saved", DEFAULT_FLOORS);
  const [savedSettings] = usePersistentState<{ inspectionCycle?: string }>("firewatch.settings.saved", { inspectionCycle: "30" });
  const inspectionCycle = Math.max(1, parseInt(savedSettings.inspectionCycle ?? "30", 10) || 30);

  const unresolvedAlerts = useMemo(() => alerts.filter((a) => a.status === "active").length, [alerts]);

  const alertsByType = useMemo(() => {
    const active = alerts.filter((a) => a.status === "active");
    return {
      fire: active.filter((a) => a.type === "Fire").length,
      missing: active.filter((a) => a.type === "Missing").length,
      obstacle: active.filter((a) => a.type === "Obstacle").length,
    };
  }, [alerts]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // 상태별 소화기 수(도넛 차트용). 정의에 없는 상태가 와도 회색으로 표시한다.
  const statusData = useMemo(() => {
    const counts = new Map<string, number>();
    devices.forEach((d) => { counts.set(d.status, (counts.get(d.status) ?? 0) + 1); });
    return Array.from(counts.entries()).map(([status, count]) => ({
      status,
      count,
      ...(STATUS_CONFIG[status as DeviceStatus] ?? {
        label: devices.find((d) => d.status === status)?.status_name || status,
        color: "#64748B", bg: "#F1F5F9", text: "#475569",
      }),
    }));
  }, [devices]);

  // 층별 총 대수와 정상 비율. 설정에 등록된 층은 소화기가 0대여도 표에 남긴다.
  const floorStats = useMemo(() => {
    const map = new Map<string, { total: number; normal: number; level: number }>();
    floorConfigs.forEach((f, i) => {
      map.set(f.key, { total: 0, normal: 0, level: i + 1 });
    });
    devices.forEach((d) => {
      const prev = map.get(d.floor_name);
      if (prev) {
        map.set(d.floor_name, { level: prev.level, total: prev.total + 1, normal: prev.normal + (d.status === "normal" ? 1 : 0) });
      } else {
        map.set(d.floor_name, { total: 1, normal: d.status === "normal" ? 1 : 0, level: d.level });
      }
    });
    return Array.from(map.entries())
      .map(([floor, s]) => ({ floor, total: s.total, normal: s.normal, rate: s.total > 0 ? Math.round((s.normal / s.total) * 100) : 0, level: s.level }))
      .sort((a, b) => a.level - b.level);
  }, [devices, floorConfigs]);

  // 유효기간이 임박한 순으로 최대 12대(남은 일수는 음수면 이미 만료).
  const expiryList = useMemo(() => [...devices]
    .map((d) => ({ ...d, daysLeft: Math.ceil((new Date(d.expiry_date).getTime() - today.getTime()) / 86400000) }))
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 12),
  [devices, today]);

  const lowBattery = useMemo(
    () => [...devices].filter((d) => d.battery_level != null && d.battery_level <= 30).sort((a, b) => a.battery_level - b.battery_level),
    [devices]
  );

  const maintenanceLogs = useMemo(() =>
    devices
      .flatMap((d) => d.maintenance_logs.map((log) => ({ ...log, deviceId: d.id })))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20),
  [devices]);

  // 최근 6개월 유지보수 건수 추이(막대 차트용)
  const monthlyTrend = useMemo(() => {
    const allLogs = devices.flatMap((d) => d.maintenance_logs);
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getMonth() + 1}월`;
      const count = allLogs.filter((log) => log.created_at?.startsWith(key)).length;
      return { month: label, count, isCurrent: i === 5 };
    });
  }, [devices, today]);

  // 점검률 — 설정된 점검 주기(일) 안에 유지보수 이력이 한 번이라도 있는 소화기의 비율.
  const inspectionRate = useMemo(() => {
    const cutoff = new Date(today.getTime() - inspectionCycle * 86400000);
    const inspected = new Set(
      devices
        .flatMap((d) => d.maintenance_logs.map((log) => ({ deviceId: d.id, date: log.created_at })))
        .filter(({ date }) => new Date(date) >= cutoff)
        .map(({ deviceId }) => deviceId)
    );
    const rate = devices.length > 0 ? Math.round((inspected.size / devices.length) * 100) : 0;
    return { completed: inspected.size, total: devices.length, rate };
  }, [devices, today, inspectionCycle]);

  // 구역별 총 대수와 이상 대수(정상이 아닌 상태를 이상으로 센다)
  const zoneStats = useMemo(() => {
    const map = new Map<number, { zone_id: number; zone_name: string; floor_name: string; total: number; issues: number }>();
    devices.forEach((d) => {
      const prev = map.get(d.zone_id) ?? { zone_id: d.zone_id, zone_name: d.zone_name, floor_name: d.floor_name, total: 0, issues: 0 };
      map.set(d.zone_id, { ...prev, total: prev.total + 1, issues: prev.issues + (d.status !== "normal" ? 1 : 0) });
    });
    return Array.from(map.values()).sort((a, b) => (a.floor_name ?? "").localeCompare(b.floor_name ?? ""));
  }, [devices]);

  const totalDevices = devices.length;
  const issueCount = devices.filter((d) => d.status !== "normal").length;
  const expiryWithin365 = expiryList.filter((d) => d.daysLeft <= 365).length;

  const handleExportCsv = () => {
    const rows = devices.map((d) => ({ id: d.id, status: d.status_name, floor: d.floor_name, zone: d.zone_name, battery: `${d.battery_level}%`, expiry: d.expiry_date, admin: d.admin_name ?? "" }));
    downloadTextFile("firewatch-report.csv", toCsv(rows), "text/csv;charset=utf-8");
    setExportOpen(false);
  };

  // PDF 내보내기 — 인쇄용 HTML을 새 창에 띄워 브라우저 인쇄(PDF로 저장) 기능을 쓴다.
  const handleExportPdf = () => {
    setExportOpen(false);

    const dateStr = today.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

    const deviceRows = devices
      .map((d) => {
        const daysLeft = Math.ceil((new Date(d.expiry_date).getTime() - today.getTime()) / 86400000);
        const statusLabel = STATUS_CONFIG[d.status]?.label ?? d.status;
        return `<tr>
          <td>${escapeHtml(d.id)}</td>
          <td>${escapeHtml(d.floor_name)}</td>
          <td>${escapeHtml(d.zone_name)}</td>
          <td><span class="badge badge-${escapeHtml(d.status)}">${escapeHtml(statusLabel)}</span></td>
          <td>${d.battery_level}%</td>
          <td>${escapeHtml(d.expiry_date)} (${daysLeft}일)</td>
          <td>${escapeHtml(d.admin_name ?? "−")}</td>
        </tr>`;
      })
      .join("");

    const statusSummaryRows = statusData
      .map((s) => `<tr><td>${escapeHtml(s.label)}</td><td>${s.count}대</td><td>${Math.round((s.count / totalDevices) * 100)}%</td></tr>`)
      .join("");

    const floorRows = floorStats
      .map((f) => `<tr><td>${escapeHtml(f.floor)}</td><td>${f.total}대</td><td>${f.normal}대</td><td>${f.rate}%</td></tr>`)
      .join("");

    const maintenanceRows = maintenanceLogs
      .map((log) => `<tr>
        <td>${escapeHtml(log.deviceId)}</td>
        <td>${escapeHtml(log.admin_name)}</td>
        <td>${escapeHtml(log.action_taken)}</td>
        <td>${parseServerDate(log.created_at).toLocaleDateString("ko-KR")}</td>
      </tr>`)
      .join("");

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>FireGuard 보고서 − ${dateStr}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; font-size: 12px; color: #1e293b; padding: 32px; }
    h1 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
    .meta { font-size: 11px; color: #64748b; margin-bottom: 28px; }
    h2 { font-size: 14px; font-weight: 700; margin: 24px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; }
    .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 8px; }
    .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
    .kpi-value { font-size: 22px; font-weight: 800; }
    .kpi-label { font-size: 11px; color: #475569; font-weight: 600; margin-top: 2px; }
    .kpi-sub { font-size: 9px; color: #94a3b8; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #f1f5f9; text-align: left; padding: 6px 8px; font-weight: 700; color: #475569; }
    td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; }
    .badge-normal      { background: #dcfce7; color: #15803d; }
    .badge-warning     { background: #fef3c7; color: #b45309; }
    .badge-error       { background: #fee2e2; color: #991b1b; }
    .badge-offline     { background: #f1f5f9; color: #475569; }
    .badge-maintenance { background: #f3e8ff; color: #6d28d9; }
    .badge-obstacle    { background: #ffedd5; color: #c2410c; }
    @media print {
      body { padding: 16px; }
      h2 { page-break-before: auto; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>FireGuard 소화기 관리 보고서</h1>
  <p class="meta">생성일: ${dateStr} &nbsp;|&nbsp; 전체 장치 ${totalDevices}대</p>

  <h2>요약 현황</h2>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-value">${totalDevices}</div><div class="kpi-label">전체 소화기</div></div>
    <div class="kpi"><div class="kpi-value">${issueCount}</div><div class="kpi-label">이상 장치</div></div>
    <div class="kpi"><div class="kpi-value">${expiryWithin365}</div><div class="kpi-label">만료 임박 (1년)</div></div>
    <div class="kpi"><div class="kpi-value">${lowBattery.length}</div><div class="kpi-label">배터리 부족 (≤30%)</div></div>
    <div class="kpi"><div class="kpi-value">${unresolvedAlerts}</div><div class="kpi-label">미처리 알림</div></div>
  </div>
  <div class="kpi-grid" style="margin-top:10px;">
    <div class="kpi" style="grid-column:1/3"><div class="kpi-value">${inspectionRate.rate}%</div><div class="kpi-label">점검 완료율 (최근 ${inspectionCycle}일)</div><div class="kpi-sub">${inspectionRate.completed} / ${inspectionRate.total}대 완료</div></div>
  </div>

  <h2>상태별 분포</h2>
  <table>
    <thead><tr><th>상태</th><th>대수</th><th>비율</th></tr></thead>
    <tbody>${statusSummaryRows}</tbody>
  </table>

  <h2>층별 정상 비율</h2>
  <table>
    <thead><tr><th>층</th><th>전체</th><th>정상</th><th>정상 비율</th></tr></thead>
    <tbody>${floorRows}</tbody>
  </table>

  <h2>전체 소화기 목록</h2>
  <table>
    <thead><tr><th>장치 ID</th><th>층</th><th>구역</th><th>상태</th><th>배터리</th><th>만료일</th><th>담당자</th></tr></thead>
    <tbody>${deviceRows}</tbody>
  </table>

  <h2>최근 유지보수 이력 (최근 20건)</h2>
  <table>
    <thead><tr><th>장치 ID</th><th>담당자</th><th>조치 내용</th><th>일시</th></tr></thead>
    <tbody>${maintenanceRows}</tbody>
  </table>
</body>
</html>`;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.addEventListener("load", () => {
      printWindow.focus();
      printWindow.print();
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#F4F6F9" }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ background: "#F4F6F9" }}>
        <div>
          <h1 className="text-slate-800" style={{ fontSize: "15px", fontWeight: 800 }}>보고서 및 분석</h1>
          <p className="text-slate-400" style={{ fontSize: "10px" }}>Reports & Analytics · 전체 {totalDevices}대 장치</p>
        </div>
        <div className="relative" ref={exportRef}>
          <button
            onClick={() => setExportOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            style={{ fontSize: "11px", fontWeight: 500, border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#64748B" }}
          >
            <Download size={11} />
            내보내기
            <ChevronDown size={11} style={{ transform: exportOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>
          {exportOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-xl overflow-hidden z-50" style={{ border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: "140px" }}>
              {[
                { label: "CSV 내보내기",  desc: ".csv 파일",       fn: handleExportCsv  },
                { label: "PDF 인쇄",      desc: "프린트 다이얼로그", fn: handleExportPdf  },
              ].map(({ label, desc, fn }) => (
                <button key={label} onClick={fn} className="w-full flex flex-col items-start px-3 py-2 hover:bg-slate-50 transition-colors text-left">
                  <span className="text-slate-700" style={{ fontSize: "12px", fontWeight: 600 }}>{label}</span>
                  <span className="text-slate-400" style={{ fontSize: "9px" }}>{desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Dashboard body ── */}
      <div className="flex-1 min-h-0 flex flex-col gap-3 p-4 overflow-hidden">

        {/* KPI Row — 5 cards */}
        <div className="grid grid-cols-5 gap-3 flex-shrink-0">
          <KpiCard icon={ShieldCheck}   iconBg="#DCFCE7" iconColor="#22C55E" value={String(totalDevices)}       label="전체 소화기"        sublabel="Total Devices" />
          <KpiCard icon={AlertTriangle} iconBg="#FEE2E2" iconColor="#EF4444" value={String(issueCount)}         label="이상 장치"          sublabel="Warning / Error / Offline"  alert={issueCount > 0} />
          <KpiCard icon={Calendar}      iconBg="#FEF3C7" iconColor="#F59E0B" value={String(expiryWithin365)}    label="만료 임박 (1년)"    sublabel="Expiring within 365 days"   alert={expiryWithin365 > 0} />
          <KpiCard icon={Battery}       iconBg="#F3E8FF" iconColor="#8B5CF6" value={String(lowBattery.length)} label="배터리 부족 (≤30%)" sublabel="Low Battery Devices"        alert={lowBattery.length > 0} />
          <KpiCard
            icon={Bell}
            iconBg={unresolvedAlerts > 0 ? "#FEF3C7" : "#F0FDF4"}
            iconColor={unresolvedAlerts > 0 ? "#D97706" : "#22C55E"}
            value={String(unresolvedAlerts)}
            label="미처리 알림"
            sublabel={unresolvedAlerts === 0 ? "모두 처리됨" : `화재 ${alertsByType.fire} · 이탈 ${alertsByType.missing} · 장애물 ${alertsByType.obstacle}`}
            alert={unresolvedAlerts > 0}
            onAction={onNavigate ? () => onNavigate("alerts") : undefined}
            actionLabel="바로가기"
          />
        </div>

        {/* Main grid */}
        <div
          className="flex-1 min-h-0"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 260px",
            gridTemplateRows: "1fr 1fr",
            gap: "12px",
          }}
        >
          {/* ① Status pie — row 1 col 1 */}
          <Card style={{ gridArea: "1 / 1 / 2 / 2" }}>
            <CardHeader title="소화기 상태 분포" subtitle="Device Status Distribution" />
            <div className="flex items-center gap-4 flex-1 min-h-0">
              <div style={{ width: 130, height: "100%", flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} dataKey="count" nameKey="label" innerRadius="48%" outerRadius="78%" paddingAngle={statusData.length > 1 ? 3 : 0} startAngle={90} endAngle={-270}>
                      {statusData.map((e) => <Cell key={e.status} fill={e.color} stroke="none" />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [`${v}대`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-2 flex-1">
                {statusData.map((s) => (
                  <div key={s.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-slate-700" style={{ fontSize: "11px" }}>{s.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-900" style={{ fontSize: "12px", fontWeight: 700 }}>{s.count}대</span>
                      <span className="px-1.5 py-0.5 rounded" style={{ fontSize: "10px", fontWeight: 600, background: s.bg, color: s.text }}>
                        {Math.round((s.count / totalDevices) * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* ② Monthly trend — row 1 col 2 */}
          <Card style={{ gridArea: "1 / 2 / 2 / 3" }}>
            <CardHeader title="월별 이상 발생 추이 (최근 6개월)" subtitle="Monthly Issue Trend (Last 6 months)" icon={TrendingUp} />
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}건`, "이상 건수"]} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={32}>
                    {monthlyTrend.map((e, idx) => (
                      <Cell key={idx} fill={e.isCurrent ? "#3B82F6" : "#CBD5E1"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* ③ Floor bar — row 1 col 3 */}
          <Card style={{ gridArea: "1 / 3 / 2 / 4" }}>
            <CardHeader title="층별 정상 비율" subtitle="Normal Rate by Floor" />
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={floorStats} layout="vertical" margin={{ top: 4, right: 42, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: "#94A3B8", fontSize: 11 }} tickLine={false} axisLine={false} unit="%" />
                  <YAxis type="category" dataKey="floor" tick={{ fill: "#64748B", fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number, _n: string, p: { payload: { normal: number; total: number } }) => p.payload.total === 0 ? ["장치 미등록", "−"] : [`${v}% (${p.payload.normal}/${p.payload.total}대)`, "정상 비율"]} />
                  <Bar dataKey="rate" radius={[0, 5, 5, 0]} maxBarSize={20}>
                    {floorStats.map((e) => <Cell key={e.floor} fill={e.total === 0 ? "#E2E8F0" : e.rate >= 90 ? "#22C55E" : e.rate >= 70 ? "#F59E0B" : "#EF4444"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* ④ Right panel — spans both rows, col 4 */}
          <div className="flex flex-col gap-3 min-h-0 overflow-hidden" style={{ gridArea: "1 / 4 / 3 / 5" }}>

            {/* Inspection completion rate */}
            <div className="bg-white rounded-2xl px-4 py-3 flex-shrink-0" style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "1px solid #EEF2F7" }}>
              <div className="flex items-center justify-between mb-2.5">
                <div>
                  <p className="text-slate-800" style={{ fontSize: "13px", fontWeight: 800 }}>점검 완료율</p>
                  <p className="text-slate-400" style={{ fontSize: "10px" }}>최근 {inspectionCycle}일 이내 점검</p>
                </div>
                <ClipboardCheck size={13} style={{ color: "#94A3B8" }} />
              </div>
              <div className="flex items-end justify-between mb-2">
                <span className="text-slate-900" style={{ fontSize: "24px", fontWeight: 800, lineHeight: 1 }}>{inspectionRate.rate}%</span>
                <span className="text-slate-400" style={{ fontSize: "11px" }}>{inspectionRate.completed} / {inspectionRate.total}대</span>
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: 10 }, (_, i) => {
                  const filled = i < Math.round(inspectionRate.rate / 10);
                  const barColor = inspectionRate.rate >= 80 ? "#22C55E" : inspectionRate.rate >= 50 ? "#F59E0B" : "#EF4444";
                  return (
                    <div key={i} className="flex-1 rounded-sm" style={{ height: 8, background: filled ? barColor : "#E2E8F0" }} />
                  );
                })}
              </div>
            </div>

            {/* Expiry */}
            <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "1px solid #EEF2F7" }}>
              <div className="flex items-center justify-between flex-shrink-0 px-4 pt-3 pb-2.5" style={{ borderBottom: "1px solid #F1F5F9" }}>
                <div>
                  <p className="text-slate-800" style={{ fontSize: "13px", fontWeight: 800 }}>만료 예정 소화기</p>
                  <p className="text-slate-400" style={{ fontSize: "10px" }}>가까운 순 정렬</p>
                </div>
                <Calendar size={13} style={{ color: "#94A3B8" }} />
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
                {expiryList.map((d) => {
                  const critical = d.daysLeft <= 90;
                  const soon = d.daysLeft <= 180;
                  const bg = critical ? "#FFF1F1" : soon ? "#FFFBEB" : "#F0FDF4";
                  const border = critical ? "#FECACA" : soon ? "#FDE68A" : "#BBF7D0";
                  const color = critical ? "#B91C1C" : soon ? "#92400E" : "#166534";
                  return (
                    <div key={d.id} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: bg, border: `1px solid ${border}` }}>
                      <div className="min-w-0">
                        <p className="text-slate-800 font-bold truncate" style={{ fontSize: "11px" }}>{d.id}</p>
                        <p className="text-slate-400 truncate" style={{ fontSize: "9px" }}>{d.zone_name} · {d.floor_name}</p>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0 ml-2 gap-0.5">
                        <span className="px-1.5 py-0.5 rounded-md font-bold" style={{ fontSize: "10px", background: bg, color, border: `1px solid ${border}` }}>{d.daysLeft}일</span>
                        <span className="text-slate-400" style={{ fontSize: "9px" }}>{d.expiry_date}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Battery */}
            <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "1px solid #EEF2F7" }}>
              <div className="flex items-center justify-between flex-shrink-0 px-4 pt-3 pb-2.5" style={{ borderBottom: "1px solid #F1F5F9" }}>
                <div>
                  <p className="text-slate-800" style={{ fontSize: "13px", fontWeight: 800 }}>배터리 부족 장치</p>
                  <p className="text-slate-400" style={{ fontSize: "10px" }}>잔량 30% 이하</p>
                </div>
                <Battery size={13} style={{ color: "#94A3B8" }} />
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2">
                {lowBattery.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-1.5">
                    <CheckCircle size={20} style={{ color: "#22C55E" }} />
                    <p className="text-slate-400" style={{ fontSize: "11px" }}>배터리 부족 장치 없음</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {lowBattery.map((d) => {
                      const critical = d.battery_level <= 10;
                      const barColor = critical ? "#EF4444" : "#F59E0B";
                      const bg = critical ? "#FFF1F1" : "#FFFBEB";
                      const border = critical ? "#FECACA" : "#FDE68A";
                      return (
                        <div key={d.id} className="rounded-xl px-3 py-2" style={{ background: bg, border: `1px solid ${border}` }}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-slate-800 font-bold" style={{ fontSize: "11px" }}>{d.id}</span>
                            <span style={{ fontSize: "11px", fontWeight: 800, color: barColor }}>{d.battery_level}%</span>
                          </div>
                          <div className="rounded-full overflow-hidden" style={{ height: 4, background: "#E2E8F0" }}>
                            <div className="h-full rounded-full" style={{ width: `${d.battery_level}%`, background: barColor }} />
                          </div>
                          <p className="text-slate-400 mt-1" style={{ fontSize: "9px" }}>{d.zone_name} · {d.admin_name ?? "−"}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ⑤ Zone heatmap — row 2 col 1 */}
          <Card style={{ gridArea: "2 / 1 / 3 / 2" }}>
            <CardHeader title="구역별 위험도" subtitle="Zone Risk Heatmap" icon={MapPin} />
            <div className="flex-1 overflow-y-auto">
              <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))" }}>
                {zoneStats.map((z) => {
                  const riskRatio = z.total > 0 ? z.issues / z.total : 0;
                  const [bg, border, textColor, riskLabel] =
                    riskRatio === 0       ? ["#F0FDF4", "#BBF7D0", "#166534", "안전"] :
                    riskRatio < 0.5       ? ["#FFFBEB", "#FDE68A", "#92400E", "주의"] :
                                            ["#FFF1F1", "#FECACA", "#B91C1C", "위험"];
                  return (
                    <div key={z.zone_id} className="rounded-xl p-2 flex flex-col gap-0.5" style={{ background: bg, border: `1px solid ${border}` }}>
                      <p className="font-bold truncate" style={{ fontSize: "10px", color: textColor }}>{z.zone_name}</p>
                      <p className="truncate" style={{ fontSize: "9px", color: textColor, opacity: 0.7 }}>{z.floor_name}</p>
                      <p className="font-bold" style={{ fontSize: "9px", color: textColor }}>
                        {riskLabel}{z.issues > 0 ? ` (${z.issues}건)` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* ⑥ Maintenance — row 2, cols 2–3 */}
          <Card style={{ gridArea: "2 / 2 / 3 / 4" }}>
            <CardHeader title="최근 유지보수 이력" subtitle="Recent Maintenance Logs" icon={Wrench} />
            <div className="grid flex-shrink-0 mb-1" style={{ gridTemplateColumns: "64px 76px 1fr 100px", fontSize: "10px", color: "#94A3B8", fontWeight: 600 }}>
              <span>장치 ID</span>
              <span>담당자</span>
              <span>조치 내용</span>
              <span className="text-right">일시</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {maintenanceLogs.map((log, i) => (
                <div
                  key={log.maintenance_id}
                  className="grid items-center py-2"
                  style={{ gridTemplateColumns: "64px 76px 1fr 100px", borderTop: i === 0 ? "none" : "1px solid #F8FAFC" }}
                >
                  <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700" style={{ fontSize: "10px", fontWeight: 700, justifySelf: "start" }}>{log.deviceId}</span>
                  <span className="text-slate-600" style={{ fontSize: "11px" }}>{log.admin_name}</span>
                  <span className="text-slate-500" style={{ fontSize: "11px" }}>{log.action_taken}</span>
                  <span className="text-slate-400 text-right" style={{ fontSize: "10px" }}>{parseServerDate(log.created_at).toLocaleDateString("ko-KR")}</span>
                </div>
              ))}
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}

/* ── shared styles ── */

const tooltipStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #E2E8F0",
  borderRadius: "12px",
  fontSize: "12px",
  padding: "8px 12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="bg-white rounded-2xl p-4 flex flex-col overflow-hidden"
      style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "1px solid #EEF2F7", ...style }}
    >
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle, icon: Icon }: { title: string; subtitle: string; icon?: ElementType }) {
  return (
    <div className="flex items-center justify-between flex-shrink-0 mb-3 pb-2.5" style={{ borderBottom: "1px solid #F1F5F9" }}>
      <div>
        <h2 className="text-slate-800" style={{ fontSize: "13px", fontWeight: 800 }}>{title}</h2>
        <p className="text-slate-400" style={{ fontSize: "10px" }}>{subtitle}</p>
      </div>
      {Icon && <Icon size={13} style={{ color: "#94A3B8" }} />}
    </div>
  );
}

function KpiCard({ icon: Icon, iconBg, iconColor, value, label, sublabel, alert = false, onAction, actionLabel }: {
  icon: ElementType; iconBg: string; iconColor: string; value: string; label: string; sublabel: string; alert?: boolean; onAction?: () => void; actionLabel?: string;
}) {
  const hasIssue = alert && value !== "0";
  return (
    <div className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3" style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: hasIssue ? "1px solid #FECACA" : "1px solid #EEF2F7" }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
        <Icon size={16} style={{ color: iconColor }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-slate-900" style={{ fontSize: "22px", fontWeight: 800, lineHeight: 1 }}>{value}</p>
        <p className="text-slate-700 truncate" style={{ fontSize: "11px", fontWeight: 700 }}>{label}</p>
        <p className="text-slate-400 truncate" style={{ fontSize: "9px" }}>{sublabel}</p>
      </div>
      {onAction && (
        <button
          onClick={onAction}
          className="flex-shrink-0 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
          style={{ fontSize: "9px", fontWeight: 700, color: "#3B82F6", border: "1px solid #DBEAFE" }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
