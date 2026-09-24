import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type PhotoResult = { ok: true; uri: string } | { ok: false; reason: 'cancelled' | 'denied' };

export interface PhotoOptions {
  /** Crop box shape offered to the user; null = free crop (prescriptions). */
  aspect?: [number, number] | null;
  /** Longest edge after resizing. Prescriptions need more pixels for handwriting. */
  maxWidth?: number;
}

const MEDICINE: PhotoOptions = { aspect: [1, 1], maxWidth: 1200 };
export const PRESCRIPTION: PhotoOptions = { aspect: null, maxWidth: 2200 };

/** Shrink and re-encode on device: faster uploads and no EXIF (location) data leaves the phone. */
async function prepare(uri: string, maxWidth: number): Promise<string> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: maxWidth }).renderAsync();
  const saved = await ref.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
  return saved.uri;
}

function pickerOptions(o: PhotoOptions): ImagePicker.ImagePickerOptions {
  return {
    mediaTypes: ['images'],
    allowsEditing: true, // lets the user crop to the medicine / the prescription
    ...(o.aspect ? { aspect: o.aspect } : {}),
    quality: 0.95,
    exif: false,
  };
}

export async function takePhoto(opts: PhotoOptions = MEDICINE): Promise<PhotoResult> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { ok: false, reason: 'denied' };
  const res = await ImagePicker.launchCameraAsync(pickerOptions(opts));
  if (res.canceled || !res.assets[0]) return { ok: false, reason: 'cancelled' };
  return { ok: true, uri: await prepare(res.assets[0].uri, opts.maxWidth ?? 1200) };
}

export async function pickPhoto(opts: PhotoOptions = MEDICINE): Promise<PhotoResult> {
  // Android 13+/iOS 14+ use the system photo picker, which needs no library permission.
  const res = await ImagePicker.launchImageLibraryAsync(pickerOptions(opts));
  if (res.canceled || !res.assets[0]) return { ok: false, reason: 'cancelled' };
  return { ok: true, uri: await prepare(res.assets[0].uri, opts.maxWidth ?? 1200) };
}
