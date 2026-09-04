/**
 * 관리자 웹 최상위 컴포넌트.
 *
 * 하는 일 세 가지:
 *  1) 로그인 여부 확인 → 미로그인이면 LoginPage, 로그인되면 사이드바+헤더+본문 레이아웃
 *  2) 서버에서 소화기/관리자 목록을 받아 전 화면이 공유하는 상태로 들고 있음
 *  3) 사이드바 메뉴(activePage)와 대시보드 내부 화면(지도 ↔ 상세)을 전환
 * 실시간 이벤트/알림은 useRealtimeEvents 훅이 SSE로 받아온다.
 */
import { useCallback, useEffect, useState } from "react";
import { LoginPage } from "./components/LoginPage";
import { Sidebar, SidebarPage } from "./components/Sidebar";
import { Header } from "./components/Header";
import { FloorMap } from "./components/FloorMap";
import { DeviceDetail } from "./components/DeviceDetail";
import { EventLog } from "./components/EventLog";
import { DeviceManagement } from "./components/DeviceManagement";
import { ManagersPage } from "./components/ManagersPage";
import { Alerts } from "./components/Alerts";
import { Reports } from "./components/Reports";
import { Settings } from "./components/Settings";
import { Device, Admin } from "./types";
import { useRealtimeEvents } from "./hooks/useRealtimeEvents";
import { AuthUser, canAccessAdmin, getCurrentUser, logout, authHeaders } from "./auth";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

// 대시보드 안에서만 쓰는 화면 구분 — 평면도 지도 ↔ 개별 소화기 상세
type InnerView = "map" | "detail";

// 서버 응답이 배열/{devices}/{data} 중 어떤 형태로 와도 목록으로 꺼내 쓴다.
async function fetchDevices(): Promise<Device[]> {
  const res = await fetch(`${API_BASE}/api/devices`, { headers: authHeaders() });
  if (!res.ok) throw new Error("devices fetch failed");
  const body = await res.json();
  return Array.isArray(body) ? body : (body.devices ?? body.data ?? []);
}

async function fetchAdmins(): Promise<Admin[]> {
  const res = await fetch(`${API_BASE}/api/admins`, { headers: authHeaders() });
  if (!res.ok) throw new Error("admins fetch failed");
  const body = await res.json();
  return Array.isArray(body) ? body : (body.admins ?? body.data ?? []);
}

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activePage, setActivePage] = useState<SidebarPage>("dashboard");
  const [innerView, setInnerView] = useState<InnerView>("map");
  const [previousPage, setPreviousPage] = useState<SidebarPage>("dashboard");
  const [devices, setDevices] = useState<Device[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  // 새로 등록됐지만 아직 평면도에 위치를 안 찍은 소화기 — 지도에서 배치 대기 표시용
  const [newDeviceIds, setNewDeviceIds] = useState<string[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const [deviceSearch, setDeviceSearch] = useState("");
  const [alertSearch, setAlertSearch] = useState("");
  const realtime = useRealtimeEvents(Boolean(authUser));

  // 소화기·관리자 목록을 동시에 요청. 한쪽이 실패해도 나머지는 반영한다(allSettled).
  const loadServerData = useCallback(async () => {
    const [devResult, admResult] = await Promise.allSettled([fetchDevices(), fetchAdmins()]);
    if (devResult.status === "fulfilled") setDevices(devResult.value);
    if (admResult.status === "fulfilled") setAdmins(admResult.value);
  }, []);

  // 새로고침해도 로그인이 유지되도록, 저장된 토큰으로 내 정보를 먼저 확인한다.
  // (mounted 플래그는 확인 도중 언마운트됐을 때 setState 하지 않으려는 가드)
  useEffect(() => {
    let mounted = true;

    getCurrentUser()
      .then((user) => {
        if (mounted && user && canAccessAdmin(user)) {
          setAuthUser(user);
        }
      })
      .catch(() => {
        if (mounted) setAuthUser(null);
      })
      .finally(() => {
        if (mounted) setAuthLoading(false);
      });

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (authUser) loadServerData();
  }, [authUser, loadServerData]);

  // 실시간 이벤트가 들어오면 해당 소화기 상태를 목록에서 즉시 갱신 —
  // 목록을 다시 받아오지 않아도 지도/상세의 색이 바로 바뀐다.
  useEffect(() => {
    const latest = realtime.events[0];
    if (!latest || latest.extinguisherId == null || !latest.deviceStatus) return;
    setDevices((prev) =>
      prev.map((d) => (d.extinguisher_id === latest.extinguisherId ? { ...d, status: latest.deviceStatus! } : d)),
    );
  }, [realtime.events]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="text-sm font-semibold">세션을 확인하는 중입니다...</div>
      </div>
    );
  }

  if (!authUser) {
    return <LoginPage onLogin={setAuthUser} />;
  }

  // 사이드바 이동 — 검색어/선택 상태를 초기화해 이전 화면 흔적이 남지 않게 한다.
  const handleNavigate = (page: SidebarPage) => {
    setActivePage(page);
    setInnerView("map");
    setSelectedDevice(null);
    setDeviceSearch("");
    setAlertSearch("");
  };

  // 헤더 통합 검색: "AL-"로 시작하면 알림 화면, 소화기 ID가 정확히 맞으면 그 상세로,
  // 둘 다 아니면 소화기 관리 화면에서 검색어로 필터링.
  const handleSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    if (/^AL-/i.test(trimmed)) {
      setAlertSearch(trimmed);
      setActivePage("alerts");
      setInnerView("map");
      setSelectedDevice(null);
      return;
    }

    const device = devices.find((d) => d.id.toLowerCase() === trimmed.toLowerCase());
    if (device) {
      setTransitioning(true);
      setTimeout(() => {
        setPreviousPage(activePage);
        setSelectedDevice(device);
        setActivePage("dashboard");
        setInnerView("detail");
        setTransitioning(false);
      }, 180);
      return;
    }

    setDeviceSearch(trimmed);
    setActivePage("devices");
    setInnerView("map");
    setSelectedDevice(null);
  };

  const handleLogout = async () => {
    await logout().catch(() => undefined);
    setAuthUser(null);
    setActivePage("dashboard");
    setInnerView("map");
    setSelectedDevice(null);
  };

  // 지도 → 상세 전환. 180ms 페이드아웃(transitioning) 뒤에 내용을 바꿔 화면이 튀지 않게 한다.
  const handleSelectDevice = (device: Device) => {
    setTransitioning(true);
    setTimeout(() => {
      setPreviousPage("dashboard");
      setSelectedDevice(device);
      setInnerView("detail");
      setTransitioning(false);
    }, 180);
  };

  const handleSelectDeviceFromManagement = (device: Device) => {
    setTransitioning(true);
    setTimeout(() => {
      setPreviousPage("devices");
      setSelectedDevice(device);
      setActivePage("dashboard");
      setInnerView("detail");
      setTransitioning(false);
    }, 180);
  };

  const handleUpdateDevice = (updated: Device) => {
    setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    setSelectedDevice(updated);
  };

  // 상세에서 뒤로 — 어디서 들어왔든(previousPage) 그 화면으로 되돌아간다.
  const handleBack = () => {
    setTransitioning(true);
    setTimeout(() => {
      setSelectedDevice(null);
      setInnerView("map");
      setActivePage(previousPage);
      setTransitioning(false);
    }, 180);
  };

  // 평면도에서 아이콘을 옮겼을 때: 화면은 즉시 반영하고 좌표는 서버에 비동기로 저장.
  // 저장 실패는 무시한다 — 다음 목록 로드 때 서버 값으로 되돌아온다.
  const handlePositionChange = (deviceId: string, x: number, y: number) => {
    setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, x_coord: x, y_coord: y } : d)));
    setNewDeviceIds((prev) => prev.filter((id) => id !== deviceId));

    const device = devices.find((d) => d.id === deviceId);
    if (device?.extinguisher_id) {
      fetch(`${API_BASE}/api/devices/${device.extinguisher_id}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ x_coord: x, y_coord: y }),
      }).catch(() => {});
    }
  };

  const handleDeviceAdded = (deviceId: string) => {
    setNewDeviceIds((prev) => [...prev, deviceId]);
  };

  const handleLocationSaved = (deviceIds: string[]) => {
    setNewDeviceIds((prev) => prev.filter((id) => !deviceIds.includes(id)));
  };

  const showBack = activePage === "dashboard" && innerView === "detail";
  const headerPage = activePage;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#F4F6F9" }}>
      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        user={authUser}
        alertCount={realtime.alerts.filter((a) => a.status === "active").length}
        devices={devices}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          activePage={headerPage}
          showBack={showBack}
          onBack={handleBack}
          onNavigate={handleNavigate}
          onSearch={handleSearch}
          alerts={realtime.alerts}
          devices={devices}
          deviceId={selectedDevice?.id}
        />

        <div className="flex flex-1 overflow-hidden min-h-0">
          {activePage === "dashboard" && (
            <>
              <div
                className="flex-1 min-w-0 overflow-hidden flex flex-col transition-opacity duration-200"
                style={{ opacity: transitioning ? 0 : 1 }}
              >
                {innerView === "map" ? (
                  <FloorMap
                    devices={devices}
                    onSelectDevice={handleSelectDevice}
                    onPositionChange={handlePositionChange}
                    newDeviceIds={newDeviceIds}
                    onLocationSaved={handleLocationSaved}
                  />
                ) : selectedDevice ? (
                  <DeviceDetail device={selectedDevice} onUpdateDevice={handleUpdateDevice} alerts={realtime.alerts} />
                ) : null}
              </div>
              <EventLog entries={realtime.events} status={realtime.status} error={realtime.error} />
            </>
          )}

          {activePage === "devices" && (
            <DeviceManagement
              devices={devices}
              setDevices={setDevices}
              admins={admins}
              setAdmins={setAdmins}
              externalSearch={deviceSearch}
              onSelectDevice={handleSelectDeviceFromManagement}
              onDeviceAdded={handleDeviceAdded}
              currentRole={authUser.role}
            />
          )}

          {activePage === "alerts" && (
            <Alerts
              alerts={realtime.alerts}
              status={realtime.status}
              error={realtime.error}
              onRefresh={realtime.refresh}
              onResolve={realtime.resolveAlert}
              externalSearch={alertSearch}
              currentRole={authUser.role}
            />
          )}

          {activePage === "managers" && (
            <ManagersPage admins={admins} setAdmins={setAdmins} currentUser={authUser} />
          )}
          {activePage === "reports" && (
            <Reports
              devices={devices}
              alerts={realtime.alerts}
              onNavigate={handleNavigate}
            />
          )}
          {activePage === "settings" && <Settings />}
        </div>
      </div>
    </div>
  );
}
