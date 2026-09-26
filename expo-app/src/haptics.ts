import * as Haptics from 'expo-haptics';

export async function tap(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics unavailable on this device; touch still works.
  }
}

export async function success(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Haptics unavailable on this device; touch still works.
  }
}
