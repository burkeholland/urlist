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

  it('returns false for malformed hashes', async () => {
    await expect(verifyListPassword('anything', 'not-a-valid-hash')).resolves.toBe(false);
  });
});
