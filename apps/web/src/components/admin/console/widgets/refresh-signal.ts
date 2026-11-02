"use client";

import { useSyncExternalStore } from "react";

// Studio keeps page filters, filter-widget selections and cross-filters in report state. The
// console bumps this whenever that state changes, and boreal's widgets query again on it.

let version = 0;
const listeners = new Set<() => void>();

export const refreshSignal = {
  bump() {
    version++;
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const useRefreshSignal = () => useSyncExternalStore(refreshSignal.subscribe, () => version, () => 0);
