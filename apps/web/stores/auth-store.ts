"use client";

import { create } from "zustand";

interface AuthStore {
  accessToken: string | null;
  savedOrgId: string | null;
  setAccessToken: (token: string | null) => void;
  setSavedOrgId: (orgId: string | null) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  accessToken: null,
  savedOrgId: null,
  setAccessToken: (token) => set({ accessToken: token }),
  setSavedOrgId: (orgId) => set({ savedOrgId: orgId }),
  clearAuth: () => set({ accessToken: null, savedOrgId: null }),
}));
