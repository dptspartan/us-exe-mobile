import * as Crypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes.js';
export const TEXT_PREFIX = 'enc:v1:';

export type Envelope = { v: 1; alg: 'AES-GCM'; iv: string; ct: string };

export function randomBytes(length: number): Uint8Array {
  const hex = Crypto.getRandomBytes(length);
  if (hex instanceof Uint8Array) return hex;
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (hex as Uint8Array)[i];
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function getAesGcm(cek: Uint8Array, iv: Uint8Array) {
  return gcm(cek, iv);
}

const IV_LEN = 12;

export function isEncryptedText(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(TEXT_PREFIX);
}

export function isEncryptedJson(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Envelope).v === 1 &&
    (value as Envelope).alg === 'AES-GCM' &&
    typeof (value as Envelope).iv === 'string' &&
    typeof (value as Envelope).ct === 'string'
  );
}

export function encryptString(cek: Uint8Array, text: string): string {
  if (!text) return text;
  const iv = randomBytes(IV_LEN);
  const aes = getAesGcm(cek, iv);
  const ct = aes.encrypt(new TextEncoder().encode(text));
  const env: Envelope = { v: 1, alg: 'AES-GCM', iv: bytesToB64(iv), ct: bytesToB64(ct) };
  return TEXT_PREFIX + bytesToB64(new TextEncoder().encode(JSON.stringify(env)));
}

export function decryptString(cek: Uint8Array, value: string): string {
  if (!value || !isEncryptedText(value)) return value;
  try {
    const json = new TextDecoder().decode(b64ToBytes(value.slice(TEXT_PREFIX.length)));
    const env = JSON.parse(json) as Envelope;
    const iv = b64ToBytes(env.iv);
    const ct = b64ToBytes(env.ct);
    const aes = getAesGcm(cek, iv);
    return new TextDecoder().decode(aes.decrypt(ct));
  } catch (e) {
    if (__DEV__) console.warn('[e2ee] decryptString failed');
    return value;
  }
}

export function encryptJson(cek: Uint8Array, obj: unknown): Envelope {
  const iv = randomBytes(IV_LEN);
  const aes = getAesGcm(cek, iv);
  const ct = aes.encrypt(new TextEncoder().encode(JSON.stringify(obj)));
  return { v: 1, alg: 'AES-GCM', iv: bytesToB64(iv), ct: bytesToB64(ct) };
}

export function decryptJson<T>(cek: Uint8Array, value: unknown): T | null {
  if (!isEncryptedJson(value)) return value as T;
  try {
    const env = value as Envelope;
    const iv = b64ToBytes(env.iv);
    const ct = b64ToBytes(env.ct);
    const aes = getAesGcm(cek, iv);
    const plain = aes.decrypt(ct);
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}

export function encryptBytes(cek: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const iv = randomBytes(IV_LEN);
  const aes = getAesGcm(cek, iv);
  const ct = aes.encrypt(plaintext);
  const out = new Uint8Array(IV_LEN + ct.length);
  out.set(iv);
  out.set(ct, IV_LEN);
  return out;
}

export function decryptBytes(cek: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length <= IV_LEN) return data;
  const iv = data.slice(0, IV_LEN);
  const ct = data.slice(IV_LEN);
  const aes = getAesGcm(cek, iv);
  return aes.decrypt(ct);
}

export function cekFromB64(b64: string): Uint8Array {
  return b64ToBytes(b64);
}

export { bytesToB64, b64ToBytes };
