/**
 * 대시보드 평면도 화면.
 *
 * 층별 도면 이미지 위에 소화기 위치를 점으로 찍어 상태별 색으로 보여 주고,
 * 마우스를 올리면 요약 팝오버, 클릭하면 상세 화면으로 이동한다.
 * 편집 모드에서는 마커를 끌어 위치를 옮길 수 있고, 좌표는 상위(App)가 서버에 저장한다.
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Check, MapPin, Move } from "lucide-react";
import { normalizeDevice } from "../data/devices";
import { Device } from "../types";
import { usePersistentState } from "../hooks/usePersistentState";
import { FloorConfig, DEFAULT_FLOORS } from "./Settings";
import { authHeaders } from "../auth";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

// 도면은 고정 크기 SVG 좌표계에 그리고, 소화기 좌표는 %로 저장한다
// (창 크기나 도면 이미지가 바뀌어도 상대 위치가 유지되도록).
const SVG_W = 720;
const SVG_H = 460;

const toSvg = (pct: number, dim: number) => pct / 100 * dim;
const toPct = (px: number, dim: number) => parseFloat((px / dim * 100).toFixed(2));

// ─── Component ────────────────────────────────────────────────────────────────
interface FloorMapProps {
  devices: Device[];
  onSelectDevice: (device: Device) => void;
  onPositionChange?: (deviceId: string, x: number, y: number) => void;
  newDeviceIds?: string[];
  onLocationSaved?: (deviceIds: string[]) => void;
}

interface PopoverState {
  device: Device;
  x: number;
  y: number;
}

interface DragState {
  deviceId: string;
  x: number;
  y: number;
}

export function FloorMap({ devices: allDevices, onSelectDevice, onPositionChange, newDeviceIds = [], onLocationSaved }: FloorMapProps) {
  const [floor, setFloor] = useState<string>("1F");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [clickedId, setClickedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [floorConfigs, setFloorConfigs] = usePersistentState<FloorConfig[]>("firewatch.settings.floors", DEFAULT_FLOORS);
  const [floorMaps, setFloorMaps] = usePersistentState<Record<string, string>>("firewatch.settings.floorMaps", {});

  useEffect(() => {
    // 이전 방식(base64)으로 저장된 stale 데이터 즉시 제거
    setFloorMaps((prev) => {
      const cleaned: Record<string, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        if (v && !v.startsWith("data:")) cleaned[k] = v;
      });
      return cleaned;
    });

    fetch(`${API_BASE}/api/floors/detail`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: Record<string, unknown>[]) => {
        if (!Array.isArray(data) || data.length === 0) return;
        const imageUrls: Record<string, string> = {};
        data.forEach((f) => {
          if (f.image_key) {
            imageUrls[f.floor_name as string] = `${API_BASE}/static/floor-images/${f.image_key}`;
          }
        });
        setFloorMaps(imageUrls);
        setFloorConfigs(data.map((f) => ({
          floorId: f.floor_id as number,
          key: f.floor_name as string,
          label: (f.floor_label as string) || (f.floor_name as string),
          zones: ((f.zones as Record<string, unknown>[]) ?? []).map((z) => z.zone_name as string).join(", "),
          mapFileName: (f.image_key as string) || "",
        })));
      })
      .catch(() => {});
  }, []);

  const FLOORS = floorConfigs.length > 0 ? floorConfigs : DEFAULT_FLOORS;
  const mapFileData = floorMaps[floor] || "";

  const devices = useMemo(
    () => allDevices.map(normalizeDevice).filter((device) => device.floor_name === floor),
    [allDevices, floor]
  );

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = () => setDropdownOpen(false);
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // SVG 좌표 → 화면 픽셀 좌표. 팝오버를 마커 위에 정확히 띄우기 위해 필요.
  const getDeviceScreenPos = (device: Device): { x: number; y: number } | null => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const cRect = container.getBoundingClientRect();
    return {
      x: ctm.a * toSvg(device.x_coord, SVG_W) + ctm.e - cRect.left,
      y: ctm.d * toSvg(device.y_coord, SVG_H) + ctm.f - cRect.top,
    };
  };

  const handleMarkerEnter = (device: Device, e: React.MouseEvent) => {
    if (editMode) return;
    e.stopPropagation();
    const pos = getDeviceScreenPos(device);
    if (!pos) return;
    setPopover({ device, x: pos.x, y: pos.y });
  };

  const handleMarkerLeave = () => setPopover(null);

  // 마커 클릭 → 250ms 클릭 효과를 보여 준 뒤 상세 화면으로 이동(편집 모드에선 무시).
  const handleMarkerClick = (device: Device, e: React.MouseEvent) => {
    if (editMode) return;
    e.stopPropagation();
    setClickedId(device.id);
    setPopover(null);
    setTimeout(() => {
      onSelectDevice(device);
      setClickedId(null);
    }, 250);
  };

  const handleMarkerMouseDown = (device: Device, e: React.MouseEvent) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    setDragState({ deviceId: device.id, x: toSvg(device.x_coord, SVG_W), y: toSvg(device.y_coord, SVG_H) });
  };

  // 드래그 중 마우스 좌표를 SVG 좌표로 변환해 마커를 따라오게 한다.
  // 가장자리(10~710, 10~450)로 제한해 마커가 도면 밖으로 나가지 않도록 한다.
  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragState || !editMode) return;
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(ctm.inverse());
    const x = Math.round(Math.max(10, Math.min(710, svgPt.x)));
    const y = Math.round(Math.max(10, Math.min(450, svgPt.y)));
    setDragState((prev) => (prev ? { ...prev, x, y } : null));
  };

  // 드래그 종료 시점에만 좌표를 %로 바꿔 상위로 알린다(끄는 동안은 서버에 저장하지 않음).
  const handleSvgMouseUp = () => {
    if (dragState && onPositionChange) {
      onPositionChange(dragState.deviceId, toPct(dragState.x, SVG_W), toPct(dragState.y, SVG_H));
    }
    setDragState(null);
  };

  // 끌고 있는 마커는 드래그 좌표를, 나머지는 저장된 좌표를 쓴다.
  const getMarkerPos = (device: Device) => {
    if (dragState && dragState.deviceId === device.id) {
      return { x: dragState.x, y: dragState.y };
    }
    return { x: toSvg(device.x_coord, SVG_W), y: toSvg(device.y_coord, SVG_H) };
  };

  const currentFloorLabel = FLOORS.find((f) => f.key === floor)?.label ?? "";
  const MARKER_R = 6;

  const MARKER_COLOR = {
    normal:      { fill: "#3B82F6", stroke: "#2563EB", ring: "#93C5FD" },
    warning:     { fill: "#F59E0B", stroke: "#D97706", ring: "#FCD34D" },
    error:       { fill: "#EF4444", stroke: "#DC2626", ring: "#FCA5A5" },
    fire:        { fill: "#DC2626", stroke: "#B91C1C", ring: "#FCA5A5" },
    offline:     { fill: "#94A3B8", stroke: "#64748B", ring: "#CBD5E1" },
    maintenance: { fill: "#9400FF", stroke: "#7300CC", ring: "#CC99FF" },
    obstacle:    { fill: "#FB923C", stroke: "#EA580C", ring: "#FDBA74" },
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden bg-slate-50"
      style={{ backgroundImage: "radial-gradient(circle, #CBD5E1 1px, transparent 1px)", backgroundSize: "28px 28px" }}
      onClick={() => setDropdownOpen(false)}
    >
      {/* Floor Dropdown */}
      <div className="absolute top-4 left-4 z-30" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 transition-colors"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
        >
          <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
          <span className="text-slate-700" style={{ fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap" }}>{currentFloorLabel}</span>
          <ChevronDown size={13} style={{ color: "#64748B", transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }} />
        </button>

        {dropdownOpen && (
          <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl border border-slate-100 overflow-hidden" style={{ minWidth: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", zIndex: 40 }}>
            {FLOORS.map((f) => (
              <button
                key={f.key}
                onClick={() => { setFloor(f.key); setDropdownOpen(false); setPopover(null); }}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                style={{ fontSize: "13px" }}
              >
                <span style={{ fontWeight: f.key === floor ? 700 : 400, color: f.key === floor ? "#2563EB" : "#374151" }}>{f.label}</span>
                {f.key === floor && <Check size={13} style={{ color: "#2563EB" }} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Edit Mode Banner */}
      {editMode && (
        <div className="absolute top-4 left-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-xl" style={{ transform: "translateX(-50%)", background: "#DBEAFE", border: "1px solid #BFDBFE", boxShadow: "0 2px 10px rgba(37,99,235,0.15)" }}>
          <MapPin size={13} style={{ color: "#2563EB" }} />
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#1E40AF", whiteSpace: "nowrap" }}>위치 편집 모드 — 마커를 드래그하여 소화기 위치를 조정하세요</span>
        </div>
      )}

      {/* Floor Plan SVG */}
      <svg
        ref={svgRef}
        viewBox="0 0 720 460"
        className="absolute inset-0 w-full h-full"
        style={{ padding: "0", cursor: dragState ? "grabbing" : "default" }}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleSvgMouseMove}
        onMouseUp={handleSvgMouseUp}
        onMouseLeave={handleSvgMouseUp}
      >
        <defs>
          <filter id="marker-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.2" />
          </filter>
          <filter id="marker-shadow-lg" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.25" />
          </filter>
        </defs>

        {mapFileData ? (
          <image href={mapFileData} x="0" y="0" width="720" height="460" preserveAspectRatio="xMidYMid meet" />
        ) : (
          <>
            <rect x="0" y="0" width="720" height="460" fill="#F8FAFC" />
            <text x="360" y="220" textAnchor="middle" style={{ fontSize: "13px", fill: "#64748B", fontFamily: "sans-serif", fontWeight: 600 }}>
              도면이 등록되지 않았습니다
            </text>
            <text x="360" y="242" textAnchor="middle" style={{ fontSize: "10px", fill: "#94A3B8", fontFamily: "sans-serif" }}>
              설정 → 층·구역 관리에서 도면을 업로드하세요
            </text>
          </>
        )}

        {/* Extinguisher Markers */}
        {devices.map((device) => {
          const mc = MARKER_COLOR[device.status];
          const isClicked = clickedId === device.id;
          const isDragging = dragState?.deviceId === device.id;
          const isNew = newDeviceIds.includes(device.id);
          const pos = getMarkerPos(device);
          return (
            <g
              key={device.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              style={{ cursor: editMode ? (isDragging ? "grabbing" : "grab") : "pointer" }}
              onMouseEnter={(e) => handleMarkerEnter(device, e)}
              onMouseLeave={handleMarkerLeave}
              onClick={(e) => handleMarkerClick(device, e)}
              onMouseDown={(e) => handleMarkerMouseDown(device, e)}
            >
              {editMode && (
                <circle r={MARKER_R + 5} fill="none" stroke={isDragging ? "#F59E0B" : "#2563EB"} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.7" />
              )}
              {/* 새 장치 깜박임 효과 */}
              {isNew && !editMode && (
                <>
                  <circle r={MARKER_R + 11} fill="#22C55E" fillOpacity="0">
                    <animate attributeName="fill-opacity" values="0;0.18;0" dur="0.85s" repeatCount="indefinite" />
                    <animate attributeName="r" values={`${MARKER_R + 7};${MARKER_R + 13};${MARKER_R + 7}`} dur="0.85s" repeatCount="indefinite" />
                  </circle>
                  <circle r={MARKER_R + 5} fill="none" stroke="#22C55E" strokeWidth="2.5">
                    <animate attributeName="opacity" values="1;0;1" dur="0.85s" repeatCount="indefinite" />
                  </circle>
                </>
              )}
              {!isNew && !editMode && device.status !== "normal" && (
                <circle r={MARKER_R + 5} fill={mc.ring} fillOpacity="0">
                  <animate attributeName="r" values={`${MARKER_R};${MARKER_R + 9};${MARKER_R}`} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="fill-opacity" values="0.25;0;0.25" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              {isClicked && (
                <circle r={MARKER_R + 8} fill={mc.fill} fillOpacity="0.2">
                  <animate attributeName="r" values={`${MARKER_R};${MARKER_R + 18}`} dur="0.25s" fill="freeze" />
                  <animate attributeName="fill-opacity" values="0.25;0" dur="0.25s" fill="freeze" />
                </circle>
              )}
              <circle r={MARKER_R} fill="rgba(0,0,0,0.12)" transform="translate(0,1.5)" />
              <circle
                r={MARKER_R}
                fill={isDragging ? "#F59E0B" : mc.fill}
                stroke={isNew && !editMode ? "#22C55E" : "white"}
                strokeWidth="2"
                filter="url(#marker-shadow)"
                style={{ transition: isDragging ? "none" : "r 0.15s" }}
              >
                {isNew && !editMode && (
                  <animate attributeName="fill-opacity" values="1;0.45;1" dur="0.85s" repeatCount="indefinite" />
                )}
              </circle>
              <circle r="2.5" fill="white" fillOpacity="0.75" />
              {/* 새 장치 라벨 */}
              {isNew && !editMode && (
                <text
                  y={-MARKER_R - 5}
                  textAnchor="middle"
                  style={{ fontSize: "6px", fill: "#16A34A", fontWeight: 800, fontFamily: "sans-serif", letterSpacing: "0.04em" }}
                >
                  NEW
                  <animate attributeName="opacity" values="1;0;1" dur="0.85s" repeatCount="indefinite" />
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Hover Popover */}
      {popover && (() => {
        const d = popover.device;
        const containerH = containerRef.current?.clientHeight ?? 600;
        const containerW = containerRef.current?.clientWidth ?? 800;
        const popW = 200;
        const popH = 170;
        const gap = MARKER_R * (containerH / 460) + 8;

        let left = popover.x - popW / 2;
        let top = popover.y - popH - gap;
        const arrowDown = top > 8;
        if (top < 8) top = popover.y + gap + MARKER_R * 2;
        left = Math.max(8, Math.min(left, containerW - popW - 8));

        const statusBg    = d.status === "normal" ? "#DCFCE7" : d.status === "warning" ? "#FEF3C7" : d.status === "offline" ? "#F1F5F9" : d.status === "maintenance" ? "#EDE9FE" : "#FEE2E2";
        const statusColor = d.status === "normal" ? "#15803D" : d.status === "warning" ? "#92400E" : d.status === "offline" ? "#475569" : d.status === "maintenance" ? "#5B21B6" : d.status === "fire" ? "#B91C1C" : "#991B1B";
        const tempReading = d.sensor_readings.find((r) => r.sensor_type_name === "온도");
        const humReading  = d.sensor_readings.find((r) => r.sensor_type_name === "습도");

        return (
          <div className="absolute z-50 pointer-events-none" style={{ left, top, width: popW }}>
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden" style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.14)" }}>
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-50">
                <span className="text-slate-800" style={{ fontSize: "13px", fontWeight: 700 }}>{d.id}</span>
                <span className="px-2 py-0.5 rounded-full" style={{ fontSize: "10px", fontWeight: 700, background: statusBg, color: statusColor }}>
                  {d.status_name}
                </span>
              </div>
              <div className="px-3 py-2.5 space-y-1.5">
                <Row k="온도" v={tempReading ? `${tempReading.value}${tempReading.unit}` : "—"} />
                <Row k="습도" v={humReading  ? `${humReading.value}${humReading.unit}`   : "—"} />
                <Row k="배터리" v={`${d.battery_level}%`} />
                <Row k="구역" v={d.zone_name} />
                {d.admin_name && (
                  <div className="border-t border-slate-50 pt-1.5 space-y-1.5">
                    <Row k="담당자" v={d.admin_name} />
                    <Row k="연락처" v={d.admin_phone ?? "—"} />
                  </div>
                )}
              </div>
              <div className="px-3 pb-2">
                <p className="text-center text-slate-300" style={{ fontSize: "9px" }}>클릭하여 상세 보기</p>
              </div>
            </div>
            {arrowDown && (
              <div
                className="mx-auto"
                style={{ width: 0, height: 0, borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderTop: "7px solid white", filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.06))", marginLeft: popW / 2 - 7 }}
              />
            )}
          </div>
        );
      })()}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-4 bg-white rounded-xl border border-slate-100 px-3 py-2" style={{ boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
        <LegendItem color="#3B82F6" label="정상" />
        <LegendItem color="#F59E0B" label="경고" />
        <LegendItem color="#EF4444" label="이탈" />
        {newDeviceIds.some((id) => devices.find((d) => d.id === id)) && (
          <>
            <div className="w-px h-3.5 bg-slate-100" />
            <LegendItem color="#22C55E" label="새 장치" blink />
          </>
        )}
        <div className="w-px h-3.5 bg-slate-100" />
        <span className="text-slate-400" style={{ fontSize: "10px" }}>{devices.length}개 장치</span>
      </div>

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-30">
        <div className="bg-white rounded-xl border border-slate-100 px-3 py-2" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <p className="text-slate-400" style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.05em" }}>현재 층</p>
          <p className="text-slate-700" style={{ fontSize: "18px", fontWeight: 800, lineHeight: "1" }}>{floor}</p>
        </div>

        <button
          onClick={() => {
            if (editMode && onLocationSaved) {
              const currentFloorNewIds = devices.filter((d) => newDeviceIds.includes(d.id)).map((d) => d.id);
              if (currentFloorNewIds.length > 0) onLocationSaved(currentFloorNewIds);
            }
            setEditMode((m) => !m);
            setDragState(null);
            setPopover(null);
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all"
          style={editMode
            ? { background: "#2563EB", border: "1px solid #1D4ED8", boxShadow: "0 2px 10px rgba(37,99,235,0.35)" }
            : { background: "white", border: "1px solid #E2E8F0", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
        >
          {editMode ? (
            <><Check size={13} style={{ color: "white" }} /><span style={{ fontSize: "11px", fontWeight: 700, color: "white" }}>저장 완료</span></>
          ) : (
            <><Move size={13} style={{ color: "#475569" }} /><span style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>위치 조정</span></>
          )}
        </button>
      </div>
    </div>
  );
}

function Row({ k, v, vc }: { k: string; v: string; vc?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400" style={{ fontSize: "10px" }}>{k}</span>
      <span style={{ fontSize: "10px", fontWeight: 600, color: vc ?? "#374151" }}>{v}</span>
    </div>
  );
}

function LegendItem({ color, label, blink }: { color: string; label: string; blink?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-2.5 h-2.5 rounded-full"
        style={{
          backgroundColor: color,
          animation: blink ? "legendBlink 0.85s ease-in-out infinite" : undefined,
        }}
      />
      <span className="text-slate-500" style={{ fontSize: "10px", fontWeight: 500 }}>{label}</span>
      <style>{`@keyframes legendBlink { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
    </div>
  );
}
