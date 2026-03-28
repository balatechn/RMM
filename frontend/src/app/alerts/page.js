"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { api } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  Bell,
  AlertTriangle,
  CheckCircle,
  Eye,
  Filter,
} from "lucide-react";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({});
  const [filter, setFilter] = useState({ status: "", severity: "" });
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("rmm_user");
    if (!stored) return router.replace("/login");
    setUser(JSON.parse(stored));
  }, [router]);

  const fetchAlerts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter.status) params.set("status", filter.status);
      if (filter.severity) params.set("severity", filter.severity);
      params.set("limit", "100");

      const [alertsData, statsData] = await Promise.all([
        api.get(`/alerts?${params.toString()}`),
        api.get("/alerts/stats"),
      ]);
      setAlerts(alertsData);
      setStats(statsData);
    } catch (err) {
      if (err.status === 401) router.replace("/login");
    }
  }, [filter, router]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Real-time new alerts
  const onWsEvent = useCallback((event, data) => {
    if (event === "alert:new") {
      setAlerts((prev) => [data, ...prev]);
      setStats((prev) => ({
        ...prev,
        active: (parseInt(prev.active) || 0) + 1,
      }));
    }
  }, []);

  useWebSocket(onWsEvent);

  async function handleAcknowledge(id) {
    try {
      await api.put(`/alerts/${id}/acknowledge`);
      fetchAlerts();
    } catch (err) {
      alert("Failed: " + err.message);
    }
  }

  async function handleResolve(id) {
    try {
      await api.put(`/alerts/${id}/resolve`);
      fetchAlerts();
    } catch (err) {
      alert("Failed: " + err.message);
    }
  }

  const severityColors = {
    critical: "bg-red-500/10 text-red-400 border-red-500/30",
    warning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  };

  const statusColors = {
    active: "bg-red-500/20 text-red-300",
    acknowledged: "bg-yellow-500/20 text-yellow-300",
    resolved: "bg-green-500/20 text-green-300",
  };

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar user={user} />
      <main className="flex-1 pl-64">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Bell className="h-6 w-6" /> Alerts
            </h1>
          </div>

          {/* Stats Bar */}
          <div className="flex gap-4">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 text-red-400 text-sm font-medium">
              {stats.active || 0} Active
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2 text-yellow-400 text-sm font-medium">
              {stats.acknowledged || 0} Acknowledged
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2 text-green-400 text-sm font-medium">
              {stats.resolved || 0} Resolved
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4">
            <Filter className="h-4 w-4 text-slate-500" />
            <select
              value={filter.status}
              onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
              className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
            <select
              value={filter.severity}
              onChange={(e) => setFilter((f) => ({ ...f, severity: e.target.value }))}
              className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Severity</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
            </select>
          </div>

          {/* Alert List */}
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`border rounded-xl p-4 ${severityColors[alert.severity]}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">{alert.message}</p>
                      <p className="text-xs opacity-70 mt-1">
                        Device: {alert.device_name} • Type: {alert.type} •{" "}
                        {new Date(alert.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[alert.status]}`}>
                      {alert.status}
                    </span>
                    {alert.status === "active" && (
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        className="p-1.5 hover:bg-white/10 rounded transition"
                        title="Acknowledge"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    {alert.status !== "resolved" && (
                      <button
                        onClick={() => handleResolve(alert.id)}
                        className="p-1.5 hover:bg-white/10 rounded transition"
                        title="Resolve"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {alerts.length === 0 && (
              <div className="text-center py-16 text-slate-500">
                <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No alerts found</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
