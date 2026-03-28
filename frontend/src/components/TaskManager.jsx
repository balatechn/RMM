"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, RefreshCw, XCircle, ArrowUpDown } from "lucide-react";

export default function TaskManager({ deviceId, emit, on, agentConnected }) {
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("cpu");
  const [sortDir, setSortDir] = useState("desc");

  const fetchProcesses = useCallback(() => {
    if (!agentConnected) return;
    setLoading(true);
    emit("processes:get", { deviceId });
  }, [deviceId, emit, agentConnected]);

  useEffect(() => {
    on("processes:result", (data) => {
      setProcesses(data.processes || []);
      setLoading(false);
    });
  }, [on]);

  useEffect(() => {
    fetchProcesses();
    const interval = setInterval(fetchProcesses, 10000);
    return () => clearInterval(interval);
  }, [fetchProcesses]);

  function handleKill(pid, name) {
    if (!confirm(`Kill process "${name}" (PID: ${pid})?`)) return;
    emit("process:kill", { deviceId, pid });
    setTimeout(fetchProcesses, 1000);
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = processes
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") return mul * a.name.localeCompare(b.name);
      return mul * ((a[sortKey] || 0) - (b[sortKey] || 0));
    });

  const totalCpu = processes.reduce((s, p) => s + (p.cpu || 0), 0);
  const totalMem = processes.reduce((s, p) => s + (p.memoryBytes || 0), 0);

  function SortHeader({ label, field, className = "" }) {
    return (
      <th
        className={`py-2.5 px-3 cursor-pointer hover:text-slate-200 select-none ${className}`}
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center gap-1">
          {label}
          {sortKey === field && (
            <ArrowUpDown className="h-3 w-3 text-blue-400" />
          )}
        </div>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Processes:</span>
          <span className="text-sm font-semibold text-white">{processes.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">CPU Total:</span>
          <span className="text-sm font-semibold text-white">{totalCpu.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Memory:</span>
          <span className="text-sm font-semibold text-white">{(totalMem / (1024 * 1024 * 1024)).toFixed(1)} GB</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search processes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={fetchProcesses}
          disabled={!agentConnected || loading}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg text-sm transition"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-900 z-10">
              <tr className="text-slate-400 border-b border-slate-800 text-left">
                <SortHeader label="Name" field="name" />
                <SortHeader label="PID" field="pid" className="text-right" />
                <SortHeader label="CPU %" field="cpu" className="text-right" />
                <SortHeader label="Memory MB" field="memory" className="text-right" />
                <th className="py-2.5 px-3 text-right">User</th>
                <th className="py-2.5 px-3 text-right">Status</th>
                <th className="py-2.5 px-3 text-center w-16">Kill</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((proc) => (
                <tr key={proc.pid} className="border-b border-slate-800/50 text-slate-300 hover:bg-slate-800/50">
                  <td className="py-2 px-3 font-medium">{proc.name}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-500">{proc.pid}</td>
                  <td className="py-2 px-3 text-right">
                    <span className={proc.cpu > 50 ? "text-red-400 font-semibold" : proc.cpu > 20 ? "text-yellow-400" : ""}>
                      {proc.cpu?.toFixed(1)}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">{proc.memory?.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right text-slate-500">{proc.user || "—"}</td>
                  <td className="py-2 px-3 text-right">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${proc.status === "running" ? "bg-green-500/10 text-green-400" : "bg-slate-700 text-slate-400"}`}>
                      {proc.status || "—"}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button
                      onClick={() => handleKill(proc.pid, proc.name)}
                      className="p-1 text-slate-600 hover:text-red-400 transition"
                      title="Kill process"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500">
                    {!agentConnected ? "Agent offline" : loading ? "Loading processes..." : "No processes found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
