import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAppThemeId, setAppTheme, type AppThemeId } from './theme';
import { isAppLanguage, setAppLanguage, type AppLanguage } from './i18n';

const PREFERENCES_KEY = 'orbit_room_mobile_preferences';

export type AppPreferences = {
  silentMode: boolean;
  volume: number;
  cameraFacing: 'user' | 'environment';
  theme: AppThemeId;
  language: AppLanguage;
};

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  silentMode: false,
  volume: 1,
  cameraFacing: 'user',
  theme: 'orbit',
  language: 'pt-BR',
};
const preferenceListeners = new Set<(preferences: AppPreferences) => void>();

function isAppPreferences(value: unknown): value is AppPreferences {
  return (
    typeof value === 'object' &&
    value !== null &&
    'silentMode' in value &&
    typeof value.silentMode === 'boolean' &&
    (!('volume' in value) ||
      (typeof value.volume === 'number' &&
        Number.isFinite(value.volume) &&
        value.volume >= 0 &&
        value.volume <= 1)) &&
    (!('cameraFacing' in value) ||
      value.cameraFacing === 'user' ||
      value.cameraFacing === 'environment') &&
    (!('theme' in value) || isAppThemeId(value.theme)) &&
    (!('language' in value) || isAppLanguage(value.language))
  );
}

export async function loadAppPreferences(): Promise<AppPreferences> {
  const stored = await AsyncStorage.getItem(PREFERENCES_KEY);
  if (stored === null) {
    setAppTheme(DEFAULT_APP_PREFERENCES.theme);
    setAppLanguage(DEFAULT_APP_PREFERENCES.language);
    return DEFAULT_APP_PREFERENCES;
  }

  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch (error) {
    throw new Error('As preferências locais estão inválidas.', { cause: error });
  }

  if (!isAppPreferences(value)) {
    throw new Error('As preferências locais estão inválidas.');
  }

  const preferences = {
    silentMode: value.silentMode,
    volume: 'volume' in value ? value.volume : DEFAULT_APP_PREFERENCES.volume,
    cameraFacing:
      'cameraFacing' in value ? value.cameraFacing : DEFAULT_APP_PREFERENCES.cameraFacing,
    theme: 'theme' in value ? value.theme : DEFAULT_APP_PREFERENCES.theme,
    language: 'language' in value ? value.language : DEFAULT_APP_PREFERENCES.language,
  };
  setAppTheme(preferences.theme);
  setAppLanguage(preferences.language);
  return preferences;
}

export async function saveAppPreferences(
  preferences: AppPreferences
): Promise<void> {
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  setAppTheme(preferences.theme);
  setAppLanguage(preferences.language);
  preferenceListeners.forEach((listener) => listener(preferences));
}

export function subscribeAppPreferences(
  listener: (preferences: AppPreferences) => void
): () => void {
  preferenceListeners.add(listener);
  return () => preferenceListeners.delete(listener);
}
