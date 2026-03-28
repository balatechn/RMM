"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:4000";

export function useDeviceSocket(deviceId) {
  const socketRef = useRef(null);
  const [agentConnected, setAgentConnected] = useState(false);
  const listenersRef = useRef({});

  useEffect(() => {
    const token = localStorage.getItem("rmm_token");
    if (!token || !deviceId) return;

    const socket = io(WS_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("subscribe:device", deviceId);
      socket.emit("agent:status", { deviceId });
    });

    socket.on("agent:status", (data) => {
      if (data.deviceId === deviceId) setAgentConnected(data.connected);
    });

    socket.on("agent:connected", (data) => {
      if (data.deviceId === deviceId) setAgentConnected(true);
    });

    socket.on("agent:disconnected", (data) => {
      if (data.deviceId === deviceId) setAgentConnected(false);
    });

    // Forward all events to registered listeners
    const events = [
      "metric", "device:status", "cmd:output", "cmd:done", "cmd:error",
      "processes:result", "sysinfo:result", "services:result", "software:result",
    ];
    events.forEach((event) => {
      socket.on(event, (data) => {
        const fn = listenersRef.current[event];
        if (fn) fn(data);
      });
    });

    return () => {
      socket.emit("unsubscribe:device", deviceId);
      socket.disconnect();
    };
  }, [deviceId]);

  const on = useCallback((event, fn) => {
    listenersRef.current[event] = fn;
  }, []);

  const emit = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  return { socket: socketRef, agentConnected, on, emit };
}
