"use client";

import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:4000";

export function useWebSocket(onEvent, subscribeDeviceId) {
  const socketRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("rmm_token");
    if (!token) return;

    const socket = io(WS_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      if (subscribeDeviceId) {
        socket.emit("subscribe:device", subscribeDeviceId);
      }
    });

    socket.on("metric", (data) => onEvent("metric", data));
    socket.on("device:status", (data) => onEvent("device:status", data));
    socket.on("alert:new", (data) => onEvent("alert:new", data));

    return () => {
      if (subscribeDeviceId) {
        socket.emit("unsubscribe:device", subscribeDeviceId);
      }
      socket.disconnect();
    };
  }, [onEvent, subscribeDeviceId]);

  return socketRef;
}
