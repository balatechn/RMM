"use client";

import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";

export default function AlertBanner({ alerts }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !alerts || alerts.length === 0) return null;

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;

  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
        <div>
          <span className="text-sm font-medium text-red-300">
            {alerts.length} active alert{alerts.length !== 1 ? "s" : ""}
          </span>
          {criticalCount > 0 && (
            <span className="ml-2 text-xs text-red-400">
              ({criticalCount} critical)
            </span>
          )}
          <span className="ml-2 text-xs text-red-400/70">
            Latest: {alerts[0]?.message}
          </span>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 text-red-400 hover:bg-red-500/20 rounded transition"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
