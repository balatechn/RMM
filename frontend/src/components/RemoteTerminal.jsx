"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

let cssLoaded = false;

export default function RemoteTerminal({ deviceId, emit, on, agentConnected }) {
  const termRef = useRef(null);
  const xtermRef = useRef(null);
  const fitRef = useRef(null);
  const [input, setInput] = useState("");
  const cmdCountRef = useRef(0);

  useEffect(() => {
    // Load xterm CSS dynamically
    if (!cssLoaded && typeof document !== "undefined") {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cdn.jsdelivr.net/npm/@xterm/xterm@5/css/xterm.min.css";
      document.head.appendChild(link);
      cssLoaded = true;
    }

    if (!termRef.current) return;

    const term = new XTerminal({
      theme: {
        background: "#0f172a",
        foreground: "#e2e8f0",
        cursor: "#3b82f6",
        cursorAccent: "#0f172a",
        selectionBackground: "#334155",
        black: "#0f172a",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e2e8f0",
      },
      fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      convertEol: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termRef.current);
    fit.fit();

    xtermRef.current = term;
    fitRef.current = fit;

    term.writeln("\x1b[1;34m╔══════════════════════════════════════════╗\x1b[0m");
    term.writeln("\x1b[1;34m║\x1b[0m   \x1b[1;37mRMM Remote Terminal\x1b[0m                   \x1b[1;34m║\x1b[0m");
    term.writeln("\x1b[1;34m╚══════════════════════════════════════════╝\x1b[0m");
    term.writeln("");

    if (agentConnected) {
      term.writeln("\x1b[32m● Agent connected. Type commands below.\x1b[0m\n");
    } else {
      term.writeln("\x1b[31m● Agent offline. Commands will queue until reconnection.\x1b[0m\n");
    }

    const handleResize = () => fit.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      term.dispose();
    };
  }, []);

  // Update connection status message
  useEffect(() => {
    if (!xtermRef.current) return;
    // We register listeners that won't be stale
  }, [agentConnected]);

  // Listen for command output and done events
  useEffect(() => {
    on("cmd:output", (data) => {
      if (xtermRef.current) {
        xtermRef.current.write(data.data || "");
      }
    });

    on("cmd:done", (data) => {
      if (xtermRef.current) {
        const code = data.exitCode ?? 0;
        if (code !== 0) {
          xtermRef.current.writeln(`\r\n\x1b[31mProcess exited with code ${code}\x1b[0m`);
        }
        xtermRef.current.writeln("");
      }
    });

    on("cmd:error", (data) => {
      if (xtermRef.current) {
        xtermRef.current.writeln(`\r\n\x1b[31mError: ${data.error}\x1b[0m\r\n`);
      }
    });
  }, [on]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim()) return;

    const cmdId = `cmd_${Date.now()}_${cmdCountRef.current++}`;

    if (xtermRef.current) {
      xtermRef.current.writeln(`\x1b[1;36m❯\x1b[0m \x1b[1;37m${input}\x1b[0m`);
    }

    emit("cmd:exec", { deviceId, command: input, cmdId });
    setInput("");
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <div className={`h-2.5 w-2.5 rounded-full ${agentConnected ? "bg-green-500" : "bg-red-500"}`} />
        <span className="text-xs text-slate-400">
          {agentConnected ? "Agent connected" : "Agent offline"}
        </span>
      </div>

      <div ref={termRef} className="flex-1 rounded-lg overflow-hidden border border-slate-800" style={{ minHeight: 400 }} />

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <div className="flex-1 flex items-center bg-slate-900 border border-slate-700 rounded-lg px-3 focus-within:ring-2 focus-within:ring-blue-500">
          <span className="text-blue-400 mr-2 font-mono text-sm">❯</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={agentConnected ? "Type a command..." : "Agent offline..."}
            disabled={!agentConnected}
            className="flex-1 py-2.5 bg-transparent text-white font-mono text-sm placeholder-slate-500 focus:outline-none"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={!agentConnected || !input.trim()}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition"
        >
          Run
        </button>
      </form>
    </div>
  );
}
