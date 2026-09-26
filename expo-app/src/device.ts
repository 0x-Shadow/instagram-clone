import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Contacts from 'expo-contacts';
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';

// expo-notifications is loaded lazily (never at startup): its index runs a
// warning side effect, and remote-push token APIs throw on Android Expo Go
// ("removed from Expo Go with SDK 53"). Lazy + try/catch keeps every one of
// those failure modes off the red screen.
type NotificationsModule = typeof import('expo-notifications');
async function notifs(): Promise<NotificationsModule> {
  return await import('expo-notifications');
}

let handlerSet = false;
async function ensureHandler(): Promise<void> {
  if (handlerSet) return;
  try {
    const N = await notifs();
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    handlerSet = true;
  } catch {
    // Notifications unavailable on this runtime; callers degrade gracefully.
  }
}

// Remote push tokens don't exist in Android Expo Go (removed in SDK 53, dev
// build required). Permission prompts + local scheduled notifications work.
export function pushNeedsDevBuild(): boolean {
  return Platform.OS === 'android' && isRunningInExpoGo();
}

export type DevicePhoto = { uri: string } | null;

export async function pickFromLibrary(): Promise<DevicePhoto> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return null;
    return { uri: result.assets[0].uri };
  } catch {
    return null;
  }
}

export async function takePhoto(): Promise<DevicePhoto> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return null;
    return { uri: result.assets[0].uri };
  } catch {
    return null;
  }
}

export async function saveToLibrary(uri: string): Promise<boolean> {
  try {
    // Lazy + legacy: the classic 'ExpoMediaLibrary' native module ships in
    // every Expo Go client, while the default entry needs the
    // SDK 57-only 'ExpoMediaLibraryNext'. Loaded on demand so a missing
    // native module can never red-screen the app at startup.
    const MediaLibrary = await import('expo-media-library/legacy');
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) return false;
    await MediaLibrary.saveToLibraryAsync(uri);
    return true;
  } catch {
    return false;
  }
}

export async function currentPlace(): Promise<string | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const pos = await Location.getCurrentPositionAsync({});
    const [place] = await Location.reverseGeocodeAsync({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    });
    if (!place) return null;
    return place.city ?? place.subregion ?? place.name ?? place.country ?? null;
  } catch {
    return null;
  }
}

export type DeviceContact = { id: string; name: string; phone?: string };

export async function loadDeviceContacts(): Promise<DeviceContact[] | null> {
  try {
    const perm = await Contacts.requestPermissionsAsync();
    if (!perm.granted) return null;
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      pageSize: 100,
      pageOffset: 0,
    });
    return data
      .filter((c) => c.name)
      .map((c) => ({
        id: c.id ?? c.name ?? '',
        name: c.name ?? '',
        phone: c.phoneNumbers?.[0]?.number,
      }));
  } catch {
    return null;
  }
}

export async function locationStatus(): Promise<string> {
  try {
    const p = await Location.getForegroundPermissionsAsync();
    return p.status;
  } catch {
    return 'undetermined';
  }
}

export async function contactsStatus(): Promise<string> {
  try {
    const p = await Contacts.getPermissionsAsync();
    return p.status;
  } catch {
    return 'undetermined';
  }
}

export async function notificationsStatus(): Promise<string> {
  try {
    await ensureHandler();
    const N = await notifs();
    const p = await N.getPermissionsAsync();
    return p.granted ? 'granted' : p.status;
  } catch {
    return 'undetermined';
  }
}

export async function ensureNotifications(): Promise<boolean> {
  try {
    await ensureHandler();
    const N = await notifs();
    const cur = await N.getPermissionsAsync();
    if (cur.granted) return true;
    const req = await N.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

export async function sendTestNotification(): Promise<boolean> {
  try {
    const ok = await ensureNotifications();
    if (!ok) return false;
    const N = await notifs();
    await N.scheduleNotificationAsync({
      content: { title: 'Instagram', body: 'Notifications are on. You will get likes and messages here.' },
      trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 },
    });
    return true;
  } catch {
    return false;
  }
}
