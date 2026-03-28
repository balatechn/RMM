"use client";

import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw, FolderOpen, FileText, HardDrive, ChevronRight,
  ArrowLeft, ArrowRight, Search, Monitor,
} from "lucide-react";

function formatSize(bytes) {
  if (!bytes || bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i > 1 ? 2 : 0)} ${units[i]}`;
}

function getFileExtension(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.substring(dot + 1).toLowerCase() : "";
}

function FileIcon({ item }) {
  if (item.type === "drive") return <HardDrive className="h-5 w-5 text-blue-400 shrink-0" />;
  if (item.type === "folder") return <FolderOpen className="h-5 w-5 text-yellow-400 shrink-0" />;
  return <FileText className="h-5 w-5 text-slate-400 shrink-0" />;
}

export default function FileManager({ deviceId, emit, on, agentConnected }) {
  const [items, setItems] = useState([]);
  const [currentPath, setCurrentPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [sortKey, setSortKey] = useState("name");
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    on("files:result", (data) => {
      setItems(data.items || []);
      setError(data.error || null);
      setLoading(false);
      if (!data.error && data.path !== undefined) {
        setCurrentPath(data.path || "");
      }
    });
  }, [on]);

  const navigate = useCallback(
    (path) => {
      if (!agentConnected) return;
      setLoading(true);
      setSearch("");
      setError(null);
      emit("files:list", { deviceId, path: path || "" });

      // Update history
      setHistory((prev) => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push(path || "");
        return newHistory;
      });
      setHistoryIndex((prev) => prev + 1);
    },
    [deviceId, emit, agentConnected, historyIndex]
  );

  const refresh = useCallback(() => {
    if (!agentConnected) return;
    setLoading(true);
    setError(null);
    emit("files:list", { deviceId, path: currentPath });
  }, [deviceId, emit, agentConnected, currentPath]);

  useEffect(() => {
    if (agentConnected) {
      navigate("");
    }
  }, [agentConnected]);

  const goBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const path = history[newIndex];
      setLoading(true);
      setSearch("");
      emit("files:list", { deviceId, path: path || "" });
    }
  };

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const path = history[newIndex];
      setLoading(true);
      setSearch("");
      emit("files:list", { deviceId, path: path || "" });
    }
  };

  const goUp = () => {
    if (!currentPath) return;
    // Go to parent directory
    const parts = currentPath.replace(/[\\/]+$/, "").split(/[\\/]/);
    if (parts.length <= 1) {
      navigate(""); // Go to drives
    } else {
      parts.pop();
      let parent = parts.join("\\");
      if (parent.length === 2 && parent[1] === ":") parent += "\\";
      navigate(parent);
    }
  };

  const handleItemClick = (item) => {
    if (item.type === "drive" || item.type === "folder") {
      navigate(item.path);
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  // Build breadcrumb segments
  const breadcrumbs = [];
  if (currentPath) {
    const parts = currentPath.split(/[\\/]/).filter(Boolean);
    let accumulated = "";
    for (let i = 0; i < parts.length; i++) {
      accumulated += (i === 0 ? "" : "\\") + parts[i];
      if (i === 0 && parts[i].endsWith(":")) accumulated += "\\";
      breadcrumbs.push({ label: parts[i], path: accumulated });
    }
  }

  // Filter & sort
  const filtered = items.filter((item) =>
    !search || item.name.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    // Drives and folders always first
    if (a.type !== b.type) {
      const order = { drive: 0, folder: 1, file: 2 };
      return (order[a.type] || 2) - (order[b.type] || 2);
    }
    let cmp = 0;
    if (sortKey === "name") cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    else if (sortKey === "size") cmp = (a.size || 0) - (b.size || 0);
    else if (sortKey === "modified") cmp = (a.modified || "").localeCompare(b.modified || "");
    else if (sortKey === "type") {
      const extA = a.type === "folder" ? "" : getFileExtension(a.name);
      const extB = b.type === "folder" ? "" : getFileExtension(b.name);
      cmp = extA.localeCompare(extB);
    }
    return sortAsc ? cmp : -cmp;
  });

  if (!agentConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <Monitor className="h-12 w-12 mb-3 opacity-50" />
        <p>Agent is offline. File Manager requires a live connection.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900/80">
        <button
          onClick={goBack}
          disabled={historyIndex <= 0}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-30 disabled:cursor-not-allowed"
          title="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          onClick={goForward}
          disabled={historyIndex >= history.length - 1}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-30 disabled:cursor-not-allowed"
          title="Forward"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          onClick={goUp}
          disabled={!currentPath}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-30 disabled:cursor-not-allowed"
          title="Up"
        >
          <span className="text-sm font-bold">↑</span>
        </button>
        <button
          onClick={refresh}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 ml-2 flex-1 min-w-0 overflow-x-auto text-sm">
          <button
            onClick={() => navigate("")}
            className="text-slate-400 hover:text-white shrink-0 flex items-center gap-1"
          >
            <Monitor className="h-3.5 w-3.5" />
          </button>
          {breadcrumbs.map((bc, i) => (
            <span key={i} className="flex items-center gap-1 shrink-0">
              <ChevronRight className="h-3 w-3 text-slate-600" />
              <button
                onClick={() => navigate(bc.path)}
                className="text-slate-400 hover:text-white whitespace-nowrap"
              >
                {bc.label}
              </button>
            </span>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-48 shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Info bar */}
      <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-800/50">
        Total : {sorted.length}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 text-sm text-red-400 bg-red-500/10 border-b border-red-500/20">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 340px)" }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-900 z-10">
            <tr className="text-slate-400 border-b border-slate-800">
              <th
                className="text-left py-2.5 px-4 cursor-pointer hover:text-white transition select-none"
                onClick={() => handleSort("name")}
              >
                Name {sortKey === "name" && (sortAsc ? "↑" : "↓")}
              </th>
              <th
                className="text-left py-2.5 px-4 w-28 cursor-pointer hover:text-white transition select-none"
                onClick={() => handleSort("type")}
              >
                Type {sortKey === "type" && (sortAsc ? "↑" : "↓")}
              </th>
              <th
                className="text-right py-2.5 px-4 w-32 cursor-pointer hover:text-white transition select-none"
                onClick={() => handleSort("size")}
              >
                Size {sortKey === "size" && (sortAsc ? "↑" : "↓")}
              </th>
              <th
                className="text-left py-2.5 px-4 w-48 cursor-pointer hover:text-white transition select-none"
                onClick={() => handleSort("modified")}
              >
                Date Modified {sortKey === "modified" && (sortAsc ? "↑" : "↓")}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-16 text-slate-500">
                  <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin opacity-50" />
                  Loading...
                </td>
              </tr>
            )}
            {!loading && sorted.length === 0 && !error && (
              <tr>
                <td colSpan={4} className="text-center py-16 text-slate-500">
                  <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  {search ? "No matching items" : "Empty folder"}
                </td>
              </tr>
            )}
            {sorted.map((item, i) => (
              <tr
                key={i}
                className={`border-b border-slate-800/30 text-slate-300 transition ${
                  item.type === "drive" || item.type === "folder"
                    ? "hover:bg-slate-800/60 cursor-pointer"
                    : "hover:bg-slate-800/30"
                } ${item.restricted ? "opacity-50" : ""}`}
                onDoubleClick={() => handleItemClick(item)}
                onClick={() => handleItemClick(item)}
              >
                <td className="py-2 px-4">
                  <div className="flex items-center gap-2.5">
                    <FileIcon item={item} />
                    <span className="truncate">{item.name}</span>
                    {item.restricted && (
                      <span className="text-xs text-red-400/70 ml-1">restricted</span>
                    )}
                  </div>
                </td>
                <td className="py-2 px-4 text-slate-500">
                  {item.type === "drive" ? "Drive" : item.type === "folder" ? "Folder" : getFileExtension(item.name).toUpperCase() || "File"}
                </td>
                <td className="py-2 px-4 text-right text-slate-500">
                  {item.type === "drive"
                    ? formatSize(item.size)
                    : item.type === "folder"
                    ? "—"
                    : formatSize(item.size)}
                </td>
                <td className="py-2 px-4 text-slate-500">
                  {item.modified || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
