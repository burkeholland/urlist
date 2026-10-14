import { describe, expect, it } from 'vitest';
import { hashListPassword, verifyListPassword } from '@/lib/password';

describe('list password hashing', () => {
  it('uses scrypt hashes and verifies only the original password', async () => {
    const hash = await hashListPassword('correct horse battery staple');
    expect(hash).toMatch(/^scrypt\$1\$/);
    expect(hash).not.toContain('correct horse battery staple');
    await expect(verifyListPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyListPassword('wrong password', hash)).resolves.toBe(false);
  });

  it('records its cost parameters and uses a fresh random salt for every hash', async () => {
    const first = await hashListPassword('same password');
    const second = await hashListPassword('same password');
    const [algorithm, version, N, r, p, keyLength, salt, derived] = first.split('$');
    expect([algorithm, version, N, r, p, keyLength]).toEqual(['scrypt', '1', '16384', '8', '1', '64']);
    expect(Buffer.from(salt, 'base64url')).toHaveLength(16);
    expect(Buffer.from(derived, 'base64url')).toHaveLength(64);
    expect(second).not.toBe(first);
    await expect(verifyListPassword('same password', second)).resolves.toBe(true);
  });

  it('treats canonically equivalent Unicode passwords as the same password', async () => {
    const composed = 'caf\u00e9 au lait';
    const decomposed = 'cafe\u0301 au lait';
    const hash = await hashListPassword(composed);
    await expect(verifyListPassword(decomposed, hash)).resolves.toBe(true);
  });

  it('rejects a hash whose derived key was altered', async () => {
    const hash = await hashListPassword('correct horse battery staple');
    const parts = hash.split('$');
    const derived = Buffer.from(parts[7], 'base64url');
    derived[0] ^= 0xff;
    parts[7] = derived.toString('base64url');
    await expect(verifyListPassword('correct horse battery staple', parts.join('$'))).resolves.toBe(false);
  });

  it('rejects a hash whose stored length does not match the derived key', async () => {
    const hash = await hashListPassword('correct horse battery staple');
    const parts = hash.split('$');
    parts[7] = Buffer.from(parts[7], 'base64url').subarray(0, 32).toString('base64url');
    await expect(verifyListPassword('correct horse battery staple', parts.join('$'))).resolves.toBe(false);
  });

  it.each([
    ['a malformed hash', 'not-a-valid-hash'],
    ['an unknown algorithm', 'bcrypt$1$16384$8$1$64$c2FsdA$aGFzaA'],
    ['an unknown version', 'scrypt$2$16384$8$1$64$c2FsdA$aGFzaA'],
    ['non-numeric cost parameters', 'scrypt$1$lots$8$1$64$c2FsdA$aGFzaA'],
    ['cost parameters scrypt rejects', 'scrypt$1$16385$8$1$64$c2FsdA$aGFzaA'],
  ])('returns false instead of throwing for %s', async (_label, encodedHash) => {
    await expect(verifyListPassword('anything', encodedHash)).resolves.toBe(false);
  });
});
