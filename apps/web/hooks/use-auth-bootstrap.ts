"use client";

import { createContext, useContext } from "react";
import type { MeResponse } from "@/lib/auth-schemas";

type BootstrapStatus = "loading" | "authenticated" | "idle" | "error";

export interface BootstrapResult {
  status: BootstrapStatus;
  user?: MeResponse["user"];
  memberships?: MeResponse["memberships"];
  error?: string;
}

export const AuthBootstrapContext = createContext<BootstrapResult>({
  status: "loading",
});

export function useAuthBootstrap(): BootstrapResult {
  return useContext(AuthBootstrapContext);
}
