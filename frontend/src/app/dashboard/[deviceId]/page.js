"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MetricsChart from "@/components/MetricsChart";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  ArrowLeft,
  Cpu,
  MemoryStick,
  HardDrive,
  Clock,
  Activity,
} from "lucide-react";

export default function DeviceDetailPage() {
  const { deviceId } = useParams();
  const router = useRouter();
  const [device, setDevice] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [latest, setLatest] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem("rmm_user");
    if (!stored) return router.replace("/login");
    setUser(JSON.parse(stored));
  }, [router]);

  const fetchDevice = useCallback(async () => {
    try {
      const [deviceData, metricsData] = await Promise.all([
        api.get(`/devices/${deviceId}`),
        api.get(`/metrics/${deviceId}?limit=60`),
      ]);
      setDevice(deviceData);
      setMetrics(metricsData.reverse());
      if (metricsData.length > 0) setLatest(metricsData[0]);
    } catch (err) {
      if (err.status === 401) router.replace("/login");
    }
  }, [deviceId, router]);

  useEffect(() => {
    fetchDevice();
  }, [fetchDevice]);

  // Real-time metric updates
  const onWsEvent = useCallback(
    (event, data) => {
      if (event === "metric" && data.deviceId === deviceId) {
        setLatest(data);
        setMetrics((prev) => [...prev.slice(-59), data]);
      }
      if (event === "device:status" && data.deviceId === deviceId) {
        setDevice((d) => (d ? { ...d, status: data.status } : d));
      }
    },
    [deviceId]
  );

  useWebSocket(onWsEvent, deviceId);

  if (!device) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  function formatUptime(seconds) {
    if (!seconds) return "N/A";
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  }

  function formatBytes(bytes) {
    if (!bytes) return "N/A";
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar user={user} />
      <main className="flex-1 pl-64">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                {device.name}
                <StatusBadge status={device.status} />
              </h1>
              <p className="text-slate-400 text-sm">
                {device.hostname} • {device.ip_address || "No IP"} •{" "}
                {device.location || "No location"} •{" "}
                {device.department || "No department"}
              </p>
            </div>
          </div>

          {/* Live Stats */}
          {latest && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <GaugeCard
                icon={Cpu}
                label="CPU"
                value={latest.cpu_usage}
                unit="%"
                color={latest.cpu_usage > 85 ? "red" : latest.cpu_usage > 60 ? "yellow" : "green"}
              />
              <GaugeCard
                icon={MemoryStick}
                label="RAM"
                value={latest.ram_usage}
                unit="%"
                subtitle={`${formatBytes(latest.ram_used)} / ${formatBytes(latest.ram_total)}`}
                color={latest.ram_usage > 90 ? "red" : latest.ram_usage > 70 ? "yellow" : "green"}
              />
              <GaugeCard
                icon={HardDrive}
                label="Disk"
                value={latest.disk_usage}
                unit="%"
                subtitle={`${formatBytes(latest.disk_used)} / ${formatBytes(latest.disk_total)}`}
                color={latest.disk_usage > 90 ? "red" : latest.disk_usage > 75 ? "yellow" : "green"}
              />
              <GaugeCard icon={Clock} label="Uptime" value={formatUptime(latest.uptime)} unit="" color="blue" />
              <GaugeCard icon={Activity} label="Processes" value={latest.process_count || 0} unit="" color="blue" />
            </div>
          )}

          {/* Charts */}
          {metrics.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <MetricsChart data={metrics} dataKey="cpu_usage" label="CPU Usage %" color="#3b82f6" />
              <MetricsChart data={metrics} dataKey="ram_usage" label="RAM Usage %" color="#8b5cf6" />
              <MetricsChart data={metrics} dataKey="disk_usage" label="Disk Usage %" color="#f59e0b" />
            </div>
          )}

          {/* Top Processes */}
          {latest?.top_processes && latest.top_processes.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-white mb-4">Top Processes</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-800">
                      <th className="text-left py-2 px-3">Name</th>
                      <th className="text-right py-2 px-3">CPU %</th>
                      <th className="text-right py-2 px-3">Memory MB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latest.top_processes.slice(0, 10).map((proc, i) => (
                      <tr key={i} className="border-b border-slate-800/50 text-slate-300">
                        <td className="py-2 px-3">{proc.name}</td>
                        <td className="text-right py-2 px-3">{proc.cpu?.toFixed(1)}</td>
                        <td className="text-right py-2 px-3">{proc.memory?.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function GaugeCard({ icon: Icon, label, value, unit, subtitle, color }) {
  const colorMap = {
    green: "text-green-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
    blue: "text-blue-400",
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 text-slate-400 mb-2">
        <Icon className="h-4 w-4" />
        <span className="text-sm">{label}</span>
      </div>
      <p className={`text-3xl font-bold ${colorMap[color]}`}>
        {typeof value === "number" ? value.toFixed(1) : value}
        <span className="text-lg">{unit}</span>
      </p>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  );
}
