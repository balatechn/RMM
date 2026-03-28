"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import DeviceCard from "@/components/DeviceCard";
import AlertBanner from "@/components/AlertBanner";
import { api } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  Monitor,
  Wifi,
  WifiOff,
  Bell,
  Search,
  Plus,
  RefreshCw,
} from "lucide-react";

export default function DashboardPage() {
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [alertStats, setAlertStats] = useState({});
  const [filters, setFilters] = useState({ search: "", status: "" });
  const [loading, setLoading] = useState(true);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newDevice, setNewDevice] = useState({ name: "", hostname: "", location: "", department: "" });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [user, setUser] = useState(null);
  const router = useRouter();

  // Load user
  useEffect(() => {
    const stored = localStorage.getItem("rmm_user");
    if (!stored) return router.replace("/login");
    setUser(JSON.parse(stored));
  }, [router]);

  // WebSocket for real-time updates
  const onWsEvent = useCallback((event, data) => {
    if (event === "device:status") {
      setDevices((prev) =>
        prev.map((d) => (d.id === data.deviceId ? { ...d, status: data.status, last_seen: data.last_seen || d.last_seen } : d))
      );
    }
    if (event === "alert:new") {
      setAlerts((prev) => [data, ...prev].slice(0, 20));
      setAlertStats((prev) => ({
        ...prev,
        active: (parseInt(prev.active) || 0) + 1,
        critical_active: data.severity === "critical" ? (parseInt(prev.critical_active) || 0) + 1 : prev.critical_active,
      }));
    }
  }, []);

  useWebSocket(onWsEvent);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);

      const [devicesData, alertsData, statsData] = await Promise.all([
        api.get(`/devices?${params.toString()}`),
        api.get("/alerts?status=active&limit=20"),
        api.get("/alerts/stats"),
      ]);
      setDevices(devicesData);
      setAlerts(alertsData);
      setAlertStats(statsData);
    } catch (err) {
      if (err.status === 401) router.replace("/login");
    } finally {
      setLoading(false);
    }
  }, [filters, router]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const onlineCount = devices.filter((d) => d.status === "online").length;
  const offlineCount = devices.filter((d) => d.status === "offline").length;

  async function handleAddDevice(e) {
    e.preventDefault();
    try {
      const created = await api.post("/devices/register", newDevice);
      alert(`Device registered! API Key:\n${created.api_key}\n\nSave this — it won't be shown again.`);
      setShowAddDevice(false);
      setNewDevice({ name: "", hostname: "", location: "", department: "" });
      fetchData();
    } catch (err) {
      alert("Failed to add device: " + err.message);
    }
  }

  async function handleDeleteDevice() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/devices/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      alert("Failed to delete device: " + err.message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar user={user} />

      <main className="flex-1 pl-64">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchData}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
              {user?.role === "admin" && (
                <button
                  onClick={() => setShowAddDevice(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
                >
                  <Plus className="h-4 w-4" /> Add Device
                </button>
              )}
            </div>
          </div>

          {/* Alert Banner */}
          {alerts.length > 0 && <AlertBanner alerts={alerts} />}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard icon={Monitor} label="Total Devices" value={devices.length} color="blue" />
            <StatCard icon={Wifi} label="Online" value={onlineCount} color="green" />
            <StatCard icon={WifiOff} label="Offline" value={offlineCount} color="red" />
            <StatCard
              icon={Bell}
              label="Active Alerts"
              value={alertStats.active || 0}
              color={parseInt(alertStats.critical_active) > 0 ? "red" : "yellow"}
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search devices..."
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
          </div>

          {/* Device Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {devices.map((device) => (
              <DeviceCard key={device.id} device={device} onDelete={user?.role === "admin" ? setDeleteTarget : undefined} />
            ))}
            {devices.length === 0 && (
              <div className="col-span-full text-center py-16 text-slate-500">
                <Monitor className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No devices found. Register your first device to get started.</p>
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-sm space-y-4">
              <h2 className="text-lg font-semibold text-white">Remove Device</h2>
              <p className="text-slate-400">Are you sure you want to remove <span className="text-white font-medium">{deleteTarget.name || deleteTarget.hostname}</span>? This action cannot be undone.</p>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition">Cancel</button>
                <button onClick={handleDeleteDevice} className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">Remove</button>
              </div>
            </div>
          </div>
        )}

        {/* Add Device Modal */}
        {showAddDevice && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <form
              onSubmit={handleAddDevice}
              className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4"
            >
              <h2 className="text-lg font-semibold text-white">Register New Device</h2>
              <input type="text" placeholder="Device Name *" value={newDevice.name} onChange={(e) => setNewDevice((n) => ({ ...n, name: e.target.value }))} required className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="text" placeholder="Hostname" value={newDevice.hostname} onChange={(e) => setNewDevice((n) => ({ ...n, hostname: e.target.value }))} className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="text" placeholder="Location" value={newDevice.location} onChange={(e) => setNewDevice((n) => ({ ...n, location: e.target.value }))} className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="text" placeholder="Department" value={newDevice.department} onChange={(e) => setNewDevice((n) => ({ ...n, department: e.target.value }))} className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddDevice(false)} className="flex-1 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition">Cancel</button>
                <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">Register</button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: "text-blue-400 bg-blue-500/10",
    green: "text-green-400 bg-green-500/10",
    red: "text-red-400 bg-red-500/10",
    yellow: "text-yellow-400 bg-yellow-500/10",
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}
