import { useSyncExternalStore } from 'react';

export type AppThemeId = 'orbit' | 'light' | 'black';

export type AppTheme = {
  id: AppThemeId;
  background: string;
  surface: string;
  raisedSurface: string;
  input: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  border: string;
  buttonText: string;
  statusBar: 'light' | 'dark';
};

const THEMES: Record<AppThemeId, AppTheme> = {
  orbit: {
    id: 'orbit',
    background: '#060a1c',
    surface: 'rgba(13,18,40,0.9)',
    raisedSurface: 'rgba(13,18,40,0.76)',
    input: 'rgba(4,8,20,0.8)',
    text: '#f4f3ff',
    muted: '#a5aec4',
    accent: '#6366f1',
    accentText: '#c4b5fd',
    border: 'rgba(148,163,184,0.24)',
    buttonText: '#ffffff',
    statusBar: 'light',
  },
  light: {
    id: 'light',
    background: '#f3f5fb',
    surface: '#ffffff',
    raisedSurface: '#e8ecf5',
    input: '#f8f9fd',
    text: '#192033',
    muted: '#59647a',
    accent: '#6253d8',
    accentText: '#5143c3',
    border: '#cbd2e1',
    buttonText: '#ffffff',
    statusBar: 'dark',
  },
  black: {
    id: 'black',
    background: '#000000',
    surface: '#0c0c0f',
    raisedSurface: '#151519',
    input: '#08080a',
    text: '#f5f5f7',
    muted: '#a1a1aa',
    accent: '#7c6cff',
    accentText: '#c4b5fd',
    border: '#303038',
    buttonText: '#ffffff',
    statusBar: 'light',
  },
};

let activeThemeId: AppThemeId = 'orbit';
const listeners = new Set<() => void>();

export function getAppTheme(id: AppThemeId = activeThemeId): AppTheme {
  return THEMES[id];
}

export function setAppTheme(id: AppThemeId): void {
  if (activeThemeId === id) return;
  activeThemeId = id;
  listeners.forEach((listener) => listener());
}

export function subscribeAppTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppTheme(): AppTheme {
  return useSyncExternalStore(
    subscribeAppTheme,
    () => getAppTheme(),
    () => getAppTheme()
  );
}

export function isAppThemeId(value: unknown): value is AppThemeId {
  return value === 'orbit' || value === 'light' || value === 'black';
}
