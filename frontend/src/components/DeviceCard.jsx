"use client";

import Link from "next/link";
import StatusBadge from "./StatusBadge";
import { Cpu, MemoryStick, HardDrive, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function DeviceCard({ device }) {
  const [latest, setLatest] = useState(null);

  useEffect(() => {
    api.get(`/metrics/${device.id}/latest`).then(setLatest).catch(() => {});
  }, [device.id]);

  const lastSeen = device.last_seen
    ? new Date(device.last_seen).toLocaleString()
    : "Never";

  return (
    <Link href={`/dashboard/${device.id}`}>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-600 transition-colors cursor-pointer group">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors">
              {device.name}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {device.hostname || device.ip_address || "—"}
            </p>
          </div>
          <StatusBadge status={device.status} />
        </div>

        {latest ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <MiniStat icon={Cpu} label="CPU" value={`${latest.cpu_usage?.toFixed(1)}%`} warn={latest.cpu_usage > 85} />
            <MiniStat icon={MemoryStick} label="RAM" value={`${latest.ram_usage?.toFixed(1)}%`} warn={latest.ram_usage > 90} />
            <MiniStat icon={HardDrive} label="Disk" value={`${latest.disk_usage?.toFixed(1)}%`} warn={latest.disk_usage > 90} />
            <MiniStat icon={Clock} label="Seen" value={lastSeen.split(",")[1]?.trim() || lastSeen} />
          </div>
        ) : (
          <p className="text-xs text-slate-600">No metrics yet</p>
        )}

        {(device.location || device.department) && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-slate-800">
            {device.location && (
              <span className="px-2 py-0.5 bg-slate-800 rounded text-xs text-slate-400">
                {device.location}
              </span>
            )}
            {device.department && (
              <span className="px-2 py-0.5 bg-slate-800 rounded text-xs text-slate-400">
                {device.department}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

function MiniStat({ icon: Icon, label, value, warn }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-3.5 w-3.5 ${warn ? "text-red-400" : "text-slate-500"}`} />
      <span className="text-slate-500">{label}</span>
      <span className={`ml-auto font-medium ${warn ? "text-red-400" : "text-slate-300"}`}>
        {value}
      </span>
    </div>
  );
}
