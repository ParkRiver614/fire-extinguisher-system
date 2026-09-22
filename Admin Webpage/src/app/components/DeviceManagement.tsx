/**
 * 소화기 관리 화면.
 *
 * 등록된 소화기를 표로 보여 주고(검색·상태 필터·정렬·페이지), 등록/수정/삭제와
 * 선택 항목 일괄 삭제·일괄 유지보수, CSV 내보내기를 처리한다.
 * 권한에 따라 버튼이 갈린다 — 등록·수정·삭제는 manager 이상, 유지보수는 operator 이상.
 */
import { useState, useMemo, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  Search, Download, Trash2, ChevronUp, ChevronDown, ChevronsUpDown,
  Plus, CheckCircle, AlertTriangle, Zap, WifiOff, X, Check,
  ShieldCheck, AlertCircle, Wrench, Pencil, Flame,
} from "lucide-react";
import { getDefaultMapPosition, nextExtinguisherId } from "../data/devices";
import { downloadTextFile, toCsv } from "../utils/download";
import { Device, Admin, DeviceStatus, MaintenanceLog, AdminRole } from "../types";

import { authHeaders } from "../auth";
import { hasMinRole } from "../permissions";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

// ─── Helpers ──────────────────────────────────────────────────────────────────

// 층 키("B1","1F","RF")를 정렬용 숫자로 — 지하는 음수, 옥상은 가장 위.
function parseLevel(key: string): number {
  if (key === "RF") return 99;
  if (key.startsWith("B")) { const n = parseInt(key.slice(1)); return isNaN(n) ? -1 : -n; }
  const n = parseInt(key);
  return isNaN(n) ? 0 : n;
}

type ModelOption = { model_id: number; model_name: string; agent_type: string; total_weight: number; empty_weight: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<DeviceStatus, { label: string; labelEn: string; color: string; bg: string; textColor: string; Icon: React.ElementType }> = {
  normal:      { label: "정상",     labelEn: "Active",      color: "#22C55E", bg: "#DCFCE7", textColor: "#15803D", Icon: CheckCircle  },
  warning:     { label: "경고",     labelEn: "Warning",     color: "#F59E0B", bg: "#FEF3C7", textColor: "#92400E", Icon: AlertTriangle },
  error:       { label: "이탈",     labelEn: "Missing",     color: "#EF4444", bg: "#FEE2E2", textColor: "#991B1B", Icon: Zap          },
  fire:        { label: "화재",     labelEn: "Fire",        color: "#DC2626", bg: "#FEE2E2", textColor: "#991B1B", Icon: Flame        },
  offline:     { label: "오프라인", labelEn: "Offline",     color: "#94A3B8", bg: "#F1F5F9", textColor: "#475569", Icon: WifiOff      },
  maintenance: { label: "유지보수", labelEn: "Maintenance", color: "#7C3AED", bg: "#EDE9FE", textColor: "#5B21B6", Icon: Wrench       },
  obstacle:    { label: "장애물",   labelEn: "Obstacle",    color: "#FB923C", bg: "#FFEDD5", textColor: "#C2410C", Icon: AlertTriangle },
};

const FLOOR_CFG: Record<string, { color: string; bg: string }> = {
  "B1": { color: "#64748B", bg: "#F1F5F9" },
  "1F": { color: "#16A34A", bg: "#DCFCE7" },
  "2F": { color: "#2563EB", bg: "#DBEAFE" },
  "3F": { color: "#7C3AED", bg: "#EDE9FE" },
  "RF": { color: "#EA580C", bg: "#FFEDD5" },
};

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// 소화기 유효기간은 설치일로부터 3년 — 입력이 없으면 이 값으로 채운다.
function expiryFromInstall(install: string): string {
  const d = new Date(install);
  d.setFullYear(d.getFullYear() + 3);
  return d.toISOString().slice(0, 10);
}

const PAGE_SIZE = 10;

// ─── Component ────────────────────────────────────────────────────────────────

interface DeviceManagementProps {
  devices: Device[];
  setDevices: Dispatch<SetStateAction<Device[]>>;
  admins: Admin[];
  setAdmins: Dispatch<SetStateAction<Admin[]>>;
  externalSearch?: string;
  onSelectDevice?: (device: Device) => void;
  onDeviceAdded?: (deviceId: string) => void;
  currentRole?: AdminRole;
}

export function DeviceManagement({ devices, setDevices, admins, setAdmins, externalSearch, onSelectDevice, onDeviceAdded, currentRole = "admin" }: DeviceManagementProps) {
  const canManage = hasMinRole(currentRole, "manager");
  const canAct = hasMinRole(currentRole, "operator");
  const [floorOptions, setFloorOptions] = useState<{ floor_id: number; floor_name: string; level: number }[]>([]);
  const [zoneOptions, setZoneOptions] = useState<{ zone_id: number; zone_name: string; floor_id: number }[]>([]);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);

  // 등록 폼의 선택지(층·구역·소화기 모델)를 서버에서 받아 둔다.
  useEffect(() => {
    fetch(`${API_BASE}/api/floors/detail`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: { floor_id: number; floor_name: string; floor_label: string | null; level: number; zones: { zone_id: number; zone_name: string }[] }[]) => {
        setFloorOptions(data.map((f) => ({
          floor_id: f.floor_id,
          floor_name: f.floor_label ?? f.floor_name,
          level: f.level,
        })));
        setZoneOptions(data.flatMap((f) =>
          f.zones.map((z) => ({ zone_id: z.zone_id, zone_name: z.zone_name, floor_id: f.floor_id }))
        ));
      })
      .catch(() => {});

    fetch(`${API_BASE}/api/devices/models`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: ModelOption[]) => { if (Array.isArray(data)) setModelOptions(data); })
      .catch(() => {});
  }, []);
  // Table state
  const [search, setSearch] = useState("");
  const [searchFilter, setSearchFilter] = useState<"all" | "id" | "zone" | "floor" | "admin" | "model" | "manufacture" | "install">("all");
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | "all">("all");
  const [sortField, setSortField] = useState<keyof Device | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [showBulkCompleteModal, setShowBulkCompleteModal] = useState(false);
  const [bulkCompleteNote, setBulkCompleteNote] = useState("");

  // Form state
  const [form, setForm] = useState({
    device_id: "",
    mac_address: "", ip_address: "",
    floor_id: "", zone_id: "",
    model_id: "", manufacture_date: "", install_date: "", expiry_date: "",
    admin_id: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [formSuccess, setFormSuccess] = useState(false);
  const [formSuccessMessage, setFormSuccessMessage] = useState("장치가 성공적으로 등록되었습니다!");
  const [formGlobalError, setFormGlobalError] = useState("");
  const isEditing = editingDeviceId !== null;

  useEffect(() => {
    if (externalSearch) { setSearch(externalSearch); setPage(0); }
  }, [externalSearch]);

  // ── Table logic ─────────────────────────────────────────────────────────────

  const filteredZones = useMemo(
    () => form.floor_id ? zoneOptions.filter((z) => z.floor_id === parseInt(form.floor_id)) : zoneOptions,
    [form.floor_id, zoneOptions]
  );

  // 담당자는 선택한 층에 배정된 사람만 고를 수 있다. 수정 중인 장치의 기존 담당자는 층이 달라도 남겨 둔다.
  const filteredAdmins = useMemo(
    () => form.floor_id
      ? admins.filter((a) => a.assigned_floor_id === parseInt(form.floor_id) || String(a.admin_id) === form.admin_id)
      : [],
    [form.floor_id, form.admin_id, admins]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return devices.filter((d) => {
      const matchStatus = statusFilter === "all" || d.status === statusFilter;
      let matchSearch = true;
      if (q) {
        if (searchFilter === "all") {
          matchSearch = (d.id ?? "").toLowerCase().includes(q)
            || (d.zone_name ?? "").toLowerCase().includes(q)
            || (d.admin_name ?? "").toLowerCase().includes(q)
            || (d.model_name ?? "").toLowerCase().includes(q)
            || (d.manufacture_date ?? "").includes(q)
            || (d.install_date ?? "").includes(q);
        } else if (searchFilter === "id") {
          matchSearch = (d.id ?? "").toLowerCase().includes(q);
        } else if (searchFilter === "zone") {
          matchSearch = (d.zone_name ?? "").toLowerCase().includes(q);
        } else if (searchFilter === "floor") {
          matchSearch = (d.floor_name ?? "").toLowerCase().includes(q);
        } else if (searchFilter === "admin") {
          matchSearch = (d.admin_name ?? "").toLowerCase().includes(q);
        } else if (searchFilter === "model") {
          matchSearch = (d.model_name ?? "").toLowerCase().includes(q);
        } else if (searchFilter === "manufacture") {
          matchSearch = (d.manufacture_date ?? "").includes(q);
        } else if (searchFilter === "install") {
          matchSearch = (d.install_date ?? "").includes(q);
        }
      }
      return matchStatus && matchSearch;
    });
  }, [devices, search, searchFilter, statusFilter]);

  const sorted = useMemo(() => {
    if (!sortField) return filtered;
    return [...filtered].sort((a, b) => {
      const av = String(a[sortField]);
      const bv = String(b[sortField]);
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortField, sortDir]);

  const pageCount = Math.ceil(sorted.length / PAGE_SIZE);
  const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (field: keyof Device) => {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortField(null); setSortDir("asc"); }
    } else { setSortField(field); setSortDir("asc"); }
    setPage(0);
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const toggleAll = () => {
    if (selected.size === pageItems.length) setSelected(new Set());
    else setSelected(new Set(pageItems.map((d) => d.id)));
  };

  // 삭제는 두 번 눌러야 실행된다 — 첫 클릭은 확인 대기 상태(3초 뒤 자동 취소).
  const handleDelete = async (id: string) => {
    if (pendingDelete !== id) {
      setPendingDelete(id);
      setTimeout(() => setPendingDelete((cur) => (cur === id ? null : cur)), 3000);
      return;
    }
    const device = devices.find((d) => d.id === id);
    setDeleteError(null);
    if (!device?.extinguisher_id) {
      setDevices((prev) => prev.filter((d) => d.id !== id));
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
      setPendingDelete(null);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/devices/${device.extinguisher_id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setDeleteError(errBody?.detail ?? `삭제 실패 (${res.status})`);
        setPendingDelete(null);
        return;
      }
    } catch (err) {
      setDeleteError(`네트워크 오류: ${err instanceof Error ? err.message : String(err)}`);
      setPendingDelete(null);
      return;
    }
    setDevices((prev) => prev.filter((d) => d.id !== id));
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setPendingDelete(null);
  };

  const handleBulkDelete = async () => {
    const selectedDevices = devices.filter((d) => selected.has(d.id));
    setDeleteError(null);
    const deletedIds = new Set<string>();
    const failures: string[] = [];

    // 순차 처리: 여러 소화기를 동시에 삭제하면 백엔드에서 관련 테이블(alert,
    // maintenance_logs 등)에 대한 DB 락 경합이 발생해 일부 요청이 "Failed to
    // fetch"로 끊기는 문제가 있었음. 한 번에 하나씩만 요청해 경합을 없앤다.
    for (const d of selectedDevices) {
      try {
        const res = await fetch(`${API_BASE}/api/devices/${d.extinguisher_id}`, { method: "DELETE", headers: authHeaders() });
        if (!res.ok) throw new Error(`${d.id} (${res.status})`);
        deletedIds.add(d.id);
      } catch (err) {
        failures.push(`${d.id} (${err instanceof Error ? err.message : String(err)})`);
      }
    }

    if (failures.length > 0) {
      setDeleteError(`일부 장치 삭제에 실패했습니다: ${failures.join(", ")}`);
    }
    setDevices((prev) => prev.filter((d) => !deletedIds.has(d.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      deletedIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  // 선택 항목 일괄 유지보수 — 전부 유지보수 중이면 "완료" 모달로, 아니면 유지보수 시작.
  const handleBulkMaintenance = async () => {
    const selectedDevicesList = devices.filter((d) => selected.has(d.id));
    const allMaintenance = selectedDevicesList.every((d) => d.status === "maintenance");

    if (allMaintenance) {
      // 유지보수 완료: 작업 내용을 입력받은 뒤 처리
      setBulkCompleteNote("");
      setShowBulkCompleteModal(true);
      return;
    }

    setDeleteError(null);
    const startedIds = new Set<string>();
    const startFailures: string[] = [];

    // 순차 처리: handleBulkDelete와 동일한 이유로 동시 요청 시 DB 락 경합이 발생함.
    for (const d of selectedDevicesList) {
      try {
        const res = await fetch(`${API_BASE}/api/devices/${d.extinguisher_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ status: "maintenance" }),
        });
        if (!res.ok) throw new Error(`${d.id} (${res.status})`);
        startedIds.add(d.id);
      } catch (err) {
        startFailures.push(`${d.id} (${err instanceof Error ? err.message : String(err)})`);
      }
    }

    if (startFailures.length > 0) {
      setDeleteError(`일부 장치의 유지보수 예약에 실패했습니다: ${startFailures.join(", ")}`);
    }
    setDevices((prev) => prev.map((d) => (
      startedIds.has(d.id) ? { ...d, status: "maintenance" as const, status_name: "유지보수" } : d
    )));
    setSelected(new Set());
  };

  const handleBulkCompleteConfirm = async () => {
    const selectedDevicesList = devices.filter((d) => selected.has(d.id));
    const actionTaken = bulkCompleteNote.trim() || "유지보수 완료";
    const newLogs = new Map<string, MaintenanceLog>();
    const failures: string[] = [];

    // 순차 처리: handleBulkDelete와 동일한 이유로 동시 요청 시 DB 락 경합이 발생함.
    for (const d of selectedDevicesList) {
      try {
        const logRes = await fetch(`${API_BASE}/api/devices/${d.extinguisher_id}/maintenance`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ action_taken: actionTaken }),
        });
        if (!logRes.ok) throw new Error(`${d.id} 이력 등록 실패 (${logRes.status})`);
        newLogs.set(d.id, await logRes.json());

        const putRes = await fetch(`${API_BASE}/api/devices/${d.extinguisher_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ status: "normal" }),
        });
        if (!putRes.ok) throw new Error(`${d.id} 상태 변경 실패 (${putRes.status})`);
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }

    if (failures.length > 0) {
      setDeleteError(`일부 장치의 유지보수 완료 처리에 실패했습니다: ${failures.join(", ")}`);
    }
    setDevices((prev) => prev.map((d) => {
      if (!selected.has(d.id)) return d;
      const log = newLogs.get(d.id);
      return {
        ...d,
        status: log ? ("normal" as const) : d.status,
        status_name: log ? "정상" : d.status_name,
        maintenance_logs: log ? [...d.maintenance_logs, log] : d.maintenance_logs,
      };
    }));
    setSelected(new Set());
    setShowBulkCompleteModal(false);
    setBulkCompleteNote("");
  };

  const handleExport = () => {
    const csv = toCsv(sorted.map((d) => ({
      id: d.id,
      extinguisher_id: d.extinguisher_id,
      mac_address: d.mac_address,
      ip_address: d.ip_address,
      zone_name: d.zone_name,
      floor_name: d.floor_name,
      model_name: d.model_name,
      agent_type: d.agent_type,
      status: d.status,
      status_name: d.status_name,
      battery_level: d.battery_level,
      last_ping_at: d.last_ping_at,
      manufacture_date: d.manufacture_date ?? "",
      install_date: d.install_date,
      expiry_date: d.expiry_date,
      admin_name: d.admin_name ?? "",
      admin_phone: d.admin_phone ?? "",
    })));
    downloadTextFile("firewatch-devices.csv", csv, "text/csv;charset=utf-8");
  };

  // ── Form logic ──────────────────────────────────────────────────────────────

  const emptyForm = {
    device_id: "",
    mac_address: "", ip_address: "",
    floor_id: "", zone_id: "",
    model_id: "", manufacture_date: "", install_date: "", expiry_date: "",
    admin_id: "",
  };

  const resetForm = () => {
    setForm(emptyForm);
    setErrors({});
    setFormGlobalError("");
    setEditingDeviceId(null);
  };

  // 수정 버튼 — 선택한 소화기 값으로 등록 폼을 채우고 수정 모드로 바꾼다.
  const handleEdit = (device: Device) => {
    const floor = floorOptions.find((f) => f.floor_name === device.floor_name) ?? floorOptions.find((f) => f.floor_id === device.floor_id);
    const zone = zoneOptions.find((z) => z.zone_name === device.zone_name && z.floor_id === floor?.floor_id)
      ?? zoneOptions.find((z) => z.zone_id === device.zone_id);

    setEditingDeviceId(device.id);
    setForm({
      device_id: device.id,
      mac_address: device.mac_address,
      ip_address: device.ip_address,
      floor_id: floor ? String(floor.floor_id) : "",
      zone_id: zone ? String(zone.zone_id) : "",
      model_id: String(device.model_id),
      manufacture_date: device.manufacture_date ?? "",
      install_date: device.install_date,
      expiry_date: device.expiry_date,
      admin_id: device.admin_id ? String(device.admin_id) : "",
    });
    setErrors({});
    setFormSuccess(false);
    setFormSuccessMessage("장치가 성공적으로 등록되었습니다!");
    setFormGlobalError("");
  };

  const updateField = (key: keyof typeof form, val: string) => {
    if (key === "floor_id") {
      setForm((f) => ({ ...f, floor_id: val, zone_id: "", admin_id: "" }));
    } else {
      setForm((f) => ({ ...f, [key]: val }));
    }
    setErrors((e) => ({ ...e, [key]: "" }));
    setFormGlobalError("");
  };

  const MAC_ADDRESS_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

  const validate = () => {
    const e: Partial<Record<keyof typeof form, string>> = {};
    if (!form.zone_id)  e.zone_id  = "구역을 선택하세요.";
    if (!form.model_id) e.model_id = "모델을 선택하세요.";
    if (isEditing && !form.device_id.trim()) e.device_id = "수정 중에는 Device ID가 필요합니다.";
    if (form.device_id.trim() && devices.some((d) => d.id === form.device_id.trim() && d.id !== editingDeviceId))
      e.device_id = "이미 사용 중인 ID입니다.";
    if (!form.mac_address.trim()) {
      e.mac_address = "실제 장치의 MAC 주소를 입력하세요.";
    } else if (!MAC_ADDRESS_RE.test(form.mac_address.trim())) {
      e.mac_address = "MAC 주소 형식이 올바르지 않습니다. (예: AA:BB:CC:DD:EE:FF)";
    } else if (devices.some((d) => d.mac_address.toLowerCase() === form.mac_address.trim().toLowerCase() && d.id !== editingDeviceId)) {
      e.mac_address = "이미 등록된 MAC 주소입니다.";
    }
    return e;
  };

  // 등록/수정 저장 — 입력 검증 후 서버에 보내고, 성공하면 목록 상태도 갱신한다.
  // ID를 비워 두면 FE-<번호>로 자동 생성하고, 새 소화기는 상위에 알려 평면도 배치 대기로 표시한다.
  const handleSubmit = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }

    const zone   = zoneOptions.find((z) => z.zone_id === parseInt(form.zone_id));
    const floor  = zone ? floorOptions.find((f) => f.floor_id === zone.floor_id) : undefined;
    const model  = modelOptions.find((m) => m.model_id === parseInt(form.model_id));
    if (!zone || !model) { setFormGlobalError("구역 또는 모델 정보를 불러오지 못했습니다. 잠시 후 다시 시도하세요."); return; }
    const pos    = getDefaultMapPosition(zone.zone_name);
    const today  = todayStr();
    const installDate = form.install_date || today;
    const expiryDate  = form.expiry_date  || expiryFromInstall(installDate);
    const newId  = nextExtinguisherId(devices);

    let finalAdminId: number | undefined;
    let finalAdminName: string | undefined;
    let finalAdminPhone: string | undefined;

    if (form.admin_id) {
      const admin = admins.find((a) => a.admin_id === parseInt(form.admin_id));
      if (admin) { finalAdminId = admin.admin_id; finalAdminName = admin.admin_name; finalAdminPhone = admin.phone_number ?? undefined; }
    }

    const customId = form.device_id.trim();
    const newDeviceId = customId || `FE-${newId}`;

    const apiPayload = {
      id: editingDeviceId ? customId : newDeviceId,
      mac_address: form.mac_address.trim(),
      ip_address: form.ip_address.trim() || null,
      manufacture_date: form.manufacture_date || null,
      install_date: installDate,
      expiry_date: expiryDate,
      model_id: model.model_id,
      zone_id: zone.zone_id,
      floor_id: floor?.floor_id ?? zone.floor_id,
      admin_id: finalAdminId ?? null,
      ...(!editingDeviceId && { x_coord: pos.x_coord, y_coord: pos.y_coord }),
    };

    if (editingDeviceId) {
      const editingDevice = devices.find((d) => d.id === editingDeviceId);
      try {
        await fetch(`${API_BASE}/api/devices/${editingDevice?.extinguisher_id ?? editingDeviceId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(apiPayload),
        });
      } catch { /* 백엔드 없는 환경에서는 로컬 상태만 갱신 */ }

      setDevices((prev) => prev.map((device) => {
        if (device.id !== editingDeviceId) return device;
        return {
          ...device,
          id: customId,
          mac_address: form.mac_address.trim(),
          ip_address: form.ip_address.trim() || device.ip_address,
          manufacture_date: form.manufacture_date || undefined,
          install_date: installDate,
          expiry_date: expiryDate,
          model_id: model.model_id, model_name: model.model_name,
          agent_type: model.agent_type, total_weight: model.total_weight, empty_weight: model.empty_weight,
          zone_id: zone.zone_id, zone_name: zone.zone_name,
          floor_id: floor.floor_id, floor_name: floor.floor_name, level: floor.level,
          admin_id: finalAdminId, admin_name: finalAdminName, admin_phone: finalAdminPhone,
        };
      }));
      setSelected((prev) => {
        if (!prev.has(editingDeviceId)) return prev;
        const next = new Set(prev);
        next.delete(editingDeviceId);
        next.add(customId);
        return next;
      });
    } else {
      try {
        const res = await fetch(`${API_BASE}/api/devices`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(apiPayload),
        });
        if (res.ok) {
          const body = await res.json();
          const created: Device = body.device ?? body.data ?? body;
          setDevices((prev) => [...prev, created]);
          onDeviceAdded?.(created.id);
        } else {
          const errBody = await res.json().catch(() => ({}));
          const msg = errBody?.detail ?? errBody?.message ?? `서버 오류 (${res.status})`;
          setFormGlobalError(typeof msg === "string" ? msg : JSON.stringify(msg));
          return;
        }
      } catch (err) {
        setFormGlobalError(`네트워크 오류: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }

    setForm(emptyForm);
    setErrors({});
    setFormGlobalError("");
    setFormSuccess(true);
    setFormSuccessMessage(editingDeviceId ? "장치 정보가 성공적으로 수정되었습니다!" : "장치가 성공적으로 등록되었습니다!");
    setEditingDeviceId(null);
    setTimeout(() => setFormSuccess(false), 3500);
    if (!editingDeviceId) setPage(0);
  };

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = {
    total:       devices.length,
    normal:      devices.filter((d) => d.status === "normal").length,
    warning:     devices.filter((d) => d.status === "warning").length,
    error:       devices.filter((d) => d.status === "error").length,
    fire:        devices.filter((d) => d.status === "fire").length,
    offline:     devices.filter((d) => d.status === "offline").length,
    maintenance: devices.filter((d) => d.status === "maintenance").length,
  };

  const selectedDevicesList = devices.filter((d) => selected.has(d.id));
  const allSelectedMaintenance = selectedDevicesList.length > 0 && selectedDevicesList.every((d) => d.status === "maintenance");

  return (
    <div className="flex flex-col h-full overflow-hidden relative" style={{ background: "#F4F6F9" }}>

      {showBulkCompleteModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(15,23,42,0.45)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] p-6" style={{ border: "1px solid #E2E8F0" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#DCFCE7" }}>
                  <Wrench size={15} style={{ color: "#16A34A" }} />
                </div>
                <div>
                  <p className="text-slate-800" style={{ fontSize: "14px", fontWeight: 700 }}>유지보수 완료</p>
                  <p className="text-slate-400" style={{ fontSize: "10px" }}>{selectedDevicesList.length}개 장치</p>
                </div>
              </div>
              <button
                onClick={() => setShowBulkCompleteModal(false)}
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
              value={bulkCompleteNote}
              onChange={(e) => setBulkCompleteNote(e.target.value)}
              autoFocus
            />
            <p className="text-slate-300 mt-1.5" style={{ fontSize: "10px" }}>
              선택된 모든 장치에 동일한 작업 내용이 기록됩니다 · {new Date().toLocaleDateString("ko-KR")}
            </p>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowBulkCompleteModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                style={{ fontSize: "12px", fontWeight: 500 }}
              >
                취소
              </button>
              <button
                onClick={handleBulkCompleteConfirm}
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

      {/* Page header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0">
        <div>
          <h1 className="text-slate-800" style={{ fontSize: "17px", fontWeight: 800 }}>장치 관리</h1>
          <p className="text-slate-400" style={{ fontSize: "11px" }}>Device Management · 등록된 소화기 목록</p>
        </div>
        <div className="flex items-center gap-2">
          <StatChip icon={ShieldCheck}   color="#2563EB" bg="#DBEAFE" count={stats.total}                              label="전체" />
          <StatChip icon={CheckCircle}   color="#16A34A" bg="#DCFCE7" count={stats.normal}                            label="정상" />
          <StatChip icon={AlertTriangle} color="#D97706" bg="#FEF3C7" count={stats.warning}                           label="경고" />
          <StatChip icon={Flame}         color="#DC2626" bg="#FEE2E2" count={stats.fire}                              label="화재" />
          <StatChip icon={AlertCircle}   color="#EF4444" bg="#FEE2E2" count={stats.error + stats.offline}             label="이탈/오프라인" />
          <StatChip icon={Wrench}        color="#7C3AED" bg="#EDE9FE" count={stats.maintenance}                       label="유지보수" />
        </div>
      </div>

      {deleteError && (
        <div className="mx-6 mb-4 flex items-center justify-between gap-2 px-4 py-3 rounded-xl flex-shrink-0" style={{ background: "#FEE2E2", border: "1px solid #FECACA" }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} style={{ color: "#DC2626" }} />
            <p style={{ fontSize: "12px", color: "#B91C1C", fontWeight: 600 }}>{deleteError}</p>
          </div>
          <button onClick={() => setDeleteError(null)} className="p-1 rounded-lg hover:bg-red-100">
            <X size={12} style={{ color: "#B91C1C" }} />
          </button>
        </div>
      )}

      {/* Two-column content */}
      <div className="flex flex-1 gap-5 px-6 pb-6 overflow-hidden min-h-0">

        {/* LEFT: Table (65%) */}
        <div
          className="bg-white rounded-2xl flex flex-col overflow-hidden"
          style={{ flex: "4 4 0%", boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "1px solid #EEF2F7" }}
        >
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-5 py-3.5 flex-shrink-0 flex-wrap" style={{ borderBottom: "1px solid #F1F5F9", rowGap: "8px" }}>
            <div className="flex items-center bg-slate-50 rounded-xl border border-slate-100 flex-1 min-w-[180px] max-w-sm focus-within:border-blue-300 focus-within:bg-white transition-all overflow-hidden">
              <select
                value={searchFilter}
                onChange={(e) => { setSearchFilter(e.target.value as "all" | "id" | "zone" | "floor" | "admin" | "model" | "manufacture" | "install"); setPage(0); }}
                className="outline-none bg-transparent cursor-pointer text-slate-500 hover:text-slate-700 transition-colors"
                style={{ fontSize: "11px", fontWeight: 700, padding: "8px 6px 8px 10px", flexShrink: 0, borderRight: "1px solid #E2E8F0" }}
              >
                <option value="all">전체</option>
                <option value="id">ID</option>
                <option value="zone">구역</option>
                <option value="floor">층</option>
                <option value="admin">담당자</option>
                <option value="model">모델명</option>
                <option value="manufacture">제조일자</option>
                <option value="install">설치일자</option>
              </select>
              <div className="flex items-center gap-2 flex-1 px-2.5 py-2 min-w-0">
                <Search size={13} style={{ color: "#94A3B8", flexShrink: 0 }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  placeholder={
                    searchFilter === "id"          ? "Device ID 검색…"       :
                    searchFilter === "zone"        ? "구역 검색…"             :
                    searchFilter === "floor"       ? "층 검색…"               :
                    searchFilter === "admin"       ? "담당자 검색…"            :
                    searchFilter === "model"       ? "모델명 검색…"            :
                    searchFilter === "manufacture" ? "제조일자 검색… (YYYY-MM-DD)" :
                    searchFilter === "install"     ? "설치일자 검색… (YYYY-MM-DD)" :
                    "ID, 구역, 담당자, 모델명, 날짜 검색…"
                  }
                  className="flex-1 bg-transparent outline-none text-slate-700 placeholder-slate-300 min-w-0"
                  style={{ fontSize: "12px" }}
                />
                {search && <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500"><X size={11} /></button>}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {(["all", "normal", "warning", "error", "fire", "obstacle", "offline", "maintenance"] as const).map((f) => {
                const isActive = statusFilter === f;
                const cfg = f === "all" ? null : STATUS_CFG[f];
                return (
                  <button
                    key={f}
                    onClick={() => { setStatusFilter(f); setPage(0); }}
                    className="px-2.5 py-1 rounded-lg transition-all"
                    style={{
                      fontSize: "10px", fontWeight: isActive ? 700 : 500,
                      background: isActive ? (cfg ? cfg.bg : "#EFF6FF") : "#F8FAFC",
                      color: isActive ? (cfg ? cfg.textColor : "#2563EB") : "#64748B",
                      border: `1px solid ${isActive ? (cfg ? cfg.color + "40" : "#BFDBFE") : "#E2E8F0"}`,
                    }}
                  >
                    {f === "all" ? "전체" : cfg!.label}
                  </button>
                );
              })}
            </div>

            <div className="flex-1" />

            {selected.size > 0 && (
              <>
                {canAct && (
                  <button
                    onClick={handleBulkMaintenance}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors"
                    style={allSelectedMaintenance
                      ? { fontSize: "11px", fontWeight: 600, color: "#15803D", border: "1px solid #BBF7D0", background: "white" }
                      : { fontSize: "11px", fontWeight: 600, color: "#5B21B6", border: "1px solid #DDD6FE", background: "white" }
                    }
                  >
                    <Wrench size={12} />
                    {allSelectedMaintenance ? `${selected.size}개 유지보수 완료` : `${selected.size}개 유지보수 예약`}
                  </button>
                )}
                {canManage && (
                  <button
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-red-600 transition-colors hover:bg-red-50"
                    style={{ fontSize: "11px", fontWeight: 600, border: "1px solid #FEE2E2" }}
                  >
                    <Trash2 size={12} />
                    {selected.size}개 삭제
                  </button>
                )}
              </>
            )}

            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-slate-500 hover:bg-slate-50 transition-colors"
              style={{ fontSize: "11px", fontWeight: 500, border: "1px solid #E2E8F0" }}
            >
              <Download size={12} />
              CSV 내보내기
            </button>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full border-collapse" style={{ height: "100%" }}>
              <thead className="sticky top-0" style={{ background: "#FAFBFC", borderBottom: "1px solid #EEF2F7", zIndex: 10 }}>
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.size > 0 && selected.size === pageItems.length}
                      onChange={toggleAll}
                      className="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer"
                    />
                  </th>
                  <Th label="#" align="center" />
                  <Th label="장치 ID"     field="id"               sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <Th label="구역"        field="zone_name"        sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <Th label="층"          field="floor_name"       sortField={sortField} sortDir={sortDir} onSort={handleSort} align="center" />
                  <Th label="모델"        field="model_name"       sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <Th label="배터리"      field="battery_level"    sortField={sortField} sortDir={sortDir} onSort={handleSort} align="center" />
                  <Th label="상태"        field="status"           sortField={sortField} sortDir={sortDir} onSort={handleSort} align="center" />
                  <Th label="제조일자"    field="manufacture_date" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <Th label="설치일자"    field="install_date"     sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <Th label="담당자" />
                  <Th label="작업" align="center" />
                </tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-16 text-slate-300" style={{ fontSize: "13px" }}>
                      등록된 장치가 없습니다
                    </td>
                  </tr>
                ) : (
                  <>
                    {pageItems.map((device, idx) => {
                    const scfg = STATUS_CFG[device.status] ?? {
                      label: device.status_name || device.status, labelEn: device.status,
                      color: "#64748B", bg: "#F1F5F9", textColor: "#475569", Icon: AlertCircle,
                    };
                    const floorCfg = FLOOR_CFG[device.floor_name] ?? { color: "#64748B", bg: "#F1F5F9" };
                    const isChecked = selected.has(device.id);
                    const isPendingDel = pendingDelete === device.id;
                    const rowNum = page * PAGE_SIZE + idx + 1;
                    const battColor = device.battery_level < 20 ? "#EF4444" : device.battery_level < 50 ? "#F59E0B" : "#22C55E";
                    return (
                      <tr
                        key={device.id}
                        className="transition-colors"
                        style={{ height: `${100 / PAGE_SIZE}%`, background: isChecked ? "#F0F7FF" : "white", borderBottom: "1px solid #F8FAFC" }}
                        onMouseEnter={(e) => { if (!isChecked) (e.currentTarget as HTMLTableRowElement).style.background = "#FAFBFC"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = isChecked ? "#F0F7FF" : "white"; }}
                      >
                        <td className="w-10 px-4 py-3">
                          <input type="checkbox" checked={isChecked} onChange={() => toggleRow(device.id)} className="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer" />
                        </td>
                        <td className="px-2 py-3 text-center text-slate-300" style={{ fontSize: "11px" }}>{rowNum}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: scfg.color }} />
                            {onSelectDevice ? (
                              <button
                                onClick={() => onSelectDevice(device)}
                                className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                                style={{ fontSize: "12px", fontWeight: 700, background: "none", border: "none", padding: 0, cursor: "pointer" }}
                              >
                                {device.id}
                              </button>
                            ) : (
                              <span className="text-slate-800" style={{ fontSize: "12px", fontWeight: 700 }}>{device.id}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-600" style={{ fontSize: "12px" }}>{device.zone_name}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="px-2 py-0.5 rounded-md" style={{ fontSize: "10px", fontWeight: 700, background: floorCfg.bg, color: floorCfg.color }}>
                            {device.floor_name}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-slate-600" style={{ fontSize: "11px", fontWeight: 600 }}>{device.model_name}</p>
                            <p className="text-slate-400" style={{ fontSize: "10px" }}>{device.agent_type}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span style={{ fontSize: "11px", fontWeight: 700, color: battColor }}>{device.battery_level}%</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ fontSize: "10px", fontWeight: 700, background: scfg.bg, color: scfg.textColor }}>
                            <scfg.Icon size={9} />
                            {scfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-400" style={{ fontSize: "11px" }}>
                            {device.manufacture_date ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-400" style={{ fontSize: "11px" }}>{device.install_date}</span>
                        </td>
                        <td className="px-4 py-3">
                          {device.admin_name ? (
                            <div>
                              <p className="text-slate-700" style={{ fontSize: "11px", fontWeight: 600 }}>{device.admin_name}</p>
                              <p className="text-slate-400" style={{ fontSize: "10px", fontFamily: "monospace" }}>{device.admin_phone}</p>
                            </div>
                          ) : (
                            <span className="text-slate-200" style={{ fontSize: "11px" }}>—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {!canManage ? (
                            <span className="text-slate-200" style={{ fontSize: "11px" }}>—</span>
                          ) : isPendingDel ? (
                            <div className="flex items-center gap-1 justify-center">
                              <button onClick={() => handleDelete(device.id)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-white" style={{ fontSize: "10px", fontWeight: 600, background: "#EF4444" }}>
                                <Check size={10} /> 확인
                              </button>
                              <button onClick={() => setPendingDelete(null)} className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200">
                                <X size={10} style={{ color: "#64748B" }} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 justify-center">
                              <button
                                onClick={() => handleEdit(device)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-blue-50"
                                style={{ color: editingDeviceId === device.id ? "#2563EB" : "#CBD5E1" }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = "#2563EB")}
                                onMouseLeave={(e) => (e.currentTarget.style.color = editingDeviceId === device.id ? "#2563EB" : "#CBD5E1")}
                                title="장치 수정"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(device.id)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-50"
                                style={{ color: "#CBD5E1" }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = "#EF4444")}
                                onMouseLeave={(e) => (e.currentTarget.style.color = "#CBD5E1")}
                                title="장치 삭제"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                    })}
                    {Array.from({ length: PAGE_SIZE - pageItems.length }, (_, i) => (
                      <tr key={`ph-${i}`} style={{ height: `${100 / PAGE_SIZE}%`, borderBottom: "1px solid #F8FAFC" }}>
                        <td colSpan={12} />
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderTop: "1px solid #F1F5F9", background: "#FAFBFC" }}>
            <p className="text-slate-400" style={{ fontSize: "11px" }}>
              {sorted.length > 0
                ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, sorted.length)} / 총 ${sorted.length}개`
                : "0개 장치"}
            </p>
            <div className="flex items-center gap-1">
              <PageBtn disabled={page === 0} onClick={() => setPage(page - 1)} label="←" />
              {Array.from({ length: pageCount }, (_, i) => (
                <PageBtn key={i} active={i === page} onClick={() => setPage(i)} label={String(i + 1)} />
              ))}
              <PageBtn disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)} label="→" />
            </div>
          </div>
        </div>

        {/* RIGHT: Form (35%) */}
        <div
          className="bg-white rounded-2xl flex flex-col overflow-y-auto"
          style={{ flex: "0 0 360px", boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "1px solid #EEF2F7" }}
        >
          <div className="px-6 pt-6 pb-5 flex-shrink-0" style={{ borderBottom: "1px solid #F1F5F9" }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #2563EB, #60A5FA)" }}>
                {isEditing ? <Pencil size={16} color="white" /> : <Plus size={16} color="white" />}
              </div>
              <div>
                <p className="text-slate-800" style={{ fontSize: "14px", fontWeight: 800 }}>{isEditing ? "장치 정보 수정" : "새 장치 등록"}</p>
                <p className="text-slate-400" style={{ fontSize: "10px" }}>{isEditing ? `Editing ${editingDeviceId}` : "Register New Device"}</p>
              </div>
            </div>
            <p className="text-slate-400 mt-3" style={{ fontSize: "11px", lineHeight: "1.5" }}>
              {isEditing ? "선택한 장치의 위치, 모델, 네트워크, 날짜, 담당자 정보를 수정하세요." : "소화기 장치 정보를 입력하여 모니터링 네트워크에 추가하세요."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4 flex-1">
            {formGlobalError && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#FEE2E2", border: "1px solid #FECACA" }}>
                <AlertCircle size={13} style={{ color: "#DC2626", flexShrink: 0 }} />
                <p style={{ fontSize: "11px", color: "#991B1B" }}>{formGlobalError}</p>
              </div>
            )}
            {formSuccess && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#DCFCE7", border: "1px solid #BBF7D0" }}>
                <CheckCircle size={13} style={{ color: "#16A34A", flexShrink: 0 }} />
                <p style={{ fontSize: "11px", color: "#15803D", fontWeight: 600 }}>{formSuccessMessage}</p>
              </div>
            )}

            {/* Device ID */}
            <FormField label="Device ID" en="Device ID (선택)" error={errors.device_id}>
              <TextInput value={form.device_id} onChange={(v) => updateField("device_id", v)} placeholder="예: FE-999" mono />
              <p className="mt-1 text-slate-300" style={{ fontSize: "10px" }}>{isEditing ? "수정 중에는 고유한 ID를 입력하세요" : "비워두면 자동 생성됩니다"}</p>
            </FormField>

            {/* Floor */}
            <FormField label="층" en="Floor" required error={errors.floor_id}>
              <SelectInput
                value={form.floor_id}
                onChange={(v) => updateField("floor_id", v)}
                hasError={!!errors.floor_id}
              >
                <option value="" disabled>층 선택…</option>
                {floorOptions.map((f) => <option key={f.floor_id} value={String(f.floor_id)}>{f.floor_name}</option>)}
              </SelectInput>
            </FormField>

            {/* Zone */}
            <FormField label="구역" en="Zone" required error={errors.zone_id}>
              <SelectInput
                value={form.zone_id}
                onChange={(v) => updateField("zone_id", v)}
                hasError={!!errors.zone_id}
                disabled={!form.floor_id}
              >
                <option value="" disabled>{form.floor_id ? "구역 선택…" : "층을 먼저 선택하세요"}</option>
                {filteredZones.map((z) => <option key={z.zone_id} value={String(z.zone_id)}>{z.zone_name}</option>)}
              </SelectInput>
            </FormField>

            {/* Model */}
            <FormField label="소화기 모델" en="Model" required error={errors.model_id}>
              <SelectInput
                value={form.model_id}
                onChange={(v) => updateField("model_id", v)}
                hasError={!!errors.model_id}
              >
                <option value="" disabled>모델 선택…</option>
                {modelOptions.map((m) => <option key={m.model_id} value={String(m.model_id)}>{m.model_name} ({m.agent_type})</option>)}
              </SelectInput>
            </FormField>

            {/* MAC */}
            <FormField label="MAC 주소" en="MAC Address" required error={errors.mac_address}>
              <TextInput value={form.mac_address} onChange={(v) => updateField("mac_address", v)} placeholder="예: 00:1A:2B:3C:4D:5E" mono />
              <p className="mt-1 text-slate-300" style={{ fontSize: "10px" }}>장치 본체/라즈베리파이 라벨에 표시된 실제 MAC 주소를 입력하세요</p>
            </FormField>

            {/* IP */}
            <FormField label="IP 주소" en="IP Address">
              <TextInput value={form.ip_address} onChange={(v) => updateField("ip_address", v)} placeholder="예: 192.168.1.50" mono />
            </FormField>

            {/* Manufacture date */}
            <FormField label="제조일자" en="Manufacture Date">
              <TextInput type="date" value={form.manufacture_date} onChange={(v) => updateField("manufacture_date", v)} />
            </FormField>

            {/* Install date */}
            <FormField label="설치일" en="Install Date">
              <TextInput type="date" value={form.install_date} onChange={(v) => updateField("install_date", v)} placeholder={todayStr()} />
            </FormField>

            {/* Expiry date */}
            <FormField label="만료일" en="Expiry Date (선택)">
              <TextInput type="date" value={form.expiry_date} onChange={(v) => updateField("expiry_date", v)} />
              <p className="mt-1 text-slate-300" style={{ fontSize: "10px" }}>미입력 시 설치일 +3년</p>
            </FormField>

            {/* Admin */}
            <FormField label="담당자" en="Admin (선택)">
              <SelectInput value={form.admin_id} onChange={(v) => updateField("admin_id", v)} hasError={false} disabled={!form.floor_id}>
                <option value="">{form.floor_id ? (filteredAdmins.length === 0 ? "해당 층 담당자 없음" : "담당자 미지정") : "층을 먼저 선택하세요"}</option>
                {filteredAdmins.map((a) => (
                  <option key={a.admin_id} value={String(a.admin_id)}>{a.admin_name}{a.phone_number ? ` (${a.phone_number})` : ""}</option>
                ))}
              </SelectInput>
            </FormField>

            <div className="h-px bg-slate-100" />

            {!canManage && (
              <p className="text-center text-amber-600" style={{ fontSize: "11px" }}>
                장치 등록/수정 권한이 없습니다 (manager 이상 필요)
              </p>
            )}

            <button
              type="submit"
              disabled={!canManage}
              className="w-full py-3 rounded-xl text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)", fontSize: "13px", fontWeight: 700, boxShadow: "0 4px 14px rgba(37,99,235,0.35)" }}
            >
              {isEditing ? <Check size={15} /> : <Plus size={15} />}
              {isEditing ? "수정 저장" : "장치 추가"}
            </button>

            {isEditing && (
              <button
                type="button"
                onClick={resetForm}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                style={{ fontSize: "12px", fontWeight: 600 }}
              >
                수정 취소
              </button>
            )}

            <p className="text-center text-slate-300" style={{ fontSize: "10px" }}>
              <span style={{ color: "#EF4444" }}>*</span> 표시된 항목은 필수 입력 사항입니다
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FormField({ label, en, required, error, children }: { label: string; en: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block mb-1.5" style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>
        {label} {required && <span style={{ color: "#EF4444" }}>*</span>}
        <span className="ml-1 text-slate-300" style={{ fontSize: "10px", fontWeight: 400 }}>{en}</span>
      </label>
      {children}
      {error && <p className="mt-1" style={{ fontSize: "10px", color: "#EF4444" }}>{error}</p>}
    </div>
  );
}

function SelectInput({ value, onChange, hasError, disabled, children }: { value: string; onChange: (v: string) => void; hasError: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3.5 py-2.5 rounded-xl outline-none appearance-none transition-all"
        style={{
          fontSize: "12px",
          border: `1.5px solid ${hasError ? "#FCA5A5" : "#E2E8F0"}`,
          background: disabled ? "#F1F5F9" : hasError ? "#FFF5F5" : "#FAFBFC",
          color: disabled ? "#CBD5E1" : value ? "#334155" : "#94A3B8",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onFocus={(e) => { if (!hasError && !disabled) e.target.style.borderColor = "#93C5FD"; if (!disabled) e.target.style.background = "white"; }}
        onBlur={(e) => { if (!hasError) e.target.style.borderColor = "#E2E8F0"; }}
      >
        {children}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
        <ChevronDown size={13} style={{ color: disabled ? "#CBD5E1" : "#94A3B8" }} />
      </div>
    </div>
  );
}

function TextInput({ value, onChange, placeholder, mono, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3.5 py-2.5 rounded-xl outline-none transition-all"
      style={{ fontSize: "12px", fontFamily: mono ? "monospace" : undefined, border: "1.5px solid #E2E8F0", background: "#FAFBFC", color: "#334155" }}
      onFocus={(e) => { e.target.style.borderColor = "#93C5FD"; e.target.style.background = "white"; }}
      onBlur={(e) => { e.target.style.borderColor = "#E2E8F0"; }}
    />
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

function Th({ label, field, sortField, sortDir, onSort, align = "left" }: {
  label: string; field?: keyof Device; sortField?: keyof Device | null; sortDir?: "asc" | "desc";
  onSort?: (f: keyof Device) => void; align?: "left" | "center";
}) {
  const isActive = field && sortField === field;
  return (
    <th
      className={`px-4 py-3 ${align === "center" ? "text-center" : "text-left"} ${field && onSort ? "cursor-pointer select-none" : ""}`}
      style={{ fontSize: "10px", fontWeight: 700, color: isActive ? "#2563EB" : "#94A3B8", letterSpacing: "0.05em", whiteSpace: "nowrap" }}
      onClick={() => field && onSort && onSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === "center" ? "justify-center" : ""}`}>
        {label.toUpperCase()}
        {field && onSort && (
          <span style={{ opacity: 0.5 }}>
            {isActive
              ? sortDir === "asc" ? <ChevronUp size={10} style={{ color: "#2563EB", opacity: 1 }} /> : <ChevronDown size={10} style={{ color: "#2563EB", opacity: 1 }} />
              : <ChevronsUpDown size={10} />}
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
        fontSize: "11px", fontWeight: active ? 700 : 400,
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
