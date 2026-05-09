"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "bm_annual_goal_kd";
const CUSTOM_EVENT = "bm:annual-goal-changed";
export const DEFAULT_ANNUAL_GOAL = 50_000;

function readStored(): number {
  if (typeof window === "undefined") return DEFAULT_ANNUAL_GOAL;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_ANNUAL_GOAL;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ANNUAL_GOAL;
}

function subscribe(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CUSTOM_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CUSTOM_EVENT, callback);
  };
}

export function useAnnualGoal() {
  const goal = useSyncExternalStore(
    subscribe,
    readStored,
    () => DEFAULT_ANNUAL_GOAL,
  );

  const setGoal = useCallback((value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    window.localStorage.setItem(STORAGE_KEY, String(Math.round(value)));
    window.dispatchEvent(new Event(CUSTOM_EVENT));
  }, []);

  return { goal, setGoal, monthly: Math.round(goal / 12) };
}
