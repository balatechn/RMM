"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import MetricsChart from "@/components/MetricsChart";
import StatusBadge from "@/components/StatusBadge";
import TaskManager from "@/components/TaskManager";
import DeviceManager from "@/components/DeviceManager";
import { api } from "@/lib/api";
import { useDeviceSocket } from "@/hooks/useDeviceSocket";
import {
  ArrowLeft,
  Cpu,
  MemoryStick,
  HardDrive,
  Clock,
  Activity,
  TerminalSquare,
  ListTodo,
  Settings,
  BarChart3,
} from "lucide-react";

const RemoteTerminal = dynamic(() => import("@/components/RemoteTerminal"), { ssr: false });

const TABS = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "tasks", label: "Task Manager", icon: ListTodo },
  { id: "device", label: "Device Manager", icon: Settings },
];

export default function DeviceDetailPage() {
  const { deviceId } = useParams();
  const router = useRouter();
  const [device, setDevice] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [latest, setLatest] = useState(null);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const { agentConnected, on, emit } = useDeviceSocket(deviceId);

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

  useEffect(() => {
    on("metric", (data) => {
      if (data.deviceId === deviceId) {
        setLatest(data);
        setMetrics((prev) => [...prev.slice(-59), data]);
      }
    });
    on("device:status", (data) => {
      if (data.deviceId === deviceId) {
        setDevice((d) => (d ? { ...d, status: data.status } : d));
      }
    });
  }, [on, deviceId]);

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
          <div className="flex items-center justify-between">
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
                  {device.os_info || "Unknown OS"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${agentConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
              <span className="text-xs text-slate-400">
                {agentConnected ? "Agent Live" : "Agent Offline"}
              </span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-1 bg-slate-900/50 border border-slate-800 rounded-xl p-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === tab.id
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {latest && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                  <GaugeCard
                    icon={Cpu} label="CPU" value={latest.cpu_usage} unit="%"
                    color={latest.cpu_usage > 85 ? "red" : latest.cpu_usage > 60 ? "yellow" : "green"}
                  />
                  <GaugeCard
                    icon={MemoryStick} label="RAM" value={latest.ram_usage} unit="%"
                    subtitle={`${formatBytes(latest.ram_used)} / ${formatBytes(latest.ram_total)}`}
                    color={latest.ram_usage > 90 ? "red" : latest.ram_usage > 70 ? "yellow" : "green"}
                  />
                  <GaugeCard
                    icon={HardDrive} label="Disk" value={latest.disk_usage} unit="%"
                    subtitle={`${formatBytes(latest.disk_used)} / ${formatBytes(latest.disk_total)}`}
                    color={latest.disk_usage > 90 ? "red" : latest.disk_usage > 75 ? "yellow" : "green"}
                  />
                  <GaugeCard icon={Clock} label="Uptime" value={formatUptime(latest.uptime)} unit="" color="blue" />
                  <GaugeCard icon={Activity} label="Processes" value={latest.process_count || 0} unit="" color="blue" />
                </div>
              )}

              {metrics.length > 0 && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <MetricsChart data={metrics} dataKey="cpu_usage" label="CPU Usage %" color="#3b82f6" />
                  <MetricsChart data={metrics} dataKey="ram_usage" label="RAM Usage %" color="#8b5cf6" />
                  <MetricsChart data={metrics} dataKey="disk_usage" label="Disk Usage %" color="#f59e0b" />
                </div>
              )}

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
          )}

          {activeTab === "terminal" && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5" style={{ minHeight: 520 }}>
              <RemoteTerminal deviceId={deviceId} emit={emit} on={on} agentConnected={agentConnected} />
            </div>
          )}

          {activeTab === "tasks" && (
            <TaskManager deviceId={deviceId} emit={emit} on={on} agentConnected={agentConnected} />
          )}

          {activeTab === "device" && (
            <DeviceManager deviceId={deviceId} emit={emit} on={on} agentConnected={agentConnected} />
          )}
        </div>
      </main>
    </div>
  );
}

function GaugeCard({ icon: Icon, label, value, unit, subtitle, color }) {
  const colors = {
    green: "text-green-400 bg-green-500/10",
    yellow: "text-yellow-400 bg-yellow-500/10",
    red: "text-red-400 bg-red-500/10",
    blue: "text-blue-400 bg-blue-500/10",
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-slate-400">{label}</p>
          <p className="text-xl font-bold text-white">
            {typeof value === "number" ? value.toFixed(1) : value}
            <span className="text-sm font-normal text-slate-400 ml-0.5">{unit}</span>
          </p>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
