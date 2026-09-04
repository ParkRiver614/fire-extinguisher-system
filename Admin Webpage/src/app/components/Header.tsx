/**
 * 상단 헤더 — 현재 화면 이름, 통합 검색, 알림 벨.
 * 검색창은 입력할 때마다 소화기 ID / 알림 ID 후보를 최대 5개 추천하고,
 * 방향키·엔터로 고를 수 있다. 실제 이동 처리는 상위(App.handleSearch)가 한다.
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { ArrowLeft, Bell, Search, X } from "lucide-react";
import { Alert } from "./Alerts";
import { SidebarPage } from "./Sidebar";
import { Device } from "../types";

interface HeaderProps {
  activePage: SidebarPage;
  showBack?: boolean;
  onBack?: () => void;
  onNavigate?: (page: SidebarPage) => void;
  onSearch?: (query: string) => void;
  alerts?: Alert[];
  devices?: Device[];
  deviceId?: string;
}

type SuggestionItem =
  | { kind: "device"; id: string; zone: string; status: Device["status"] }
  | { kind: "alert"; id: string; alertType: Alert["type"]; zone: string };

// 화면별 제목/부제 — 사이드바 선택에 따라 헤더 문구가 바뀐다.
const PAGE_META: Record<SidebarPage, { label: string; sub: string }> = {
  dashboard: { label: "실시간 모니터링", sub: "Live Dashboard" },
  devices: { label: "장치 관리", sub: "Device Management" },
  managers: { label: "담당자 관리", sub: "Manager Management" },
  alerts: { label: "알림", sub: "Alerts & Notifications" },
  reports: { label: "보고서", sub: "Reports & Analytics" },
  settings: { label: "설정", sub: "System Settings" },
};

const DEVICE_STATUS_COLOR: Record<string, string> = {
  normal: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  fire: "#DC2626",
  offline: "#94A3B8",
};

const ALERT_TYPE_COLOR: Record<string, string> = {
  Fire: "#EF4444",
  Missing: "#64748B",
  Obstacle: "#F59E0B",
};

const ALERT_TYPE_LABEL: Record<string, string> = {
  Fire: "화재",
  Missing: "미감지",
  Obstacle: "장애물",
};

// 추천 목록에서 검색어와 일치하는 부분만 강조 표시
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (!query || idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: "#2563EB", fontWeight: 800 }}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

export function Header({ activePage, showBack, onBack, onNavigate, onSearch, alerts = [], devices = [], deviceId }: HeaderProps) {
  const [query, setQuery] = useState("");
  const [bellOpen, setBellOpen] = useState(false);
  const [searchHint, setSearchHint] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const meta = PAGE_META[activePage];

  const activeAlerts = alerts.filter((alert) => alert.status === "active");
  const visibleAlerts = activeAlerts.slice(0, 5);

  // 검색 추천 목록. "AL-"로 시작하면 알림을 먼저, 아니면 소화기를 먼저 보여 준다(합쳐서 최대 5개).
  const suggestions = useMemo((): SuggestionItem[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const isAlertQuery = /^AL-/i.test(q);

    const matchedDevices: SuggestionItem[] = devices
      .filter((d) => d.id.toLowerCase().includes(q))
      .slice(0, 5)
      .map((d) => ({ kind: "device", id: d.id, zone: d.zone, status: d.status }));

    const matchedAlerts: SuggestionItem[] = alerts
      .filter((a) => a.id.toLowerCase().includes(q))
      .slice(0, 5)
      .map((a) => ({ kind: "alert", id: a.id, alertType: a.type, zone: a.zone }));

    const combined = isAlertQuery
      ? [...matchedAlerts, ...matchedDevices]
      : [...matchedDevices, ...matchedAlerts];

    return combined.slice(0, 5);
  }, [query, devices, alerts]);

  useEffect(() => {
    setActiveIndex(-1);
    setDropdownOpen(suggestions.length > 0);
  }, [suggestions]);

  // 검색창 바깥을 클릭하면 추천 목록을 닫는다.
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  // 검색 실행 — 어디로 이동하는지 안내 문구를 잠깐 띄우고 상위로 검색어를 넘긴다.
  const executeSearch = (value: string) => {
    if (!value.trim()) return;

    if (/^AL-/i.test(value)) {
      setSearchHint("알림 탭으로 이동합니다.");
    } else {
      const found = devices.find((d) => d.id.toLowerCase() === value.toLowerCase());
      setSearchHint(found ? `'${found.id}' 상세 페이지로 이동합니다.` : "장치 목록에서 검색합니다.");
    }

    onSearch?.(value);
    setQuery("");
    setDropdownOpen(false);
    setActiveIndex(-1);
    setTimeout(() => setSearchHint(""), 2500);
  };

  const runSearch = () => executeSearch(query.trim());
  const selectSuggestion = (id: string) => executeSearch(id);

  // 키보드 조작: ↑/↓로 추천 이동, Enter로 선택(선택된 항목이 없으면 입력값 그대로 검색).
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen || suggestions.length === 0) {
      if (e.key === "Enter") runSearch();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        selectSuggestion(suggestions[activeIndex].id);
      } else {
        runSearch();
      }
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
      setActiveIndex(-1);
    }
  };

  const getAlertDot = (type: Alert["type"]) => {
    if (type === "Fire") return "#EF4444";
    if (type === "Missing") return "#64748B";
    return "#F59E0B";
  };

  const goToAlerts = () => {
    setBellOpen(false);
    onNavigate?.("alerts");
  };

  return (
    <header
      className="h-14 bg-white flex items-center px-5 gap-4 flex-shrink-0"
      style={{ borderBottom: "1px solid #F1F5F9", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
    >
      {showBack ? (
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600"
            style={{ fontSize: "12px", fontWeight: 600 }}
          >
            <ArrowLeft size={14} />
            돌아가기
          </button>
          {deviceId && (
            <div className="flex items-center gap-2">
              <span className="text-slate-300" style={{ fontSize: "12px" }}>/</span>
              <span className="px-2 py-1 rounded-lg text-blue-700" style={{ fontSize: "12px", fontWeight: 600, background: "#EFF6FF" }}>
                {deviceId}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-1.5 h-4 rounded-full bg-blue-500" />
          <div>
            <p className="text-slate-700" style={{ fontSize: "13px", fontWeight: 700, lineHeight: "1.1" }}>{meta.label}</p>
            <p className="text-slate-400" style={{ fontSize: "9px", lineHeight: "1" }}>{meta.sub}</p>
          </div>
        </div>
      )}

      {/* Search area */}
      <div className="flex-1 max-w-sm mx-auto relative" ref={searchRef}>
        <div
          className="flex items-center gap-2 bg-slate-50 px-3.5 py-2 border border-slate-100 focus-within:border-blue-300 focus-within:bg-white transition-all"
          style={{ borderRadius: dropdownOpen ? "12px 12px 0 0" : "12px" }}
        >
          <Search size={13} style={{ color: "#94A3B8", flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (suggestions.length > 0) setDropdownOpen(true); }}
            placeholder="장치 ID, 알림 ID 검색"
            className="flex-1 bg-transparent outline-none text-slate-700 placeholder-slate-300 min-w-0"
            style={{ fontSize: "12px" }}
            autoComplete="off"
          />
          {query && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setQuery(""); setSearchHint(""); setDropdownOpen(false); }}
              className="text-slate-300 hover:text-slate-500"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {dropdownOpen && suggestions.length > 0 && (
          <div
            className="absolute left-0 right-0 bg-white z-50 overflow-hidden"
            style={{
              top: "100%",
              borderRadius: "0 0 12px 12px",
              border: "1px solid #BFDBFE",
              borderTop: "none",
              boxShadow: "0 8px 24px rgba(37,99,235,0.10)",
            }}
          >
            {suggestions.map((item, idx) => {
              const isActive = idx === activeIndex;
              const dotColor = item.kind === "device"
                ? DEVICE_STATUS_COLOR[item.status] ?? "#94A3B8"
                : ALERT_TYPE_COLOR[item.alertType] ?? "#94A3B8";
              const sub = item.kind === "device"
                ? item.zone
                : ALERT_TYPE_LABEL[item.alertType] ?? item.alertType;
              const badge = item.kind === "device" ? "장치" : "알림";
              const badgeColor = item.kind === "device" ? { bg: "#EFF6FF", color: "#2563EB" } : { bg: "#FEE2E2", color: "#991B1B" };

              return (
                <button
                  key={item.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSuggestion(item.id)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                  style={{
                    background: isActive ? "#F0F7FF" : "white",
                    borderBottom: idx < suggestions.length - 1 ? "1px solid #F8FAFC" : "none",
                  }}
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
                  <div className="flex-1 min-w-0">
                    <span className="text-slate-800" style={{ fontSize: "12px", fontWeight: 700 }}>
                      <HighlightMatch text={item.id} query={query.trim()} />
                    </span>
                    <span className="text-slate-400 ml-2" style={{ fontSize: "11px" }}>{sub}</span>
                  </div>
                  <span
                    className="px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ fontSize: "9px", fontWeight: 700, background: badgeColor.bg, color: badgeColor.color }}
                  >
                    {badge}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {searchHint && !dropdownOpen && (
          <div className="absolute top-full left-0 mt-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 z-50" style={{ fontSize: "10px" }}>
            {searchHint}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="relative">
          <button
            onClick={() => setBellOpen(!bellOpen)}
            className="relative w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-50 transition-colors"
          >
            <Bell size={16} style={{ color: bellOpen ? "#2563EB" : "#64748B" }} />
            {activeAlerts.length > 0 && (
              <span className="absolute top-1 right-1 min-w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center text-white px-1" style={{ fontSize: "8px", fontWeight: 700 }}>
                {activeAlerts.length}
              </span>
            )}
          </button>

          {bellOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} />
              <div
                className="absolute right-0 top-11 z-50 bg-white rounded-2xl border border-slate-100 overflow-hidden"
                style={{ width: "300px", boxShadow: "0 8px 40px rgba(0,0,0,0.12)" }}
              >
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #F8FAFC" }}>
                  <span className="text-slate-700" style={{ fontSize: "13px", fontWeight: 700 }}>알림</span>
                  {activeAlerts.length > 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-red-600" style={{ fontSize: "10px", fontWeight: 600, background: "#FEE2E2" }}>
                      {activeAlerts.length}개 확인 필요
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-slate-500" style={{ fontSize: "10px", fontWeight: 600, background: "#F1F5F9" }}>
                      0개
                    </span>
                  )}
                </div>

                {visibleAlerts.length > 0 ? (
                  visibleAlerts.map((alert) => (
                    <button
                      key={alert.id}
                      onClick={goToAlerts}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left"
                      style={{ borderBottom: "1px solid #F8FAFC" }}
                    >
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getAlertDot(alert.type) }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-700 truncate" style={{ fontSize: "12px", fontWeight: 500 }}>
                          {alert.extinguisherId} · {alert.detail}
                        </p>
                        <p className="text-slate-400" style={{ fontSize: "10px" }}>
                          {alert.timestamp} · {alert.zone}
                        </p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center">
                    <p className="text-slate-500" style={{ fontSize: "12px", fontWeight: 600 }}>
                      확인이 필요한 알람이 없습니다
                    </p>
                  </div>
                )}

                <div className="px-4 py-2.5 bg-slate-50">
                  <button onClick={goToAlerts} className="w-full text-center text-blue-500 hover:text-blue-600" style={{ fontSize: "11px", fontWeight: 600 }}>
                    모든 알림 보기
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

      </div>
    </header>
  );
}
