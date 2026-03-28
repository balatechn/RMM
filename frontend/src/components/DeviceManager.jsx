"use client";

import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw, Cpu, MemoryStick, HardDrive, Network, Search,
  Play, Square, RotateCw, Package, Server, Monitor, UserCog,
  Lock, Unlock, ShieldCheck, User,
} from "lucide-react";

export default function DeviceManager({ deviceId, emit, on, agentConnected }) {
  const [tab, setTab] = useState("system");
  const [sysinfo, setSysinfo] = useState(null);
  const [services, setServices] = useState([]);
  const [software, setSoftware] = useState([]);
  const [deviceUsers, setDeviceUsers] = useState([]);
  const [loading, setLoading] = useState({});
  const [serviceSearch, setServiceSearch] = useState("");
  const [softwareSearch, setSoftwareSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [actionToast, setActionToast] = useState(null);

  useEffect(() => {
    on("sysinfo:result", (data) => {
      setSysinfo(data);
      setLoading((l) => ({ ...l, sysinfo: false }));
    });
    on("services:result", (data) => {
      setServices(data.services || []);
      setLoading((l) => ({ ...l, services: false }));
    });
    on("software:result", (data) => {
      setSoftware(data.software || []);
      setLoading((l) => ({ ...l, software: false }));
    });
    on("users:result", (data) => {
      setDeviceUsers(data.users || []);
      setLoading((l) => ({ ...l, users: false }));
    });
    on("user:action:result", (data) => {
      const msg = data.success
        ? `User '${data.username}' ${data.action === "lock" ? "locked" : "unlocked"}`
        : `Failed: ${data.error || "Unknown error"}`;
      setActionToast({ msg, type: data.success ? "success" : "error" });
      setTimeout(() => setActionToast(null), 3000);
      // Refresh user list after action
      if (data.success) {
        setTimeout(() => emit("users:get", { deviceId }), 500);
      }
    });
  }, [on, deviceId, emit]);

  const fetchSysinfo = useCallback(() => {
    if (!agentConnected) return;
    setLoading((l) => ({ ...l, sysinfo: true }));
    emit("sysinfo:get", { deviceId });
  }, [deviceId, emit, agentConnected]);

  const fetchServices = useCallback(() => {
    if (!agentConnected) return;
    setLoading((l) => ({ ...l, services: true }));
    emit("services:get", { deviceId });
  }, [deviceId, emit, agentConnected]);

  const fetchSoftware = useCallback(() => {
    if (!agentConnected) return;
    setLoading((l) => ({ ...l, software: true }));
    emit("software:get", { deviceId });
  }, [deviceId, emit, agentConnected]);

  const fetchUsers = useCallback(() => {
    if (!agentConnected) return;
    setLoading((l) => ({ ...l, users: true }));
    emit("users:get", { deviceId });
  }, [deviceId, emit, agentConnected]);

  useEffect(() => {
    if (tab === "system") fetchSysinfo();
    if (tab === "services") fetchServices();
    if (tab === "software") fetchSoftware();
    if (tab === "users") fetchUsers();
  }, [tab, fetchSysinfo, fetchServices, fetchSoftware, fetchUsers]);

  function handleServiceAction(name, action) {
    emit("service:action", { deviceId, serviceName: name, action });
    setTimeout(fetchServices, 2000);
  }

  const filteredServices = services
    .filter((s) => {
      const matchSearch =
        s.name.toLowerCase().includes(serviceSearch.toLowerCase()) ||
        s.displayName.toLowerCase().includes(serviceSearch.toLowerCase());
      const matchFilter = !serviceFilter || s.status === serviceFilter;
      return matchSearch && matchFilter;
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const filteredSoftware = software.filter(
    (s) =>
      s.name.toLowerCase().includes(softwareSearch.toLowerCase()) ||
      s.publisher?.toLowerCase().includes(softwareSearch.toLowerCase())
  );

  const tabs = [
    { id: "system", label: "System Info", icon: Monitor },
    { id: "services", label: "Services", icon: Server },
    { id: "software", label: "Installed Software", icon: Package },
    { id: "users", label: "Users", icon: UserCog },
  ];

  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition ${
              tab === t.id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* System Info Tab */}
      {tab === "system" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={fetchSysinfo}
              disabled={!agentConnected || loading.sysinfo}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg text-sm transition"
            >
              <RefreshCw className={`h-4 w-4 ${loading.sysinfo ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {sysinfo ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* General Info */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-blue-400" /> General
                </h3>
                <dl className="space-y-2 text-sm">
                  {[
                    ["Hostname", sysinfo.hostname],
                    ["OS", sysinfo.os],
                    ["Version", sysinfo.os_version],
                    ["Architecture", sysinfo.architecture],
                    ["Processor", sysinfo.processor],
                    ["Boot Time", sysinfo.boot_time],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <dt className="text-slate-400">{k}</dt>
                      <dd className="text-white font-medium text-right max-w-[60%] truncate" title={v}>{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* CPU & Memory */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-purple-400" /> CPU & Memory
                </h3>
                <dl className="space-y-2 text-sm">
                  {[
                    ["Physical Cores", sysinfo.cpu_count_physical],
                    ["Logical Cores", sysinfo.cpu_count_logical],
                    ["CPU Frequency", sysinfo.cpu_freq ? `${sysinfo.cpu_freq} MHz` : null],
                    ["Total RAM", sysinfo.ram_total_gb ? `${sysinfo.ram_total_gb} GB` : null],
                    ["Available RAM", sysinfo.ram_available_gb ? `${sysinfo.ram_available_gb} GB` : null],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <dt className="text-slate-400">{k}</dt>
                      <dd className="text-white font-medium">{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Disks */}
              {sysinfo.disks && sysinfo.disks.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-yellow-400" /> Disk Partitions
                  </h3>
                  <div className="space-y-3">
                    {sysinfo.disks.map((d) => (
                      <div key={d.mountpoint} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-300 font-medium">{d.device} ({d.fstype})</span>
                          <span className="text-slate-400">{d.used_gb} / {d.total_gb} GB</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${d.percent > 90 ? "bg-red-500" : d.percent > 75 ? "bg-yellow-500" : "bg-blue-500"}`}
                            style={{ width: `${d.percent}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Network */}
              {sysinfo.network && sysinfo.network.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <Network className="h-4 w-4 text-green-400" /> Network Interfaces
                  </h3>
                  <div className="space-y-2 text-sm">
                    {sysinfo.network.filter((n) => n.ip).map((n) => (
                      <div key={n.name} className="flex items-center justify-between py-1 border-b border-slate-800/50 last:border-0">
                        <div>
                          <span className="text-white font-medium">{n.name}</span>
                          <span className="text-slate-500 ml-2 text-xs">{n.mac}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-300 font-mono text-xs">{n.ip}</span>
                          <span className={`h-2 w-2 rounded-full ${n.is_up ? "bg-green-500" : "bg-red-500"}`} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              {!agentConnected ? "Agent offline" : loading.sysinfo ? "Loading system info..." : "No data"}
            </div>
          )}
        </div>
      )}

      {/* Services Tab */}
      {tab === "services" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search services..."
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="Running">Running</option>
              <option value="Stopped">Stopped</option>
            </select>
            <button
              onClick={fetchServices}
              disabled={!agentConnected || loading.services}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg text-sm transition"
            >
              <RefreshCw className={`h-4 w-4 ${loading.services ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="text-xs text-slate-500 px-1">{filteredServices.length} services</div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="text-slate-400 border-b border-slate-800 text-left">
                    <th className="py-2.5 px-3">Service Name</th>
                    <th className="py-2.5 px-3">Display Name</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Start Type</th>
                    <th className="py-2.5 px-3 text-center w-32">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServices.map((svc) => (
                    <tr key={svc.name} className="border-b border-slate-800/50 text-slate-300 hover:bg-slate-800/50">
                      <td className="py-2 px-3 font-mono text-xs">{svc.name}</td>
                      <td className="py-2 px-3">{svc.displayName}</td>
                      <td className="py-2 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          svc.status === "Running" ? "bg-green-500/10 text-green-400" : "bg-slate-700 text-slate-400"
                        }`}>
                          {svc.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-500 text-xs">{svc.startType}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center justify-center gap-1">
                          {svc.status !== "Running" && (
                            <button
                              onClick={() => handleServiceAction(svc.name, "start")}
                              className="p-1 text-slate-500 hover:text-green-400 transition" title="Start"
                            >
                              <Play className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {svc.status === "Running" && (
                            <>
                              <button
                                onClick={() => handleServiceAction(svc.name, "stop")}
                                className="p-1 text-slate-500 hover:text-red-400 transition" title="Stop"
                              >
                                <Square className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleServiceAction(svc.name, "restart")}
                                className="p-1 text-slate-500 hover:text-yellow-400 transition" title="Restart"
                              >
                                <RotateCw className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredServices.length === 0 && (
                    <tr><td colSpan="5" className="py-8 text-center text-slate-500">
                      {!agentConnected ? "Agent offline" : loading.services ? "Loading..." : "No services found"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Software Tab */}
      {tab === "software" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search software..."
                value={softwareSearch}
                onChange={(e) => setSoftwareSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={fetchSoftware}
              disabled={!agentConnected || loading.software}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg text-sm transition"
            >
              <RefreshCw className={`h-4 w-4 ${loading.software ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="text-xs text-slate-500 px-1">{filteredSoftware.length} programs installed</div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="text-slate-400 border-b border-slate-800 text-left">
                    <th className="py-2.5 px-3">Name</th>
                    <th className="py-2.5 px-3">Version</th>
                    <th className="py-2.5 px-3">Publisher</th>
                    <th className="py-2.5 px-3">Install Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSoftware.map((sw, i) => (
                    <tr key={i} className="border-b border-slate-800/50 text-slate-300 hover:bg-slate-800/50">
                      <td className="py-2 px-3 font-medium">{sw.name}</td>
                      <td className="py-2 px-3 text-slate-400">{sw.version || "—"}</td>
                      <td className="py-2 px-3 text-slate-500">{sw.publisher || "—"}</td>
                      <td className="py-2 px-3 text-slate-500 text-xs">{sw.installDate || "—"}</td>
                    </tr>
                  ))}
                  {filteredSoftware.length === 0 && (
                    <tr><td colSpan="4" className="py-8 text-center text-slate-500">
                      {!agentConnected ? "Agent offline" : loading.software ? "Loading..." : "No software found"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search users..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={fetchUsers}
              disabled={!agentConnected || loading.users}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg text-sm transition"
            >
              <RefreshCw className={`h-4 w-4 ${loading.users ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          <div className="text-xs text-slate-500 px-1">
            {deviceUsers.filter((u) => u.name.toLowerCase().includes(userSearch.toLowerCase())).length} users
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="text-slate-400 border-b border-slate-800 text-left">
                    <th className="py-2.5 px-3">User</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Last Logon</th>
                    <th className="py-2.5 px-3">Password Set</th>
                    <th className="py-2.5 px-3 text-center w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deviceUsers
                    .filter((u) => u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
                      u.description?.toLowerCase().includes(userSearch.toLowerCase()))
                    .map((u) => (
                      <tr key={u.name} className="border-b border-slate-800/50 text-slate-300 hover:bg-slate-800/50">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                              u.isAdmin ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"
                            }`}>
                              {u.name[0]?.toUpperCase()}
                            </div>
                            <div>
                              <span className="text-white font-medium">{u.name}</span>
                              {u.description && (
                                <p className="text-xs text-slate-500 truncate max-w-[200px]">{u.description}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            u.enabled
                              ? "bg-green-500/10 text-green-400"
                              : "bg-red-500/10 text-red-400"
                          }`}>
                            {u.enabled ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                            {u.enabled ? "Active" : "Locked"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            u.isAdmin ? "bg-red-500/10 text-red-400" : "bg-slate-700 text-slate-400"
                          }`}>
                            {u.isAdmin ? <ShieldCheck className="h-3 w-3" /> : <User className="h-3 w-3" />}
                            {u.isAdmin ? "Admin" : "User"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 text-xs">{u.lastLogon || "Never"}</td>
                        <td className="py-2.5 px-3 text-slate-500 text-xs">{u.passwordLastSet || "—"}</td>
                        <td className="py-2.5 px-3 text-center">
                          {u.enabled ? (
                            <button
                              onClick={() => emit("user:lock", { deviceId, username: u.name })}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition"
                              title="Lock user"
                            >
                              <Lock className="h-3 w-3" />
                              Lock
                            </button>
                          ) : (
                            <button
                              onClick={() => emit("user:unlock", { deviceId, username: u.name })}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 rounded-lg transition"
                              title="Unlock user"
                            >
                              <Unlock className="h-3 w-3" />
                              Unlock
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  {deviceUsers.filter((u) => u.name.toLowerCase().includes(userSearch.toLowerCase())).length === 0 && (
                    <tr><td colSpan="6" className="py-8 text-center text-slate-500">
                      {!agentConnected ? "Agent offline" : loading.users ? "Loading..." : "No users found"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Action Toast */}
      {actionToast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium shadow-lg z-50 ${
          actionToast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {actionToast.msg}
        </div>
      )}
    </div>
  );
}
