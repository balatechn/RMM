"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Bell,
  LogOut,
  Monitor,
  Shield,
  Download,
  Users,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/alerts", icon: Bell, label: "Alerts" },
  { href: "/users", icon: Users, label: "Users", adminOnly: true },
];

export default function Sidebar({ user }) {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    localStorage.removeItem("rmm_token");
    localStorage.removeItem("rmm_user");
    router.push("/login");
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-slate-900 border-r border-slate-800 flex flex-col z-40">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
        <Monitor className="h-7 w-7 text-blue-500" />
        <span className="text-lg font-bold text-white">RMM System</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems
          .filter((item) => !item.adminOnly || user?.role === "admin")
          .map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Agent Download */}
      <div className="px-3 pb-2">
        <button
          onClick={() => {
            const token = localStorage.getItem("rmm_token");
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            const a = document.createElement("a");
            a.href = `${apiUrl}/api/agent/download?token=${encodeURIComponent(token)}`;
            a.download = "rmm-agent.exe";
            a.click();
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
        >
          <Download className="h-5 w-5" />
          Download Agent
        </button>
      </div>

      {/* User Section */}
      <div className="px-4 py-4 border-t border-slate-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">
              {user?.username?.[0]?.toUpperCase() || "U"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.username}</p>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Shield className="h-3 w-3" />
              {user?.role}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
