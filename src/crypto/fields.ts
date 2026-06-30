import {
  decryptJson,
  decryptString,
  encryptJson,
  encryptString,
  isEncryptedJson,
  isEncryptedText,
} from './envelope';

export function maybeEncryptText(cek: Uint8Array | null, text: string | null | undefined): string {
  if (!cek || text == null || text === '') return text ?? '';
  if (isEncryptedText(text)) return text;
  return encryptString(cek, text);
}

export function maybeDecryptText(cek: Uint8Array | null, text: string | null | undefined): string {
  if (!text) return text ?? '';
  if (!cek || !isEncryptedText(text)) return text;
  const out = decryptString(cek, text);
  return out || '';
}

export function maybeEncryptJson(cek: Uint8Array | null, value: unknown): unknown {
  if (!cek) return value;
  if (value == null) return value;
  if (Array.isArray(value) && value.length === 0) return value;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) {
    return value;
  }
  if (isEncryptedJson(value)) return value;
  return encryptJson(cek, value);
}

export function maybeDecryptJson<T>(cek: Uint8Array | null, value: unknown): T | null {
  if (value == null) return value as T;
  if (!cek || !isEncryptedJson(value)) return value as T;
  return decryptJson<T>(cek, value);
}

export function decryptRowTexts(
  cek: Uint8Array | null,
  row: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> {
  if (!cek || !row) return row;
  const out = { ...row };
  for (const f of fields) {
    if (typeof out[f] === 'string') {
      out[f] = maybeDecryptText(cek, out[f] as string);
    }
  }
  return out;
}

export function decryptRowsTexts(
  cek: Uint8Array | null,
  rows: Record<string, unknown>[],
  fields: string[],
): Record<string, unknown>[] {
  return rows.map((r) => decryptRowTexts(cek, r, fields));
}
