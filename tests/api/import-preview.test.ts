import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/import/preview/route';

const json = async (res: Response) => ({ status: res.status, body: await res.json() });
const req = (body: unknown) => new NextRequest('https://urlist.test/api/import/preview', {
  method: 'POST',
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

describe('POST /api/import/preview', () => {
  it('returns an import preview with valid, invalid, and duplicate rows', async () => {
    const res = await json(await POST(req({
      content: 'example.com\nbad url\nexample.com',
      existingUrls: [],
      currentLinkCount: 0,
    })));
    expect(res.status).toBe(200);
    expect(res.body.valid).toHaveLength(1);
    expect(res.body.invalid).toHaveLength(1);
    expect(res.body.duplicates).toHaveLength(1);
  });

  it('returns 400 for invalid request bodies', async () => {
    const res = await json(await POST(req({ content: 1 })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await json(await POST(req('{no')));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns bounded import errors as 400 responses', async () => {
    const res = await json(await POST(req({ content: 'url,title\nexample.com,"unterminated', format: 'csv' })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MALFORMED_CSV');
  });
});
