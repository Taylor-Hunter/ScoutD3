import { useCallback, useEffect, useState } from 'react';

// Persistent application-level preferences exposed on the Settings page.
// Stored in localStorage so the choices survive a refresh, and exposed
// through both a React hook (for components that should re-render when
// the value changes) and a plain getter (for one-shot reads inside
// mutation handlers).

export type AppSettings = {
  defaultSport: string;
  reportFormat: 'Detailed (Recommended)' | 'Summary' | 'Custom';
  autoRefresh: boolean;
};

const STORAGE_KEY = 'scoutd3.appSettings';
const SETTINGS_EVENT = 'scoutd3:app-settings-changed';

const DEFAULTS: AppSettings = {
  defaultSport: 'Basketball',
  reportFormat: 'Detailed (Recommended)',
  autoRefresh: true,
};

const readFromStorage = (): AppSettings => {
  if (typeof window === 'undefined') {
    return { ...DEFAULTS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULTS };
    }
    const parsed = JSON.parse(raw);
    return {
      defaultSport:
        typeof parsed.defaultSport === 'string' && parsed.defaultSport.trim()
          ? parsed.defaultSport
          : DEFAULTS.defaultSport,
      reportFormat:
        parsed.reportFormat === 'Summary' ||
        parsed.reportFormat === 'Custom' ||
        parsed.reportFormat === 'Detailed (Recommended)'
          ? parsed.reportFormat
          : DEFAULTS.reportFormat,
      autoRefresh:
        typeof parsed.autoRefresh === 'boolean' ? parsed.autoRefresh : DEFAULTS.autoRefresh,
    };
  } catch {
    return { ...DEFAULTS };
  }
};

const writeToStorage = (next: AppSettings) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota or privacy mode -- preferences just won't persist.
  }
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next }));
};

export const getStoredAppSettings = (): AppSettings => readFromStorage();

export const useAppSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(() => readFromStorage());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const onChange = () => setSettings(readFromStorage());
    window.addEventListener(SETTINGS_EVENT, onChange as EventListener);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, onChange as EventListener);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeToStorage(next);
      return next;
    });
  }, []);

  return { settings, update };
};

// Helper: the React Query refetchInterval value to use, given a default,
// while honoring the user's "Automatically refresh" preference.
export const refetchIntervalFor = (
  baseMs: number,
  autoRefresh: boolean
): number | false => (autoRefresh ? baseMs : false);

export default useAppSettings;
