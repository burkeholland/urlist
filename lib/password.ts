import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

type ScryptOptions = { N: number; r: number; p: number; maxmem: number };
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const SCRYPT_VERSION = '1';
const KEY_LENGTH = 64;
const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

export async function hashListPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(normalizePassword(password), salt, KEY_LENGTH, SCRYPT_PARAMS);
  return [
    'scrypt',
    SCRYPT_VERSION,
    String(SCRYPT_PARAMS.N),
    String(SCRYPT_PARAMS.r),
    String(SCRYPT_PARAMS.p),
    String(KEY_LENGTH),
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifyListPassword(password: string, encodedHash: string): Promise<boolean> {
  const parts = encodedHash.split('$');
  if (parts.length !== 8 || parts[0] !== 'scrypt' || parts[1] !== SCRYPT_VERSION) {
    return false;
  }

  const [, , nRaw, rRaw, pRaw, keyLengthRaw, saltRaw, hashRaw] = parts;
  const [N, r, p, keyLength] = [nRaw, rRaw, pRaw, keyLengthRaw].map(Number);
  if (![N, r, p, keyLength].every(Number.isInteger)) {
    return false;
  }

  try {
    const salt = Buffer.from(saltRaw, 'base64url');
    const expected = Buffer.from(hashRaw, 'base64url');
    const actual = await scryptAsync(normalizePassword(password), salt, keyLength, { N, r, p, maxmem: 64 * 1024 * 1024 });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// NFKC (per NIST SP 800-63B) so the same password typed or pasted with different
// Unicode compositions, like "é" vs "e" + combining accent, verifies consistently.
function normalizePassword(password: string): string {
  return password.normalize('NFKC');
}
