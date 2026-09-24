import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type PhotoResult = { ok: true; uri: string } | { ok: false; reason: 'cancelled' | 'denied' };

/** Shrink and re-encode on device: faster uploads and no EXIF (location) data leaves the phone. */
async function prepare(uri: string): Promise<string> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: 1200 }).renderAsync();
  const saved = await ref.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return saved.uri;
}

const OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true, // lets the user crop to the medicine
  aspect: [1, 1],
  quality: 0.9,
  exif: false,
};

export async function takePhoto(): Promise<PhotoResult> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { ok: false, reason: 'denied' };
  const res = await ImagePicker.launchCameraAsync(OPTIONS);
  if (res.canceled || !res.assets[0]) return { ok: false, reason: 'cancelled' };
  return { ok: true, uri: await prepare(res.assets[0].uri) };
}

export async function pickPhoto(): Promise<PhotoResult> {
  // Android 13+/iOS 14+ use the system photo picker, which needs no library permission.
  const res = await ImagePicker.launchImageLibraryAsync(OPTIONS);
  if (res.canceled || !res.assets[0]) return { ok: false, reason: 'cancelled' };
  return { ok: true, uri: await prepare(res.assets[0].uri) };
}
