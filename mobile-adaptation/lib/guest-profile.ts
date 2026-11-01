import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const PROFILE_KEY = 'orbit_room_mobile_guest_profile';
const LEGACY_ID_KEY = 'orbit_room_mobile_client_id';
const LEGACY_NAME_KEY = 'orbit_room_mobile_display_name';

export type GuestProfile = {
  clientId: string;
  displayName: string;
};

function isGuestProfile(value: unknown): value is GuestProfile {
  if (typeof value !== 'object' || value === null) return false;
  const profile = value as Record<string, unknown>;

  return (
    typeof profile.clientId === 'string' &&
    profile.clientId.startsWith('mobile-') &&
    profile.clientId.length <= 128 &&
    typeof profile.displayName === 'string' &&
    profile.displayName.length <= 40
  );
}

export function validateGuestName(value: string): string {
  const displayName = value.trim();

  if (!displayName) {
    throw new Error('Digite um nome para continuar como visitante.');
  }
  if (displayName.length > 40) {
    throw new Error('Seu nome deve ter no máximo 40 caracteres.');
  }

  return displayName;
}

async function persistGuestProfile(profile: GuestProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  await AsyncStorage.multiRemove([LEGACY_ID_KEY, LEGACY_NAME_KEY]);
}

export async function loadGuestProfile(): Promise<GuestProfile> {
  const storedProfile = await AsyncStorage.getItem(PROFILE_KEY);

  if (storedProfile !== null) {
    let profile: unknown;
    try {
      profile = JSON.parse(storedProfile);
    } catch (error) {
      throw new Error('Os dados do perfil visitante estão inválidos.', { cause: error });
    }

    if (!isGuestProfile(profile)) {
      throw new Error('Os dados do perfil visitante estão inválidos.');
    }

    return profile;
  }

  const [legacyClientId, legacyDisplayName] = await AsyncStorage.multiGet([
    LEGACY_ID_KEY,
    LEGACY_NAME_KEY,
  ]).then((entries) => entries.map(([, value]) => value));

  const profile: GuestProfile = {
    clientId:
      legacyClientId?.startsWith('mobile-') && legacyClientId.length <= 128
        ? legacyClientId
        : `mobile-${Crypto.randomUUID()}`,
    displayName: legacyDisplayName?.trim().slice(0, 40) ?? '',
  };

  await persistGuestProfile(profile);
  return profile;
}

export async function saveGuestProfile(
  clientId: string,
  displayName: string
): Promise<GuestProfile> {
  if (!clientId.startsWith('mobile-') || clientId.length > 128) {
    throw new Error('Não foi possível validar a identidade deste aparelho.');
  }

  const profile = {
    clientId,
    displayName: validateGuestName(displayName),
  };

  await persistGuestProfile(profile);
  return profile;
}

export async function resetGuestProfile(): Promise<GuestProfile> {
  await AsyncStorage.multiRemove([PROFILE_KEY, LEGACY_ID_KEY, LEGACY_NAME_KEY]);
  return loadGuestProfile();
}
