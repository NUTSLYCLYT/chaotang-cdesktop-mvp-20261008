import { useSyncExternalStore } from 'react';

export type ChaotangSceneTone = 'ink' | 'balanced' | 'vivid';

export interface ChaotangAppearanceSettings {
  backgroundIntensity: number;
  immersiveMode: boolean;
  reducedMotion: boolean;
  sceneTone: ChaotangSceneTone;
}

const STORAGE_KEY = 'chaotang:appearance:v1';
const DEFAULT_SETTINGS: ChaotangAppearanceSettings = {
  backgroundIntensity: 90,
  immersiveMode: true,
  reducedMotion: false,
  sceneTone: 'balanced',
};

let settings = loadSettings();
const listeners = new Set<() => void>();

function loadSettings(): ChaotangAppearanceSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? '{}'
    ) as Partial<ChaotangAppearanceSettings>;
    return {
      backgroundIntensity:
        typeof parsed.backgroundIntensity === 'number'
          ? Math.min(100, Math.max(0, parsed.backgroundIntensity))
          : DEFAULT_SETTINGS.backgroundIntensity,
      immersiveMode:
        typeof parsed.immersiveMode === 'boolean'
          ? parsed.immersiveMode
          : DEFAULT_SETTINGS.immersiveMode,
      reducedMotion:
        typeof parsed.reducedMotion === 'boolean'
          ? parsed.reducedMotion
          : DEFAULT_SETTINGS.reducedMotion,
      sceneTone: ['ink', 'balanced', 'vivid'].includes(parsed.sceneTone ?? '')
        ? parsed.sceneTone!
        : DEFAULT_SETTINGS.sceneTone,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

function persist(next: ChaotangAppearanceSettings) {
  settings = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The in-memory preference still applies when local storage is unavailable.
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChaotangAppearance() {
  const value = useSyncExternalStore(
    subscribe,
    () => settings,
    () => DEFAULT_SETTINGS
  );

  return {
    settings: value,
    update(patch: Partial<ChaotangAppearanceSettings>) {
      persist({ ...settings, ...patch });
    },
    reset() {
      persist(DEFAULT_SETTINGS);
    },
  };
}
