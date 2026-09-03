import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Building2,
  Camera,
  Check,
  ChevronDown,
  Contrast,
  Droplets,
  FileUp,
  Flame,
  Lightbulb,
  MessageSquareWarning,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Trash2,
  Volume2,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { authHeaders } from "../auth";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

type SettingsCategory = "alerts" | "zones" | "inspection" | "emergency";

export interface FloorConfig {
  floorId?: number;
  key: string;
  label: string;
  zones: string;
  mapFileName: string;
  defaultMapUrl?: string;
}

export const DEFAULT_FLOORS: FloorConfig[] = [
  { key: "B1", label: "지하 1층 (B1)", zones: "주차장, 창고", mapFileName: "", defaultMapUrl: "/floor-maps/floor-b1.png" },
  { key: "1F", label: "1층 (Floor 1)", zones: "로비, 복도, 계단", mapFileName: "", defaultMapUrl: "/floor-maps/floor-1f.png" },
  { key: "2F", label: "2층 (Floor 2)", zones: "강의실, 복도", mapFileName: "", defaultMapUrl: "/floor-maps/floor-2f.png" },
  { key: "3F", label: "3층 (Floor 3)", zones: "강의실, 복도", mapFileName: "", defaultMapUrl: "/floor-maps/floor-3f.png" },
  { key: "4F", label: "4층 (Floor 4)", zones: "강의실, 복도", mapFileName: "", defaultMapUrl: "/floor-maps/floor-4f.png" },
  { key: "5F", label: "5층 (Floor 5)", zones: "강의실, 복도", mapFileName: "", defaultMapUrl: "/floor-maps/floor-5f.png" },
];

interface SettingsFormData {
  obstacleAlert: boolean;
  missingExtinguisherAlert: boolean;
  fireAlert: boolean;
  humidityAlert: boolean;
  inspectionScheduleAlert: boolean;
  inspectionCycle: string;
  inspectionReminder: boolean;
  missedInspectionWarning: boolean;
  ledAutoOn: boolean;
  buzzerAutoRun: boolean;
  emergencyMode: boolean;
  visionIntervalMinutes: string;
}

interface FloorPlanEditDraft {
  floorKey: string;
  fileName: string;
  source: string;
}

const INITIAL_SETTINGS: SettingsFormData = {
  obstacleAlert: true,
  missingExtinguisherAlert: true,
  fireAlert: true,
  humidityAlert: true,
  inspectionScheduleAlert: true,
  inspectionCycle: "30",
  inspectionReminder: true,
  missedInspectionWarning: true,
  ledAutoOn: true,
  buzzerAutoRun: true,
  emergencyMode: false,
  visionIntervalMinutes: "30",
};

const CATEGORIES: {
  key: SettingsCategory;
  icon: React.ElementType;
  label: string;
  sublabel: string;
}[] = [
  { key: "alerts", icon: Bell, label: "알림 관리", sublabel: "Alert Management" },
  { key: "zones", icon: Building2, label: "층·구역 관리", sublabel: "Floor & Zone" },
  { key: "inspection", icon: Wrench, label: "점검 관리", sublabel: "Inspection" },
  { key: "emergency", icon: ShieldAlert, label: "비상 대응 설정", sublabel: "Emergency Response" },
];

const PAGE_META: Record<SettingsCategory, { title: string; subtitle: string }> = {
  alerts: {
    title: "알림 관리",
    subtitle: "장애물, 소화기 이탈, 화재, 점검 일정 알림을 관리합니다",
  },
  zones: {
    title: "층·구역 관리",
    subtitle: "층과 구역 정보, 도면, 소화기 위치를 관리합니다",
  },
  inspection: {
    title: "점검 관리",
    subtitle: "정기 점검 주기와 미점검 경고 정책을 설정합니다",
  },
  emergency: {
    title: "비상 대응 설정",
    subtitle: "화재 발생 시 LED, 부저, 비상 모드 동작을 설정합니다",
  },
};

export function Settings() {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("alerts");
  const [formData, setFormData] = useState<SettingsFormData>(INITIAL_SETTINGS);
  const [savedFormData, setSavedFormData] = useState<SettingsFormData>(INITIAL_SETTINGS);
  const [floors, setFloors] = useState<FloorConfig[]>(DEFAULT_FLOORS);
  const [savedFloors, setSavedFloors] = useState<FloorConfig[]>(DEFAULT_FLOORS);
  const [floorMaps, setFloorMaps] = useState<Record<string, string>>({});
  const [savedFloorMaps, setSavedFloorMaps] = useState<Record<string, string>>({});
  const [pendingImageUploads, setPendingImageUploads] = useState<Record<string, { fileName: string; dataUrl: string }>>({});
  const [pendingImageDeletes, setPendingImageDeletes] = useState<string[]>([]);
  const [expandedFloor, setExpandedFloor] = useState<string | null>(null);
  const [editingMap, setEditingMap] = useState<FloorPlanEditDraft | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/floors/detail`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: Array<{ floor_id: number; floor_name: string; floor_label: string | null; level: number; image_key: string | null; zones: Array<{ zone_id: number; zone_name: string }> }>) => {
        const serverFloors: FloorConfig[] = data.map((f) => ({
          floorId: f.floor_id,
          key: f.floor_label ?? f.floor_name,
          label: f.floor_name,
          zones: (f.zones || []).map((z) => z.zone_name).join(", "),
          mapFileName: f.image_key ? f.image_key.split("/").pop() ?? "" : "",
        }));
        setFloors(serverFloors);
        setSavedFloors(serverFloors);

        const maps: Record<string, string> = {};
        data.forEach((f) => {
          const key = f.floor_label ?? f.floor_name;
          if (f.image_key) {
            maps[key] = `${API_BASE}/static/floor-images/${f.image_key}`;
          }
        });
        setFloorMaps(maps);
        setSavedFloorMaps(maps);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/settings/alerts`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${API_BASE}/api/settings/inspection`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${API_BASE}/api/settings/emergency`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${API_BASE}/api/settings/vision`, { headers: authHeaders() }).then((r) => r.json()),
    ])
      .then(([alerts, inspection, emergency, vision]) => {
        const loaded: SettingsFormData = {
          obstacleAlert: alerts.obstacle_alert,
          missingExtinguisherAlert: alerts.missing_extinguisher_alert,
          fireAlert: alerts.fire_alert,
          humidityAlert: alerts.humidity_alert,
          inspectionScheduleAlert: alerts.inspection_schedule_alert,
          inspectionCycle: String(inspection.inspection_cycle),
          inspectionReminder: inspection.inspection_reminder,
          missedInspectionWarning: inspection.missed_inspection_warning,
          ledAutoOn: emergency.led_auto_on,
          buzzerAutoRun: emergency.buzzer_auto_run,
          emergencyMode: emergency.emergency_mode,
          visionIntervalMinutes: String(vision.inference_interval_minutes),
        };
        setFormData(loaded);
        setSavedFormData(loaded);
      })
      .catch(() => {});
  }, []);

  const updateField = (key: keyof SettingsFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const updateFloor = (index: number, updated: FloorConfig) => {
    const oldKey = floors[index].key;
    setFloors((prev) => prev.map((f, i) => (i === index ? updated : f)));
    if (updated.key !== oldKey) {
      if (expandedFloor === oldKey) setExpandedFloor(updated.key);
      setFloorMaps((prev) => {
        if (!prev[oldKey]) return prev;
        const next = { ...prev };
        next[updated.key] = prev[oldKey];
        delete next[oldKey];
        return next;
      });
      setPendingImageUploads((prev) => {
        if (!prev[oldKey]) return prev;
        const next = { ...prev };
        next[updated.key] = prev[oldKey];
        delete next[oldKey];
        return next;
      });
    }
  };

  const deleteFloor = async (index: number) => {
    const floor = floors[index];
    if (floor.floorId) {
      try {
        await fetch(`${API_BASE}/api/floors/${floor.floorId}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
      } catch {
        // proceed with local removal even if API call fails
      }
    }
    setFloors((prev) => prev.filter((_, i) => i !== index));
    setFloorMaps((prev) => {
      const next = { ...prev };
      delete next[floor.key];
      return next;
    });
    setPendingImageUploads((prev) => {
      const next = { ...prev };
      delete next[floor.key];
      return next;
    });
    setPendingImageDeletes((prev) => prev.filter((k) => k !== floor.key));
    if (expandedFloor === floor.key) setExpandedFloor(null);
  };

  const addFloor = async () => {
    const newKey = `F${floors.length + 1}`;
    const newLabel = `${floors.length + 1}층`;
    try {
      const res = await fetch(`${API_BASE}/api/floors`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ floor_name: newLabel, floor_label: newKey, level: floors.length, zone_names: [] }),
      });
      if (res.ok) {
        const created = await res.json();
        const newFloor: FloorConfig = { floorId: created.floor_id, key: newKey, label: newLabel, zones: "", mapFileName: "" };
        setFloors((prev) => [...prev, newFloor]);
        setExpandedFloor(newKey);
        return;
      }
    } catch {
      // fall through to local-only add
    }
    const newFloor: FloorConfig = { key: newKey, label: newLabel, zones: "", mapFileName: "" };
    setFloors((prev) => [...prev, newFloor]);
    setExpandedFloor(newKey);
  };

  const deleteFloorMap = (floorKey: string) => {
    setPendingImageDeletes((prev) => {
      if (!savedFloorMaps[floorKey]) return prev.filter((k) => k !== floorKey);
      return prev.includes(floorKey) ? prev : [...prev, floorKey];
    });
    setPendingImageUploads((prev) => {
      const next = { ...prev };
      delete next[floorKey];
      return next;
    });
    setFloorMaps((prev) => {
      const next = { ...prev };
      delete next[floorKey];
      return next;
    });
  };

  const applyEditedFloorMap = (floorKey: string, fileName: string, data: string) => {
    setPendingImageUploads((prev) => ({ ...prev, [floorKey]: { fileName, dataUrl: data } }));
    setPendingImageDeletes((prev) => prev.filter((k) => k !== floorKey));
    setFloorMaps((prev) => ({ ...prev, [floorKey]: data }));
    setFloors((prev) => prev.map((floor) => (floor.key === floorKey ? { ...floor, mapFileName: fileName } : floor)));
    setEditingMap(null);
  };

  type SettingsGroup = { url: string; body: Record<string, unknown>; apply: Partial<SettingsFormData> };

  const putSettingsGroups = async (groups: SettingsGroup[]) => {
    const results = await Promise.all(
      groups.map((group) =>
        fetch(group.url, {
          method: "PUT",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(group.body),
        })
      )
    );
    const failed: string[] = [];
    const succeededFields: Partial<SettingsFormData> = {};
    results.forEach((res, i) => {
      if (res.ok) {
        Object.assign(succeededFields, groups[i].apply);
      } else {
        failed.push(`${groups[i].url.split("/").pop()} (${res.status})`);
      }
    });
    setSavedFormData((prev) => ({ ...prev, ...succeededFields }));
    if (failed.length > 0) throw new Error(`저장 실패: ${failed.join(", ")}`);
  };

  const runSave = async (task: () => Promise<void>) => {
    setSaving(true);
    setSaveError(null);
    try {
      await task();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Save error:", err);
      setSaveError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAlerts = () =>
    runSave(() =>
      putSettingsGroups([
        {
          url: `${API_BASE}/api/settings/alerts`,
          body: {
            obstacle_alert: formData.obstacleAlert,
            missing_extinguisher_alert: formData.missingExtinguisherAlert,
            fire_alert: formData.fireAlert,
            humidity_alert: formData.humidityAlert,
            inspection_schedule_alert: formData.inspectionScheduleAlert,
          },
          apply: {
            obstacleAlert: formData.obstacleAlert,
            missingExtinguisherAlert: formData.missingExtinguisherAlert,
            fireAlert: formData.fireAlert,
            humidityAlert: formData.humidityAlert,
            inspectionScheduleAlert: formData.inspectionScheduleAlert,
          },
        },
        {
          url: `${API_BASE}/api/settings/vision`,
          body: { inference_interval_minutes: Number(formData.visionIntervalMinutes) },
          apply: { visionIntervalMinutes: formData.visionIntervalMinutes },
        },
      ])
    );

  const handleSaveInspection = () =>
    runSave(() =>
      putSettingsGroups([
        {
          url: `${API_BASE}/api/settings/inspection`,
          body: {
            inspection_cycle: Number(formData.inspectionCycle),
            inspection_reminder: formData.inspectionReminder,
            missed_inspection_warning: formData.missedInspectionWarning,
          },
          apply: {
            inspectionCycle: formData.inspectionCycle,
            inspectionReminder: formData.inspectionReminder,
            missedInspectionWarning: formData.missedInspectionWarning,
          },
        },
      ])
    );

  const handleSaveEmergency = () =>
    runSave(() =>
      putSettingsGroups([
        {
          url: `${API_BASE}/api/settings/emergency`,
          body: {
            led_auto_on: formData.ledAutoOn,
            buzzer_auto_run: formData.buzzerAutoRun,
            emergency_mode: formData.emergencyMode,
          },
          apply: {
            ledAutoOn: formData.ledAutoOn,
            buzzerAutoRun: formData.buzzerAutoRun,
            emergencyMode: formData.emergencyMode,
          },
        },
      ])
    );

  const handleSaveZones = () =>
    runSave(async () => {
      // Upload pending images
      for (const [floorKey, upload] of Object.entries(pendingImageUploads)) {
        const floor = floors.find((f) => f.key === floorKey);
        if (!floor?.floorId) continue;
        const blob = await fetch(upload.dataUrl).then((r) => r.blob());
        const fd = new FormData();
        fd.append("file", new File([blob], upload.fileName, { type: blob.type }));
        const res = await fetch(`${API_BASE}/api/floors/${floor.floorId}/image`, {
          method: "POST",
          headers: authHeaders(),
          body: fd,
        });
        if (!res.ok) throw new Error(`도면 업로드 실패 (${floor.label}): ${res.status}`);
        const result = await res.json();
        setFloorMaps((prev) => ({ ...prev, [floorKey]: `${API_BASE}/static/floor-images/${result.image_key}` }));
      }
      setPendingImageUploads({});

      // Delete pending images
      for (const floorKey of pendingImageDeletes) {
        const floor = floors.find((f) => f.key === floorKey);
        if (!floor?.floorId) continue;
        const res = await fetch(`${API_BASE}/api/floors/${floor.floorId}/image`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error(`도면 삭제 실패 (${floor.label}): ${res.status}`);
      }
      setPendingImageDeletes([]);

      // Update floor metadata
      for (const floor of floors) {
        if (!floor.floorId) continue;
        const res = await fetch(`${API_BASE}/api/floors/${floor.floorId}`, {
          method: "PUT",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            floor_name: floor.label,
            floor_label: floor.key,
            zone_names: floor.zones.split(",").map((z) => z.trim()).filter(Boolean),
          }),
        });
        if (!res.ok) throw new Error(`층 정보 저장 실패 (${floor.label}): ${res.status}`);
      }

      setSavedFloors(floors);
      setSavedFloorMaps({ ...floorMaps });
    });

  const SAVE_HANDLERS: Record<SettingsCategory, () => void> = {
    alerts: handleSaveAlerts,
    zones: handleSaveZones,
    inspection: handleSaveInspection,
    emergency: handleSaveEmergency,
  };

  const handleSave = () => SAVE_HANDLERS[activeCategory]();

  const handleCancel = () => {
    switch (activeCategory) {
      case "alerts":
        setFormData((prev) => ({
          ...prev,
          obstacleAlert: savedFormData.obstacleAlert,
          missingExtinguisherAlert: savedFormData.missingExtinguisherAlert,
          fireAlert: savedFormData.fireAlert,
          humidityAlert: savedFormData.humidityAlert,
          inspectionScheduleAlert: savedFormData.inspectionScheduleAlert,
          visionIntervalMinutes: savedFormData.visionIntervalMinutes,
        }));
        break;
      case "inspection":
        setFormData((prev) => ({
          ...prev,
          inspectionCycle: savedFormData.inspectionCycle,
          inspectionReminder: savedFormData.inspectionReminder,
          missedInspectionWarning: savedFormData.missedInspectionWarning,
        }));
        break;
      case "emergency":
        setFormData((prev) => ({
          ...prev,
          ledAutoOn: savedFormData.ledAutoOn,
          buzzerAutoRun: savedFormData.buzzerAutoRun,
          emergencyMode: savedFormData.emergencyMode,
        }));
        break;
      case "zones":
        setFloors(savedFloors);
        setFloorMaps(savedFloorMaps);
        setPendingImageUploads({});
        setPendingImageDeletes([]);
        break;
    }
    setSaved(false);
    setSaveError(null);
  };

  const switchCategory = (key: SettingsCategory) => {
    setActiveCategory(key);
    setSaved(false);
    setSaveError(null);
  };

  const isZonesDirty =
    JSON.stringify(floors) !== JSON.stringify(savedFloors) ||
    JSON.stringify(floorMaps) !== JSON.stringify(savedFloorMaps) ||
    Object.keys(pendingImageUploads).length > 0 ||
    pendingImageDeletes.length > 0;

  const isDirty = (() => {
    switch (activeCategory) {
      case "alerts":
        return (
          formData.obstacleAlert !== savedFormData.obstacleAlert ||
          formData.missingExtinguisherAlert !== savedFormData.missingExtinguisherAlert ||
          formData.fireAlert !== savedFormData.fireAlert ||
          formData.humidityAlert !== savedFormData.humidityAlert ||
          formData.inspectionScheduleAlert !== savedFormData.inspectionScheduleAlert ||
          formData.visionIntervalMinutes !== savedFormData.visionIntervalMinutes
        );
      case "inspection":
        return (
          formData.inspectionCycle !== savedFormData.inspectionCycle ||
          formData.inspectionReminder !== savedFormData.inspectionReminder ||
          formData.missedInspectionWarning !== savedFormData.missedInspectionWarning
        );
      case "emergency":
        return (
          formData.ledAutoOn !== savedFormData.ledAutoOn ||
          formData.buzzerAutoRun !== savedFormData.buzzerAutoRun ||
          formData.emergencyMode !== savedFormData.emergencyMode
        );
      case "zones":
        return isZonesDirty;
      default:
        return false;
    }
  })();

  const page = PAGE_META[activeCategory];

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "#F4F6F9" }}>
      <div
        className="flex flex-col w-64 flex-shrink-0 border-r"
        style={{ background: "white", borderColor: "#EEF2F7" }}
      >
        <div className="px-5 pt-6 pb-5" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <h2 className="text-slate-800" style={{ fontSize: "15px", fontWeight: 800 }}>설정</h2>
          <p className="text-slate-400" style={{ fontSize: "10px" }}>System Settings</p>
        </div>

        <div className="flex flex-col gap-1 p-3">
          {CATEGORIES.map(({ key: catKey, icon, label, sublabel }) => (
            <CategoryItem
              key={catKey}
              icon={icon}
              label={label}
              sublabel={sublabel}
              active={activeCategory === catKey}
              onClick={() => switchCategory(catKey)}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 pt-5 pb-4 flex-shrink-0" style={{ borderBottom: "1px solid #EEF2F7" }}>
          <h1 className="text-slate-800" style={{ fontSize: "17px", fontWeight: 800 }}>{page.title}</h1>
          <p className="text-slate-400" style={{ fontSize: "11px" }}>{page.subtitle}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-5xl flex flex-col gap-5">
            {saved && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-xl"
                style={{ background: "#DCFCE7", border: "1px solid #BBF7D0" }}
              >
                <Check size={14} style={{ color: "#16A34A" }} />
                <p style={{ fontSize: "12px", color: "#15803D", fontWeight: 600 }}>
                  설정이 성공적으로 저장되었습니다.
                </p>
              </div>
            )}

            {saveError && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-xl"
                style={{ background: "#FEE2E2", border: "1px solid #FECACA" }}
              >
                <AlertTriangle size={14} style={{ color: "#DC2626" }} />
                <p style={{ fontSize: "12px", color: "#B91C1C", fontWeight: 600 }}>
                  저장에 실패했습니다: {saveError}
                </p>
              </div>
            )}

            {activeCategory === "alerts" && (
              <SettingsPanel icon={Bell} title="알림 관리" subtitle="Alert Management">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <ToggleRow
                    icon={MessageSquareWarning}
                    label="장애물 감지 알림"
                    sublabel="Obstacle Detection Alert"
                    description="소화기 주변에 장애물이 감지되면 관리자에게 알림을 보냅니다."
                    checked={formData.obstacleAlert}
                    onChange={(checked) => updateField("obstacleAlert", checked)}
                  />
                  <ToggleRow
                    icon={AlertTriangle}
                    label="소화기 이탈 알림"
                    sublabel="Extinguisher Missing Alert"
                    description="소화기가 지정 위치에서 벗어나거나 신호가 끊기면 알림을 보냅니다."
                    checked={formData.missingExtinguisherAlert}
                    onChange={(checked) => updateField("missingExtinguisherAlert", checked)}
                  />
                  <ToggleRow
                    icon={Flame}
                    label="화재 발생 알림"
                    sublabel="Fire Alert"
                    description="온도 급상승, 연기, 위험 신호 감지 시 긴급 알림을 전송합니다."
                    checked={formData.fireAlert}
                    onChange={(checked) => updateField("fireAlert", checked)}
                  />
                  <ToggleRow
                    icon={Droplets}
                    label="습도 경고 알림"
                    sublabel="Humidity Warning Alert"
                    description="거치대 주변 습도가 기준치를 벗어나면 알림을 보냅니다."
                    checked={formData.humidityAlert}
                    onChange={(checked) => updateField("humidityAlert", checked)}
                  />
                  <ToggleRow
                    icon={Wrench}
                    label="점검 일정 알림"
                    sublabel="Inspection Schedule Alert"
                    description="정기 점검 예정일이 다가오면 담당 관리자에게 알림을 보냅니다."
                    checked={formData.inspectionScheduleAlert}
                    onChange={(checked) => updateField("inspectionScheduleAlert", checked)}
                  />
                  <TextField
                    icon={Camera}
                    label="비전 감지 주기"
                    sublabel="Edge Vision Inference Interval"
                    suffix="분"
                    type="number"
                    value={formData.visionIntervalMinutes}
                    onChange={(value) => updateField("visionIntervalMinutes", value)}
                  />
                </div>
              </SettingsPanel>
            )}

            {activeCategory === "zones" && (
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-5">
                <SettingsPanel icon={Building2} title="층·구역 관리" subtitle="Floor & Zone Management">
                  <div className="flex flex-col gap-3">
                    {floors.map((floor, index) => (
                      <FloorCard
                        key={index}
                        floor={floor}
                        mapData={floorMaps[floor.key] ?? ""}
                        isExpanded={expandedFloor === floor.key}
                        onToggle={() => setExpandedFloor(expandedFloor === floor.key ? null : floor.key)}
                        onUpdate={(updated) => updateFloor(index, updated)}
                        onDelete={() => deleteFloor(index)}
                        onMapDelete={() => deleteFloorMap(floor.key)}
                        onMapEdit={(source, fileName) => setEditingMap({ floorKey: floor.key, fileName, source })}
                      />
                    ))}
                    <button
                      onClick={addFloor}
                      className="flex items-center justify-center gap-2 py-3 rounded-xl transition-all hover:bg-blue-50"
                      style={{ border: "1.5px dashed #BFDBFE", color: "#3B82F6", fontSize: "12px", fontWeight: 600 }}
                    >
                      <Plus size={14} />
                      층 추가
                    </button>
                  </div>
                </SettingsPanel>
                <div className="flex flex-col gap-3">
                  <SettingsPanel icon={ShieldCheck} title="층 요약" subtitle="Floor Summary">
                    <div className="flex flex-col gap-2">
                      {floors.map((f) => (
                        <div key={f.key} className="flex items-start gap-2 py-2" style={{ borderBottom: "1px solid #F1F5F9" }}>
                          <div className="w-8 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ background: "#EFF6FF" }}>
                            <span style={{ fontSize: "9px", fontWeight: 800, color: "#2563EB" }}>{f.key}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p style={{ fontSize: "11px", fontWeight: 700, color: "#334155" }}>{f.label}</p>
                            <p className="truncate" style={{ fontSize: "10px", color: "#94A3B8" }}>
                              {f.zones || "구역 없음"}
                            </p>
                            {(floorMaps[f.key]) && (
                              <span style={{ fontSize: "9px", color: "#3B82F6", fontWeight: 600 }}>도면 등록됨</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </SettingsPanel>
                </div>
              </div>
            )}

            {activeCategory === "inspection" && (
              <SettingsPanel icon={Wrench} title="점검 관리" subtitle="Inspection Management">
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <TextField
                    icon={Wrench}
                    label="정기 점검 주기"
                    sublabel="Inspection Cycle"
                    suffix="일"
                    type="number"
                    value={formData.inspectionCycle}
                    onChange={(value) => updateField("inspectionCycle", value)}
                  />
                  <ToggleRow
                    icon={Bell}
                    label="점검 알림 설정"
                    sublabel="Inspection Reminder"
                    description="점검 예정일 전에 담당 관리자에게 알림을 보냅니다."
                    checked={formData.inspectionReminder}
                    onChange={(checked) => updateField("inspectionReminder", checked)}
                  />
                  <ToggleRow
                    icon={AlertTriangle}
                    label="미점검 경고"
                    sublabel="Missed Inspection Warning"
                    description="점검 기한이 지난 장비를 경고 상태로 표시합니다."
                    checked={formData.missedInspectionWarning}
                    onChange={(checked) => updateField("missedInspectionWarning", checked)}
                  />
                </div>
              </SettingsPanel>
            )}

            {activeCategory === "emergency" && (
              <SettingsPanel icon={Siren} title="비상 대응 설정" subtitle="Emergency Response Settings">
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <ToggleRow
                    icon={Lightbulb}
                    label="LED 자동 점등"
                    sublabel="Auto LED On"
                    description="화재 또는 위험 상태 감지 시 소화기 LED를 자동으로 켭니다."
                    checked={formData.ledAutoOn}
                    onChange={(checked) => updateField("ledAutoOn", checked)}
                  />
                  <ToggleRow
                    icon={Volume2}
                    label="부저 자동 실행"
                    sublabel="Auto Buzzer"
                    description="긴급 상황에서 현장 부저를 자동으로 실행합니다."
                    checked={formData.buzzerAutoRun}
                    onChange={(checked) => updateField("buzzerAutoRun", checked)}
                  />
                  <ToggleRow
                    icon={Siren}
                    label="비상 모드 활성화"
                    sublabel="Emergency Mode"
                    description="대피 안내와 비상 알림을 우선 처리하는 모드를 활성화합니다."
                    checked={formData.emergencyMode}
                    onChange={(checked) => updateField("emergencyMode", checked)}
                    danger
                  />
                </div>
              </SettingsPanel>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={handleCancel}
                disabled={!isDirty}
                className="px-4 py-2 rounded-xl text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                style={{ fontSize: "12px", fontWeight: 500, border: "1px solid #E2E8F0", background: "white" }}
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, #2563EB, #3B82F6)",
                  fontSize: "12px",
                  fontWeight: 700,
                  boxShadow: "0 4px 14px rgba(37,99,235,0.35)",
                }}
              >
                <Save size={14} />
                {saving ? "저장 중..." : "변경사항 저장"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {editingMap && (
        <FloorPlanEditor
          draft={editingMap}
          floorLabel={floors.find((floor) => floor.key === editingMap.floorKey)?.label ?? editingMap.floorKey}
          onCancel={() => setEditingMap(null)}
          onApply={(data) => applyEditedFloorMap(editingMap.floorKey, editingMap.fileName, data)}
        />
      )}
    </div>
  );
}

function CategoryItem({
  icon: Icon,
  label,
  sublabel,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  sublabel: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left w-full"
      style={{
        background: active ? "#EFF6FF" : "transparent",
        border: active ? "1px solid #BFDBFE" : "1px solid transparent",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "#F8FAFC";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: active ? "#DBEAFE" : "#F1F5F9" }}>
        <Icon size={14} style={{ color: active ? "#2563EB" : "#94A3B8" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate" style={{ fontSize: "12px", fontWeight: active ? 700 : 600, color: active ? "#1E40AF" : "#475569" }}>
          {label}
        </p>
        <p className="truncate" style={{ fontSize: "10px", color: active ? "#60A5FA" : "#94A3B8" }}>
          {sublabel}
        </p>
      </div>
    </button>
  );
}

function SettingsPanel({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-white rounded-2xl p-6"
      style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "1px solid #EEF2F7" }}
    >
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#EFF6FF" }}>
          <Icon size={14} style={{ color: "#2563EB" }} />
        </div>
        <div>
          <h3 className="text-slate-800" style={{ fontSize: "13px", fontWeight: 800 }}>{title}</h3>
          <p className="text-slate-400" style={{ fontSize: "10px" }}>{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  sublabel,
  description,
  checked,
  onChange,
  danger = false,
}: {
  icon: React.ElementType;
  label: string;
  sublabel: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  danger?: boolean;
}) {
  const activeColor = danger ? "#DC2626" : "#2563EB";
  const activeBg = danger ? "#FEE2E2" : "#DBEAFE";

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl transition-all" style={{ background: "#F8FAFC", border: "1px solid #F1F5F9" }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: checked ? activeBg : "#F1F5F9" }}>
        <Icon size={15} style={{ color: checked ? activeColor : "#94A3B8" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-800" style={{ fontSize: "12px", fontWeight: 700 }}>{label}</p>
        <p className="text-slate-400 mb-1" style={{ fontSize: "10px" }}>{sublabel}</p>
        <p className="text-slate-500" style={{ fontSize: "11px", lineHeight: "1.5" }}>{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative rounded-full transition-all flex-shrink-0"
        style={{ width: "44px", height: "24px", background: checked ? activeColor : "#CBD5E1" }}
      >
        <div
          className="absolute top-1 rounded-full bg-white transition-all"
          style={{
            width: "16px",
            height: "16px",
            left: checked ? "26px" : "2px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        />
      </button>
    </div>
  );
}

function TextField({
  icon: Icon,
  label,
  sublabel,
  value,
  onChange,
  suffix,
  type = "text",
}: {
  icon: React.ElementType;
  label: string;
  sublabel: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  type?: string;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: "#F8FAFC", border: "1px solid #F1F5F9" }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#DBEAFE" }}>
          <Icon size={14} style={{ color: "#2563EB" }} />
        </div>
        <div>
          <p className="text-slate-800" style={{ fontSize: "12px", fontWeight: 700 }}>{label}</p>
          <p className="text-slate-400" style={{ fontSize: "10px" }}>{sublabel}</p>
        </div>
      </div>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-3 rounded-xl outline-none transition-all"
          style={{
            fontSize: "13px",
            border: "1.5px solid #E2E8F0",
            background: "white",
            color: "#334155",
            paddingRight: suffix ? "48px" : undefined,
          }}
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" style={{ fontSize: "12px" }}>{suffix}</span>
        )}
      </div>
    </div>
  );
}

function FloorPlanEditor({
  draft,
  floorLabel,
  onCancel,
  onApply,
}: {
  draft: FloorPlanEditDraft;
  floorLabel: string;
  onCancel: () => void;
  onApply: (data: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [grayscale, setGrayscale] = useState(0);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = draft.source;
  }, [draft.source]);

  const drawPreview = () => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#F8FAFC";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2 + offsetX, height / 2 + offsetY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) grayscale(${grayscale}%)`;

    const rotated = rotation % 180 !== 0;
    const sourceW = rotated ? image.height : image.width;
    const sourceH = rotated ? image.width : image.height;
    const scale = Math.min(width / sourceW, height / sourceH) * zoom;
    ctx.drawImage(image, (-image.width * scale) / 2, (-image.height * scale) / 2, image.width * scale, image.height * scale);
    ctx.restore();

    ctx.strokeStyle = "#CBD5E1";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);
  };

  useEffect(() => {
    drawPreview();
  }, [image, zoom, offsetX, offsetY, rotation, brightness, contrast, grayscale]);

  const handleApply = () => {
    drawPreview();
    const data = canvasRef.current?.toDataURL("image/png");
    if (data) onApply(data);
  };

  const reset = () => {
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    setRotation(0);
    setBrightness(100);
    setContrast(100);
    setGrayscale(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: "rgba(15,23,42,0.42)" }}>
      <div className="w-full max-w-5xl bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 24px 80px rgba(15,23,42,0.28)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #EEF2F7" }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#EFF6FF" }}>
              <SlidersHorizontal size={16} style={{ color: "#2563EB" }} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate" style={{ fontSize: "14px", fontWeight: 800, color: "#1E293B" }}>도면 편집</h3>
              <p className="truncate" style={{ fontSize: "11px", color: "#64748B" }}>{floorLabel} · {draft.fileName}</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 rounded-xl hover:bg-slate-100 transition-colors" style={{ color: "#64748B" }}>
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-0">
          <div className="p-5" style={{ background: "#F8FAFC" }}>
            <div className="rounded-xl overflow-hidden bg-white" style={{ border: "1px solid #E2E8F0" }}>
              <canvas ref={canvasRef} width={720} height={460} className="block w-full aspect-[72/46]" />
            </div>
          </div>

          <div className="p-5 flex flex-col gap-4" style={{ borderLeft: "1px solid #EEF2F7" }}>
            <div className="grid grid-cols-2 gap-2">
              <IconButton icon={RotateCcw} label="왼쪽 회전" onClick={() => setRotation((value) => (value + 270) % 360)} />
              <IconButton icon={RotateCw} label="오른쪽 회전" onClick={() => setRotation((value) => (value + 90) % 360)} />
              <IconButton icon={ZoomOut} label="축소" onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(1))))} />
              <IconButton icon={ZoomIn} label="확대" onClick={() => setZoom((value) => Math.min(2.5, Number((value + 0.1).toFixed(1))))} />
            </div>

            <EditorRange label="좌우 위치" value={offsetX} min={-360} max={360} onChange={setOffsetX} />
            <EditorRange label="상하 위치" value={offsetY} min={-230} max={230} onChange={setOffsetY} />
            <EditorRange label="밝기" value={brightness} min={60} max={150} onChange={setBrightness} suffix="%" />
            <EditorRange label="대비" value={contrast} min={60} max={160} onChange={setContrast} suffix="%" icon={Contrast} />
            <EditorRange label="흑백" value={grayscale} min={0} max={100} onChange={setGrayscale} suffix="%" />

            <div className="mt-auto flex items-center justify-between gap-2 pt-2">
              <button
                onClick={reset}
                className="px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors"
                style={{ fontSize: "12px", fontWeight: 700, color: "#64748B", border: "1px solid #E2E8F0" }}
              >
                초기화
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={onCancel}
                  className="px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors"
                  style={{ fontSize: "12px", fontWeight: 700, color: "#64748B", border: "1px solid #E2E8F0" }}
                >
                  취소
                </button>
                <button
                  onClick={handleApply}
                  className="px-4 py-2 rounded-xl text-white hover:opacity-90 transition-opacity"
                  style={{ fontSize: "12px", fontWeight: 800, background: "#2563EB" }}
                >
                  대시보드에 적용
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconButton({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex items-center justify-center gap-2 h-10 rounded-xl hover:bg-blue-50 transition-colors"
      style={{ border: "1px solid #DBEAFE", color: "#2563EB", background: "#F8FAFC", fontSize: "11px", fontWeight: 700 }}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}

function EditorRange({
  label,
  value,
  min,
  max,
  onChange,
  suffix = "",
  icon: Icon,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  suffix?: string;
  icon?: React.ElementType;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1.5" style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>
          {Icon && <Icon size={12} />}
          {label}
        </span>
        <span style={{ fontSize: "11px", color: "#94A3B8", fontWeight: 700 }}>{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
        style={{ accentColor: "#2563EB" }}
      />
    </div>
  );
}

function FloorCard({
  floor,
  mapData,
  isExpanded,
  onToggle,
  onUpdate,
  onDelete,
  onMapDelete,
  onMapEdit,
}: {
  floor: FloorConfig;
  mapData: string;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updated: FloorConfig) => void;
  onDelete: () => void;
  onMapDelete: () => void;
  onMapEdit: (source: string, fileName: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zoneCount = floor.zones ? floor.zones.split(",").filter((z) => z.trim()).length : 0;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #EEF2F7", background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#EFF6FF" }}>
          <Building2 size={13} style={{ color: "#2563EB" }} />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p style={{ fontSize: "12px", fontWeight: 700, color: "#1E293B" }}>{floor.label || floor.key || "새 층"}</p>
          <p style={{ fontSize: "10px", color: "#94A3B8" }}>
            구역 {zoneCount}개
            {mapData ? " · 도면 등록됨" : ""}
          </p>
        </div>
        <ChevronDown
          size={14}
          style={{ color: "#94A3B8", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}
        />
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
          style={{ color: "#CBD5E1" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#EF4444")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#CBD5E1")}
        >
          <Trash2 size={13} />
        </button>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 flex flex-col gap-3" style={{ borderTop: "1px solid #F1F5F9" }}>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <p style={{ fontSize: "10px", fontWeight: 700, color: "#64748B", marginBottom: "6px" }}>층 식별자 <span style={{ fontWeight: 400, color: "#CBD5E1" }}>Key</span></p>
              <input
                value={floor.key}
                onChange={(e) => onUpdate({ ...floor, key: e.target.value })}
                className="w-full px-3 py-2 rounded-xl outline-none"
                placeholder="1F"
                style={{ fontSize: "12px", border: "1.5px solid #E2E8F0", background: "#F8FAFC", color: "#334155" }}
              />
            </div>
            <div>
              <p style={{ fontSize: "10px", fontWeight: 700, color: "#64748B", marginBottom: "6px" }}>층 이름 <span style={{ fontWeight: 400, color: "#CBD5E1" }}>Label</span></p>
              <input
                value={floor.label}
                onChange={(e) => onUpdate({ ...floor, label: e.target.value })}
                className="w-full px-3 py-2 rounded-xl outline-none"
                placeholder="1층 (Floor 1)"
                style={{ fontSize: "12px", border: "1.5px solid #E2E8F0", background: "#F8FAFC", color: "#334155" }}
              />
            </div>
          </div>

          <div>
            <p style={{ fontSize: "10px", fontWeight: 700, color: "#64748B", marginBottom: "6px" }}>구역 목록 <span style={{ fontWeight: 400, color: "#CBD5E1" }}>Zone Names (쉼표로 구분)</span></p>
            <input
              value={floor.zones}
              onChange={(e) => onUpdate({ ...floor, zones: e.target.value })}
              className="w-full px-3 py-2 rounded-xl outline-none"
              placeholder="로비, 복도 A, 서버실, ..."
              style={{ fontSize: "12px", border: "1.5px solid #E2E8F0", background: "#F8FAFC", color: "#334155" }}
            />
          </div>

          <div className="rounded-xl p-3" style={{ background: "#F8FAFC", border: "1px solid #F1F5F9" }}>
            <div className="flex items-center gap-2 mb-2">
              <FileUp size={12} style={{ color: "#3B82F6" }} />
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#334155" }}>도면 업로드 <span style={{ fontWeight: 400, color: "#94A3B8" }}>Floor Plan</span></p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate" style={{ fontSize: "11px", color: floor.mapFileName ? "#64748B" : "#CBD5E1" }}>
                {floor.mapFileName || "파일을 선택하세요"}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const data = ev.target?.result;
                    if (typeof data === "string") onMapEdit(data, file.name, data);
                    e.target.value = "";
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl flex-shrink-0 hover:bg-blue-100 transition-colors"
                style={{ fontSize: "11px", fontWeight: 700, color: "#3B82F6", border: "1px solid #BFDBFE", background: "#EFF6FF" }}
              >
                업로드
              </button>
              {mapData && (
                <button
                  onClick={() => onMapEdit(mapData, floor.mapFileName || `${floor.key}-floor-plan.png`)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl flex-shrink-0 hover:bg-slate-100 transition-colors"
                  style={{ fontSize: "11px", fontWeight: 700, color: "#475569", border: "1px solid #CBD5E1", background: "white" }}
                >
                  편집
                </button>
              )}
              {mapData && (
                <button
                  onClick={() => { onUpdate({ ...floor, mapFileName: "" }); onMapDelete(); }}
                  className="px-2 py-1.5 rounded-xl flex-shrink-0 hover:bg-red-50 transition-colors"
                  style={{ fontSize: "11px", color: "#EF4444", border: "1px solid #FEE2E2" }}
                >
                  삭제
                </button>
              )}
            </div>
            <p className="mt-1.5" style={{ fontSize: "10px", color: "#94A3B8" }}>
              권장 비율 720:460 (약 1.57:1) · 권장 해상도 1440×920
            </p>
            {mapData && (
              <div className="mt-2 rounded-lg overflow-hidden" style={{ height: "72px", border: "1px solid #EEF2F7" }}>
                <img src={mapData} alt="floor plan preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
