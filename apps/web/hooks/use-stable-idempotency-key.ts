"use client";

import { useCallback, useRef } from "react";

export function useStableIdempotencyKey() {
  const keyRef = useRef<string | null>(null);

  const getKey = useCallback((): string => {
    if (!keyRef.current) {
      keyRef.current = crypto.randomUUID();
    }

    return keyRef.current;
  }, []);

  const resetKey = useCallback((): void => {
    keyRef.current = null;
  }, []);

  return {
    getKey,
    resetKey,
  };
}
