"use client";

import { useCallback, useRef } from "react";
import { IdempotencyKeyState } from "@/lib/idempotency-key";

export function useStableIdempotencyKey() {
  const stateRef = useRef<IdempotencyKeyState | null>(null);
  stateRef.current ??= new IdempotencyKeyState();

  const getKey = useCallback((): string => {
    return stateRef.current!.get();
  }, []);

  const resetKey = useCallback((): void => {
    stateRef.current!.reset();
  }, []);

  return {
    getKey,
    resetKey,
  };
}
