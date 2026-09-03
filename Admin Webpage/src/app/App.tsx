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

type InnerView = "map" | "detail";

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
  const [newDeviceIds, setNewDeviceIds] = useState<string[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const [deviceSearch, setDeviceSearch] = useState("");
  const [alertSearch, setAlertSearch] = useState("");
  const realtime = useRealtimeEvents(Boolean(authUser));

  const loadServerData = useCallback(async () => {
    const [devResult, admResult] = await Promise.allSettled([fetchDevices(), fetchAdmins()]);
    if (devResult.status === "fulfilled") setDevices(devResult.value);
    if (admResult.status === "fulfilled") setAdmins(admResult.value);
  }, []);

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

  const handleNavigate = (page: SidebarPage) => {
    setActivePage(page);
    setInnerView("map");
    setSelectedDevice(null);
    setDeviceSearch("");
    setAlertSearch("");
  };

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

  const handleBack = () => {
    setTransitioning(true);
    setTimeout(() => {
      setSelectedDevice(null);
      setInnerView("map");
      setActivePage(previousPage);
      setTransitioning(false);
    }, 180);
  };

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
