/**
 * 소화기 상세 화면.
 *
 * 최신 스냅샷 사진과 센서값(가스·온습도·무게·신호), 상태, 위치, 유지보수 이력,
 * 이 소화기에서 발생한 알림을 한 화면에 모아 보여 준다.
 * 유지보수 시작/완료와 이력 수정·삭제는 서버에 반영한 뒤 상위(App)의 목록 상태도 함께 갱신한다.
 */
import { useState } from "react";
import { authHeaders } from "../auth";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
import {
  AlertTriangle,
  Battery,
  Camera,
  CheckCircle,
  ChevronDown,
  Clock,
  Droplets,
  Flame,
  MapPin,
  Pencil,
  RefreshCw,
  Thermometer,
  Trash2,
  Wifi,
  Wrench,
  X,
} from "lucide-react";
import { ExtinguisherView } from "../types";
import { downloadTextFile } from "../utils/download";
import { parseServerDate } from "../utils/date";
import type { Alert } from "./Alerts";

interface DeviceDetailProps {
  device: ExtinguisherView;
  onUpdateDevice?: (device: ExtinguisherView) => void;
  alerts?: Alert[];
}

export function DeviceDetail({ device, onUpdateDevice, alerts = [] }: DeviceDetailProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [maintenanceScheduled, setMaintenanceScheduled] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeNote, setCompleteNote] = useState("");
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [alertsExpanded, setAlertsExpanded] = useState(false);

  const LOG_PREVIEW = 2;
  const ALERT_PREVIEW = 2;

  const isMaintenance = device.status === "maintenance";

  const statusKo = device.status_name;
  const statusColor =
    device.status === "normal"      ? "#22C55E" :
    device.status === "warning"     ? "#F59E0B" :
    device.status === "obstacle"    ? "#FB923C" :
    device.status === "maintenance" ? "#7C3AED" :
    device.status === "fire"        ? "#DC2626" : "#EF4444";
  const statusBg =
    device.status === "normal"      ? "#DCFCE7" :
    device.status === "warning"     ? "#FEF3C7" :
    device.status === "obstacle"    ? "#FFEDD5" :
    device.status === "maintenance" ? "#EDE9FE" : "#FEE2E2";
  const statusTextColor =
    device.status === "normal"      ? "#15803D" :
    device.status === "warning"     ? "#92400E" :
    device.status === "obstacle"    ? "#C2410C" :
    device.status === "maintenance" ? "#5B21B6" :
    device.status === "fire"        ? "#B91C1C" : "#991B1B";

  const deviceAlerts = alerts
    .filter((a) => a.extinguisherId === device.id)
    .sort((a, b) => b.timestampFull.localeCompare(a.timestampFull));

  const tempReading    = device.sensor_readings.find((r) => r.sensor_type_name === "온도");
  const humReading     = device.sensor_readings.find((r) => r.sensor_type_name === "습도");
  const signalReading  = device.sensor_readings.find((r) => r.sensor_type_name === "신호강도");
  const lastMaintenance = device.maintenance_logs[device.maintenance_logs.length - 1];

  // 이 소화기만 다시 조회해 최신 상태로 갱신. 실패해도 기존 화면은 그대로 둔다.
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/api/devices/${device.extinguisher_id}`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const fresh: ExtinguisherView = await res.json();
        onUpdateDevice?.(fresh);
      }
    } catch {
      // 네트워크 오류 시 기존 화면 유지
    } finally {
      setLastUpdated(new Date());
      setRefreshing(false);
    }
  };

  // 유지보수 버튼: 진행 중이면 완료 모달을 열고, 아니면 상태를 "유지보수"로 바꾼다.
  const handleMaintenance = async () => {
    if (isMaintenance) {
      setCompleteNote("");
      setShowCompleteModal(true);
    } else {
      try {
        await fetch(`${API_BASE}/api/devices/${device.extinguisher_id}`, {
          method: "PUT",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ status: "maintenance" }),
        });
      } catch {}
      if (onUpdateDevice) {
        onUpdateDevice({ ...device, status: "maintenance", status_name: "유지보수" });
      } else {
        setMaintenanceScheduled(true);
        setTimeout(() => setMaintenanceScheduled(false), 3000);
      }
    }
  };

  // 유지보수 완료 — 이력 기록과 상태 복구(normal)를 함께 요청하고, 화면에도 새 이력을 붙인다.
  // 서버가 돌려준 이력이 있으면 그것으로 교체(진짜 ID·시각을 쓰기 위해).
  const handleCompleteConfirm = async () => {
    if (!onUpdateDevice) return;
    const actionTaken = completeNote.trim() || "유지보수 완료";
    let newLog = {
      maintenance_id: Date.now(),
      extinguisher_id: device.extinguisher_id,
      admin_id: device.admin_id ?? 0,
      admin_name: device.admin_name ?? "담당자 미지정",
      action_taken: actionTaken,
      created_at: new Date().toISOString(),
    };
    try {
      const [logRes] = await Promise.all([
        fetch(`${API_BASE}/api/devices/${device.extinguisher_id}/maintenance`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ action_taken: actionTaken }),
        }),
        fetch(`${API_BASE}/api/devices/${device.extinguisher_id}`, {
          method: "PUT",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ status: "normal" }),
        }),
      ]);
      if (logRes.ok) newLog = await logRes.json();
    } catch {}
    onUpdateDevice({
      ...device,
      status: "normal",
      status_name: "정상",
      maintenance_logs: [...device.maintenance_logs, newLog],
    });
    setShowCompleteModal(false);
    setCompleteNote("");
  };

  const handleEditLog = (logId: number, currentText: string) => {
    setEditingLogId(logId);
    setEditingText(currentText);
  };

  // 유지보수 이력 수정 저장(내용을 비우면 기존 내용 유지)
  const handleEditSave = async (logId: number) => {
    if (!onUpdateDevice) return;
    const current = device.maintenance_logs.find((l) => l.maintenance_id === logId);
    const newText = editingText.trim() || current?.action_taken || "";
    try {
      await fetch(`${API_BASE}/api/devices/${device.extinguisher_id}/maintenance/${logId}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action_taken: newText }),
      });
    } catch {}
    onUpdateDevice({
      ...device,
      maintenance_logs: device.maintenance_logs.map((log) =>
        log.maintenance_id === logId ? { ...log, action_taken: newText } : log
      ),
    });
    setEditingLogId(null);
    setEditingText("");
  };

  const handleDeleteLog = async (logId: number) => {
    if (!onUpdateDevice) return;
    try {
      await fetch(`${API_BASE}/api/devices/${device.extinguisher_id}/maintenance/${logId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    } catch {}
    onUpdateDevice({
      ...device,
      maintenance_logs: device.maintenance_logs.filter((log) => log.maintenance_id !== logId),
    });
  };

  // 이 소화기의 현재 상태를 텍스트 보고서로 내려받는다.
  const handleDownloadReport = () => {
    downloadTextFile(
      `${device.id}-report.txt`,
      [
        "FireWatch Pro Device Report",
        `Device ID  : ${device.id}`,
        `Floor      : ${device.floor_name}`,
        `Zone       : ${device.zone_name}`,
        `Status     : ${device.status_name}`,
        `Model      : ${device.model_name} (${device.agent_type})`,
        `Total Wt.  : ${device.total_weight} kg`,
        `Battery    : ${device.battery_level}%`,
        `IP Address : ${device.ip_address}`,
        `MAC Address: ${device.mac_address}`,
        `Manufacture: ${device.manufacture_date ?? "—"}`,
        `Install    : ${device.install_date}`,
        `Expiry     : ${device.expiry_date}`,
        `Last Ping  : ${device.last_ping_at}`,
        `Admin      : ${device.admin_name ?? "—"}`,
        `Contact    : ${device.admin_phone ?? "—"}`,
        `Generated  : ${new Date().toLocaleString("ko-KR")}`,
      ].join("\n")
    );
  };

  return (
    <div className="flex flex-1 h-full overflow-hidden bg-slate-50 relative">
      {/* 유지보수 완료 모달 */}
      {showCompleteModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(15,23,42,0.45)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] p-6" style={{ border: "1px solid #E2E8F0" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#DCFCE7" }}>
                  <Wrench size={15} style={{ color: "#16A34A" }} />
                </div>
                <div>
                  <p className="text-slate-800" style={{ fontSize: "14px", fontWeight: 700 }}>유지보수 완료</p>
                  <p className="text-slate-400" style={{ fontSize: "10px" }}>{device.id} · {device.zone_name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowCompleteModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <X size={14} style={{ color: "#94A3B8" }} />
              </button>
            </div>

            <p className="text-slate-500 mb-2" style={{ fontSize: "11px", fontWeight: 600 }}>수행한 작업 내용</p>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3.5 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
              style={{ fontSize: "12px", color: "#334155", minHeight: "100px", background: "#F8FAFC" }}
              placeholder="예: 소화약제 충전, 안전핀 교체, 본체 외관 점검 등"
              value={completeNote}
              onChange={(e) => setCompleteNote(e.target.value)}
              autoFocus
            />
            <p className="text-slate-300 mt-1.5" style={{ fontSize: "10px" }}>
              담당자: {device.admin_name ?? "담당자 미지정"} · {new Date().toLocaleDateString("ko-KR")}
            </p>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowCompleteModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                style={{ fontSize: "12px", fontWeight: 500 }}
              >
                취소
              </button>
              <button
                onClick={handleCompleteConfirm}
                className="flex-1 py-2.5 rounded-xl text-white transition-opacity hover:opacity-90 flex items-center justify-center gap-1.5"
                style={{ background: "linear-gradient(135deg, #16A34A, #22C55E)", fontSize: "12px", fontWeight: 600 }}
              >
                <CheckCircle size={13} />
                완료 처리
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col gap-4 p-5 overflow-y-auto min-w-0">
        {/* Header card */}
        <div
          className="bg-white rounded-2xl border border-slate-100 px-5 py-4 flex items-center justify-between"
          style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #2563EB, #60A5FA)" }}>
              <span className="text-white" style={{ fontSize: "13px", fontWeight: 800 }}>FE</span>
            </div>
            <div>
              <p className="text-slate-800" style={{ fontSize: "18px", fontWeight: 800, lineHeight: "1" }}>{device.id}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <MapPin size={11} style={{ color: "#94A3B8" }} />
                <span className="text-slate-400" style={{ fontSize: "11px" }}>{device.zone_name} · {device.floor_name}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl" style={{ background: statusBg }}>
              {device.status === "normal"
                ? <CheckCircle size={14} style={{ color: statusColor }} />
                : device.status === "maintenance"
                ? <Wrench size={14} style={{ color: statusColor }} />
                : device.status === "fire"
                ? <Flame size={14} style={{ color: statusColor }} />
                : <AlertTriangle size={14} style={{ color: statusColor }} />}
              <span style={{ fontSize: "13px", fontWeight: 700, color: statusTextColor }}>상태: {statusKo}</span>
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-100 flex items-center justify-center border border-slate-100 transition-colors"
              title="새로고침"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} style={{ color: "#64748B" }} />
            </button>
          </div>
        </div>

        {/* Latest snapshot — captured every vision interval configured in 설정, not a live stream */}
        <div
          className="rounded-2xl overflow-hidden flex-shrink-0 relative flex items-center justify-center"
          style={{
            height: "440px",
            background: "#0F172A",
            boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
          }}
        >
          {device.latest_vision?.snapshot_url ? (
            <img
              src={device.latest_vision.snapshot_url}
              alt={`${device.id} 최근 스냅샷`}
              className="block h-full object-contain"
              style={{ maxWidth: "280px" }}
            />
          ) : (
            <>
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.03]"
                style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.4) 2px, rgba(255,255,255,0.4) 4px)" }}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  <Camera size={28} style={{ color: "rgba(255,255,255,0.5)" }} />
                </div>
                <div className="text-center">
                  <p className="text-white" style={{ fontSize: "14px", fontWeight: 600, opacity: 0.7 }}>스냅샷 없음</p>
                  <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginTop: "2px" }}>설정한 비전 주기마다 촬영됩니다 · {device.id}</p>
                </div>
              </div>
            </>
          )}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(15,23,42,0.75)" }}>
            <Camera size={11} style={{ color: "white" }} />
            <span className="text-white" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em" }}>
              최근 스냅샷
            </span>
          </div>
          <div className="absolute top-3 right-3 px-2 py-1 rounded bg-black/40">
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>{device.id} · {device.floor_name}</span>
          </div>
          <div className="absolute bottom-0 inset-x-0 h-8 flex items-center px-3 gap-2" style={{ background: "rgba(0,0,0,0.5)" }}>
            <Clock size={11} style={{ color: "rgba(255,255,255,0.5)" }} />
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>
              {device.latest_vision?.created_at
                ? `촬영: ${parseServerDate(device.latest_vision.created_at).toLocaleString("ko-KR")}`
                : lastUpdated.toLocaleString("ko-KR")}
            </span>
          </div>
        </div>

        <div className="bg-blue-50 rounded-xl border border-blue-100 px-4 py-3 flex items-center justify-between">
          <span className="text-blue-700" style={{ fontSize: "11px", fontWeight: 600 }}>마지막 새로고침</span>
          <span className="text-blue-500" style={{ fontSize: "11px", fontFamily: "monospace" }}>{lastUpdated.toLocaleTimeString("ko-KR")}</span>
        </div>

        {/* Maintenance log */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4" style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}>
          <p className="text-slate-600 mb-3" style={{ fontSize: "12px", fontWeight: 700 }}>유지보수 이력</p>
          <div className="space-y-1">
            {device.maintenance_logs.length === 0 ? (
              <p className="text-slate-300" style={{ fontSize: "11px" }}>기록 없음</p>
            ) : (
              (logsExpanded ? device.maintenance_logs : device.maintenance_logs.slice(0, LOG_PREVIEW)).map((log) => (
                <div
                  key={log.maintenance_id}
                  className="group flex items-start gap-2.5 rounded-xl px-2 py-2 -mx-2 hover:bg-slate-50 transition-colors"
                >
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: "#22C55E" }} />
                  <div className="flex-1 min-w-0">
                    {editingLogId === log.maintenance_id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          className="flex-1 rounded-lg border border-blue-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-200"
                          style={{ fontSize: "11px", color: "#334155" }}
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleEditSave(log.maintenance_id);
                            if (e.key === "Escape") setEditingLogId(null);
                          }}
                          autoFocus
                        />
                        <button
                          onClick={() => handleEditSave(log.maintenance_id)}
                          className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-green-100 transition-colors flex-shrink-0"
                        >
                          <CheckCircle size={12} style={{ color: "#16A34A" }} />
                        </button>
                        <button
                          onClick={() => setEditingLogId(null)}
                          className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-slate-100 transition-colors flex-shrink-0"
                        >
                          <X size={12} style={{ color: "#94A3B8" }} />
                        </button>
                      </div>
                    ) : (
                      <p className="text-slate-600 truncate" style={{ fontSize: "11px" }}>{log.action_taken}</p>
                    )}
                    <p className="text-slate-500" style={{ fontSize: "10px" }}>{log.created_at.slice(0, 10)} · {log.admin_name}</p>
                  </div>
                  {editingLogId !== log.maintenance_id && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => handleEditLog(log.maintenance_id, log.action_taken)}
                        className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-blue-50 transition-colors"
                        title="수정"
                      >
                        <Pencil size={11} style={{ color: "#94A3B8" }} />
                      </button>
                      <button
                        onClick={() => handleDeleteLog(log.maintenance_id)}
                        className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-red-50 transition-colors"
                        title="삭제"
                      >
                        <Trash2 size={11} style={{ color: "#94A3B8" }} />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          {device.maintenance_logs.length > LOG_PREVIEW && (
            <button
              onClick={() => setLogsExpanded((v) => !v)}
              className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
              style={{ fontSize: "11px", color: "#94A3B8" }}
            >
              <ChevronDown
                size={13}
                style={{ transition: "transform 0.2s", transform: logsExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
              />
              {logsExpanded
                ? "접기"
                : `${device.maintenance_logs.length - LOG_PREVIEW}개 더 보기`}
            </button>
          )}
        </div>

        {/* Alert history */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4" style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-600" style={{ fontSize: "12px", fontWeight: 700 }}>알림 이력</p>
            {deviceAlerts.length > 0 && (
              <span
                className="px-2 py-0.5 rounded-full"
                style={{
                  fontSize: "10px", fontWeight: 700,
                  background: deviceAlerts.some((a) => a.status === "active") ? "#FEE2E2" : "#F1F5F9",
                  color: deviceAlerts.some((a) => a.status === "active") ? "#991B1B" : "#64748B",
                }}
              >
                {deviceAlerts.filter((a) => a.status === "active").length > 0
                  ? `미해결 ${deviceAlerts.filter((a) => a.status === "active").length}건`
                  : `총 ${deviceAlerts.length}건`}
              </span>
            )}
          </div>
          <div className="space-y-1">
            {deviceAlerts.length === 0 ? (
              <p className="text-slate-300" style={{ fontSize: "11px" }}>알림 없음</p>
            ) : (
              (alertsExpanded ? deviceAlerts : deviceAlerts.slice(0, ALERT_PREVIEW)).map((alert) => {
                const typeColor =
                  alert.type === "Fire"     ? { dot: "#EF4444", bg: "#FEE2E2", text: "#991B1B", label: "화재" } :
                  alert.type === "Missing"  ? { dot: "#94A3B8", bg: "#F1F5F9", text: "#475569", label: "미감지" } :
                                              { dot: "#F59E0B", bg: "#FEF3C7", text: "#92400E", label: "장애물" };
                return (
                  <div key={alert.id} className="flex items-start gap-2.5 rounded-xl px-2 py-2 -mx-2">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: typeColor.dot }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className="px-1.5 py-0.5 rounded"
                          style={{ fontSize: "9px", fontWeight: 700, background: typeColor.bg, color: typeColor.text }}
                        >
                          {typeColor.label}
                        </span>
                        <span className="text-slate-600 truncate" style={{ fontSize: "11px" }}>{alert.detail}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-slate-300" style={{ fontSize: "10px" }}>{alert.timestamp} · {alert.zone}</p>
                        <span
                          className="px-1 py-0.5 rounded"
                          style={{
                            fontSize: "9px", fontWeight: 600,
                            background: alert.status === "active" ? "#FEE2E2" : "#F0FDF4",
                            color: alert.status === "active" ? "#EF4444" : "#16A34A",
                          }}
                        >
                          {alert.status === "active" ? "진행 중" : "해결"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {deviceAlerts.length > ALERT_PREVIEW && (
            <button
              onClick={() => setAlertsExpanded((v) => !v)}
              className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
              style={{ fontSize: "11px", color: "#94A3B8" }}
            >
              <ChevronDown
                size={13}
                style={{ transition: "transform 0.2s", transform: alertsExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
              />
              {alertsExpanded
                ? "접기"
                : `${deviceAlerts.length - ALERT_PREVIEW}개 더 보기`}
            </button>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="w-[300px] flex-shrink-0 bg-white border-l border-slate-100 flex flex-col overflow-y-auto" style={{ boxShadow: "-2px 0 10px rgba(0,0,0,0.03)" }}>
        <div className="px-5 py-4 border-b border-slate-50">
          <p className="text-slate-700" style={{ fontSize: "13px", fontWeight: 700 }}>센서 데이터</p>
          <p className="text-slate-400" style={{ fontSize: "10px" }}>실시간 측정값</p>
        </div>

        <div className="px-4 py-4 space-y-3 flex-1">
          <MetricCard
            icon={Thermometer} iconColor="#EF4444" iconBg="#FEF2F2"
            label="온도" en="Temperature"
            value={tempReading ? `${tempReading.value.toFixed(1)}${tempReading.unit}` : "—"}
            valueColor={device.status === "error" ? "#EF4444" : "#1E293B"}
            bar={(tempReading?.value ?? 0) / 50}
            barColor="#EF4444"
          />
          <MetricCard
            icon={Droplets} iconColor="#3B82F6" iconBg="#EFF6FF"
            label="습도" en="Humidity"
            value={humReading ? `${humReading.value.toFixed(1)}${humReading.unit}` : "—"}
            bar={(humReading?.value ?? 0) / 100}
            barColor="#3B82F6"
          />
          <MetricCard
            icon={Battery} iconColor="#22C55E" iconBg="#F0FDF4"
            label="배터리" en="Battery"
            value={`${device.battery_level}%`}
            bar={device.battery_level / 100}
            barColor={device.battery_level < 20 ? "#EF4444" : "#22C55E"}
          />
          <MetricCard
            icon={Wifi} iconColor="#F59E0B" iconBg="#FFFBEB"
            label="신호 강도" en="Signal"
            value={signalReading ? `${signalReading.value} ${signalReading.unit}` : "—"}
            bar={signalReading ? Math.min(1, Math.max(0, (signalReading.value + 90) / 60)) : 0}
            barColor="#F59E0B"
          />

          <div className="bg-slate-50 rounded-xl p-3.5 space-y-2.5 mt-2">
            <InfoRow label="마지막 점검" value={lastMaintenance?.created_at.slice(0, 10) ?? "—"} />
            <InfoRow label="설치 구역"   value={device.zone_name || device.floor_name ? `${device.zone_name ?? "—"} · ${device.floor_name ?? "—"}` : "—"} />
            <InfoRow label="소화기 모델" value={device.model_name} />
            <InfoRow label="약제 종류"   value={device.agent_type} />
            <InfoRow label="총 중량"     value={`${device.total_weight} kg`} />
            <InfoRow label="제조일자"    value={device.manufacture_date ?? "—"} />
            <InfoRow label="설치일"      value={device.install_date} />
            <InfoRow label="만료일"      value={device.expiry_date} />
            <InfoRow label="IP 주소"     value={device.ip_address} />
            <InfoRow label="MAC 주소"    value={device.mac_address} />
            <InfoRow label="담당자"      value={device.admin_name ?? "—"} />
            <InfoRow label="연락처"      value={device.admin_phone ?? "—"} />
          </div>
        </div>

        <div className="px-4 py-4 border-t border-slate-50 space-y-2 flex-shrink-0">
          <button
            onClick={handleMaintenance}
            className="w-full py-2.5 rounded-xl text-white transition-opacity hover:opacity-90 flex items-center justify-center gap-1.5"
            style={{
              background: isMaintenance
                ? "linear-gradient(135deg, #16A34A, #22C55E)"
                : "linear-gradient(135deg, #2563EB, #3B82F6)",
              fontSize: "12px", fontWeight: 600,
            }}
          >
            <Wrench size={13} />
            {isMaintenance ? "유지보수 완료" : maintenanceScheduled ? "유지보수 시작됨" : "유지보수 시작"}
          </button>
          <button
            onClick={handleDownloadReport}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            style={{ fontSize: "12px", fontWeight: 500 }}
          >
            보고서 다운로드
          </button>
        </div>
      </div>
    </div>
  );
}

// 센서값 카드 하나(아이콘 + 수치 + 임계 범위)
function MetricCard({
  icon: Icon, iconColor, iconBg, label, en, value, valueColor = "#1E293B", bar, barColor,
}: {
  icon: React.ElementType; iconColor: string; iconBg: string;
  label: string; en: string; value: string; valueColor?: string;
  bar: number; barColor: string;
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
            <Icon size={13} style={{ color: iconColor }} />
          </div>
          <div>
            <p className="text-slate-600" style={{ fontSize: "11px", fontWeight: 600, lineHeight: "1" }}>{label}</p>
            <p className="text-slate-300" style={{ fontSize: "9px", lineHeight: "1" }}>{en}</p>
          </div>
        </div>
        <span style={{ fontSize: "16px", fontWeight: 800, color: valueColor }}>{value}</span>
      </div>
      <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(Math.max(bar, 0), 1) * 100}%`, backgroundColor: barColor, transition: "width 0.5s ease" }}
        />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400 flex-shrink-0" style={{ fontSize: "11px" }}>{label}</span>
      <span className="text-slate-600 text-right truncate" style={{ fontSize: "11px", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
