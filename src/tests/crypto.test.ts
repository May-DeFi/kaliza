import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, hashString, generateCorrelationId } from '../adapters/encryption/crypto.js';

describe('Crypto utilities', () => {
  it('encrypts and decrypts a string', () => {
    const plaintext = '{"access_token":"secret123","refresh_token":"r456"}';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertexts for same plaintext', () => {
    const text = 'test-secret';
    const e1 = encrypt(text);
    const e2 = encrypt(text);
    expect(e1).not.toBe(e2);
    expect(decrypt(e1)).toBe(text);
    expect(decrypt(e2)).toBe(text);
  });

  it('hashes strings consistently', () => {
    const h1 = hashString('test');
    const h2 = hashString('test');
    const h3 = hashString('different');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toHaveLength(64);
  });

  it('generates unique correlation IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateCorrelationId());
    }
    expect(ids.size).toBe(100);
  });
});
