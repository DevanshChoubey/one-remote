import { Linking, Platform } from 'react-native';

/** The phone's Bluetooth settings (Android opens them directly; iOS opens this app's settings). */
export async function openBluetoothSettings(): Promise<void> {
  if (Platform.OS === 'android') {
    await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
    return;
  }
  await Linking.openSettings();
}

/** This app's page in Settings, where a refused Bluetooth permission is granted. */
export async function openAppSettings(): Promise<void> {
  await Linking.openSettings();
}

/** This app's settings, where the phone's notification switch lives. */
export async function openNotificationSettings(): Promise<void> {
  await Linking.openSettings();
}
