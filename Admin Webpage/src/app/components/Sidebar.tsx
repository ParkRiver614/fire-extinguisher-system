import {
  LayoutDashboard,
  ShieldCheck,
  Bell,
  FileBarChart2,
  Settings,
  ChevronRight,
  LogOut,
  Users,
} from "lucide-react";
import { AuthUser } from "../auth";
import { Device, AdminRole } from "../types";
import { hasMinRole } from "../permissions";

export type SidebarPage = "dashboard" | "devices" | "alerts" | "reports" | "settings" | "managers";

const NAV_ITEMS: { key: SidebarPage; icon: React.ElementType; label: string; en: string; minRole: AdminRole }[] = [
  { key: "dashboard", icon: LayoutDashboard, label: "대시보드", en: "Dashboard", minRole: "viewer" },
  { key: "devices", icon: ShieldCheck, label: "장치 관리", en: "Devices", minRole: "viewer" },
  { key: "managers", icon: Users, label: "담당자 관리", en: "Managers", minRole: "manager" },
  { key: "alerts", icon: Bell, label: "알림", en: "Alerts", minRole: "viewer" },
  { key: "reports", icon: FileBarChart2, label: "보고서", en: "Reports", minRole: "viewer" },
  { key: "settings", icon: Settings, label: "설정", en: "Settings", minRole: "manager" },
];

interface SidebarProps {
  activePage: SidebarPage;
  onNavigate: (page: SidebarPage) => void;
  onLogout?: () => void;
  user: AuthUser;
  alertCount: number;
  devices: Device[];
}

export function Sidebar({ activePage, onNavigate, onLogout, user, alertCount, devices }: SidebarProps) {
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const normalCount = devices.filter((d) => d.status === "normal").length;
  const warningCount = devices.filter((d) => d.status === "warning").length;
  const criticalCount = devices.filter((d) => d.status === "error" || d.status === "offline" || d.status === "fire").length;

  return (
    <aside
      className="w-[220px] flex-shrink-0 flex flex-col h-full bg-white"
      style={{ borderRight: "1px solid #F1F5F9", boxShadow: "2px 0 12px rgba(0,0,0,0.03)" }}
    >
      <div className="flex items-center gap-3 px-5 h-14 flex-shrink-0" style={{ borderBottom: "1px solid #F1F5F9" }}>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
        >
          <ShieldCheck size={16} color="white" />
        </div>
        <div>
          <p className="text-slate-800" style={{ fontSize: "13px", fontWeight: 800, lineHeight: "1.1" }}>
            FireWatch Pro
          </p>
          <p className="text-slate-400" style={{ fontSize: "9px", lineHeight: "1.1" }}>
            Monitoring System
          </p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        <p className="text-slate-400 px-2 mb-2" style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em" }}>
          MENU
        </p>
        {NAV_ITEMS.filter((item) => hasMinRole(user.role, item.minRole)).map(({ key, icon: Icon, label, en }) => {
          const isActive = activePage === key;
          const badge = key === "alerts" ? alertCount : 0;
          return (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-150"
              style={{ background: isActive ? "#EFF6FF" : "transparent" }}
            >
              <Icon size={15} style={{ color: isActive ? "#2563EB" : "#94A3B8", flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: "12px", fontWeight: isActive ? 700 : 500, color: isActive ? "#1E40AF" : "#475569", lineHeight: "1.2" }}>
                  {label}
                </p>
                <p style={{ fontSize: "9px", color: "#94A3B8", lineHeight: "1" }}>{en}</p>
              </div>
              {badge > 0 && !isActive && (
                <span
                  className="bg-red-500 text-white rounded-full flex-shrink-0"
                  style={{ fontSize: "9px", fontWeight: 700, minWidth: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}
                >
                  {badge}
                </span>
              )}
              {isActive && <ChevronRight size={12} style={{ color: "#2563EB", flexShrink: 0 }} />}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-3 flex-shrink-0" style={{ borderTop: "1px solid #F1F5F9" }}>
        <div className="bg-slate-50 rounded-xl p-3 mb-3">
          <p className="text-slate-500 mb-2" style={{ fontSize: "10px", fontWeight: 600 }}>
            장치 현황
          </p>
          <div className="flex items-center justify-between">
            <StatusDot color="#22C55E" count={normalCount} label="정상" />
            <StatusDot color="#F59E0B" count={warningCount} label="경고" />
            <StatusDot color="#EF4444" count={criticalCount} label="이상" />
          </div>
        </div>

        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors text-left"
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white"
            style={{ background: "linear-gradient(135deg, #667eea, #764ba2)", fontSize: "10px", fontWeight: 700 }}
          >
            {initials || "AD"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-700 truncate" style={{ fontSize: "11px", fontWeight: 600 }}>
              {user.name}
            </p>
            <p className="text-slate-400 truncate" style={{ fontSize: "9px" }}>
              {user.role}
            </p>
          </div>
          <LogOut size={13} style={{ color: "#CBD5E1", flexShrink: 0 }} />
        </button>
      </div>
    </aside>
  );
}

function StatusDot({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      <p style={{ fontSize: "14px", fontWeight: 800, color: "#1E293B", lineHeight: "1" }}>{count}</p>
      <p style={{ fontSize: "9px", color: "#94A3B8" }}>{label}</p>
    </div>
  );
}
