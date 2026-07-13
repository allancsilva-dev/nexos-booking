"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppointmentChangedEventSchema } from "@nexos/shared";
import { io, type Socket } from "socket.io-client";

import { useAuthBootstrap, useInvalidateSession } from "@/hooks/use-auth-bootstrap";
import { refreshAccessToken } from "@/lib/session-refresh";
import { useAuthStore } from "@/stores/auth-store";
import { invalidateAppointmentEvent } from "./query-invalidation";

function socketUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "development" ? "http://localhost:3001" : null;
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { status } = useAuthBootstrap();
  const accessToken = useAuthStore((state) => state.accessToken);
  const organizationId = useAuthStore((state) => state.savedOrgId);
  const invalidateSession = useInvalidateSession();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const url = socketUrl();
    if (status !== "authenticated" || !accessToken || !organizationId || !url) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    let stopped = false;
    let refreshAttempted = false;
    let serverReconnectAttempted = false;
    const socket = io(`${url.replace(/\/$/, "")}/appointments`, {
      auth: { token: accessToken },
      autoConnect: false,
      transports: ["websocket", "polling"],
      reconnection: true,
    });
    socketRef.current?.disconnect();
    socketRef.current = socket;

    socket.on("appointment.changed", (payload: unknown) => {
      const parsed = AppointmentChangedEventSchema.safeParse(payload);
      if (!parsed.success) {
        console.warn("Ignored invalid appointment.changed event");
        return;
      }
      invalidateAppointmentEvent(queryClient, organizationId, parsed.data);
    });

    socket.on("connect", () => {
      refreshAttempted = false;
      serverReconnectAttempted = false;
    });

    socket.on("connect_error", async (error) => {
      const code = (error as Error & { data?: { code?: string } }).data?.code;
      if (code === "TOKEN_EXPIRED" && !refreshAttempted) {
        refreshAttempted = true;
        const refresh = await refreshAccessToken();
        if (!stopped && refresh.token) {
          socket.auth = { token: refresh.token };
          socket.connect();
          return;
        }
      }
      if (code === "UNAUTHORIZED" || code === "TOKEN_EXPIRED") {
        socket.disconnect();
        invalidateSession();
      }
    });

    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect" && !stopped && !serverReconnectAttempted) {
        serverReconnectAttempted = true;
        setTimeout(() => {
          if (!stopped && useAuthStore.getState().accessToken) socket.connect();
        }, 100);
      }
    });

    socket.connect();
    return () => {
      stopped = true;
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [accessToken, invalidateSession, organizationId, queryClient, status]);

  return children;
}
