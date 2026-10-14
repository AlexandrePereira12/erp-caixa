import { useSyncExternalStore } from "react";

/** Preferência de tema: "system" segue o sistema operacional (sem `data-theme` no <html>). */
export type ThemePreference = "light" | "dark" | "system";

const KEY = "pdv-theme";
const listeners = new Set<() => void>();

function isPreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(KEY);
    return isPreference(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

/** Aplica no <html>. O public/theme-init.js faz o mesmo antes da primeira pintura. */
export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, preference);
  } catch {
    /* sem armazenamento (janela privativa): vale só até recarregar */
  }
  applyThemePreference(preference);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // outra aba mudou o tema
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) {
      applyThemePreference(readThemePreference());
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readThemePreference, () => "system" as const);
}
