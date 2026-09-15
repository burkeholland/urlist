import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as postShareTarget } from '@/app/api/capture/share-target/route';
import { GET as getStaged } from '@/app/api/capture/staged/route';
import { _resetSecretCache } from '@/lib/auth';

describe('capture share target staging', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-secret-for-vitest-minimum-32-chars';
    _resetSecretCache();
  });

  it('stores capture state in a short-lived cookie and redirects to quick capture', async () => {
    const formData = new FormData();
    formData.set('url', 'https://example.com/article');
    formData.set('title', 'Example');
    formData.set('text', 'Interesting read');
    formData.set('source', 'bookmarklet');

    const res = await postShareTarget(
      new NextRequest('https://urlist.test/api/capture/share-target', {
        method: 'POST',
        body: formData,
      }),
    );

    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toContain('/app/capture');
    const cookie = res.headers.getSetCookie().find((value) => value.startsWith('capture_stage='));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=600');
  });

  it('falls back to the text field when a browser only shares text', async () => {
    const formData = new FormData();
    formData.set('text', 'https://example.com/from-text');

    const stage = await postShareTarget(
      new NextRequest('https://urlist.test/api/capture/share-target', {
        method: 'POST',
        body: formData,
      }),
    );

    const cookie = stage.headers.getSetCookie().find((value) => value.startsWith('capture_stage='))!;
    const cookieValue = cookie.split(';')[0].split('=')[1];

    const staged = await getStaged(
      new NextRequest('https://urlist.test/api/capture/staged', {
        headers: { Cookie: `capture_stage=${cookieValue}` },
      }),
    );

    const body = await staged.json();
    expect(body.capture.url).toBe('https://example.com/from-text');
    expect(body.capture.source).toBe('share-target');
    expect(staged.headers.getSetCookie().find((value) => value.startsWith('capture_stage='))).toContain('Max-Age=0');
  });

  it('redirects with an error when no captureable URL is present', async () => {
    const res = await postShareTarget(
      new NextRequest('https://urlist.test/api/capture/share-target', {
        method: 'POST',
        body: new FormData(),
      }),
    );

    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toContain('/app/capture?error=invalid_capture');
  });
});
