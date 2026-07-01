import { describe, expect, it } from 'vitest';
import {
  decryptBytes,
  decryptJson,
  decryptString,
  encryptBytes,
  encryptJson,
  encryptString,
  isEncryptedJson,
  isEncryptedText,
  randomBytes,
} from './envelope';
import { maybeEncryptText } from './fields';

describe('envelope roundtrip', () => {
  const cek = randomBytes(32);

  it('encrypts and decrypts text with enc:v1 prefix', () => {
    const plain = 'Hello, us.exe';
    const enc = encryptString(cek, plain);
    expect(isEncryptedText(enc)).toBe(true);
    expect(decryptString(cek, enc)).toBe(plain);
  });

  it('encrypts and decrypts json envelopes', () => {
    const obj = { strokes: [{ x: 1, y: 2 }] };
    const enc = encryptJson(cek, obj);
    expect(isEncryptedJson(enc)).toBe(true);
    expect(decryptJson(cek, enc)).toEqual(obj);
  });

  it('encrypts and decrypts binary blobs', () => {
    const plain = new Uint8Array([1, 2, 3, 4, 5]);
    const enc = encryptBytes(cek, plain);
    expect(Array.from(decryptBytes(cek, enc))).toEqual(Array.from(plain));
  });

  it('skips encrypt for empty strings', () => {
    expect(maybeEncryptText(cek, '')).toBe('');
  });
});
