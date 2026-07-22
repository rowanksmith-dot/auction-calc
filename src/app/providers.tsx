"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store/store";

/**
 * AppProviders — mounted once in root layout.
 * Handles Zustand hydration and any global wrappers.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  // Hydrate the Zustand store on mount
  const hydrated = useAppStore.persist?.hasHydrated?.() ?? true;

  useEffect(() => {
    // If the store uses persist middleware, ensure hydration
    useAppStore.persist?.rehydrate?.();
  }, []);

  return <>{children}</>;
}
