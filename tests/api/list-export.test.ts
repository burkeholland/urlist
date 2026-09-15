import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/lists/[listId]/export/route';
import { getListWithLinks } from '@/lib/rtdb';

vi.mock('@/lib/rtdb', () => ({ getListWithLinks: vi.fn() }));

const ctx = { params: Promise.resolve({ listId: 'list-1' }) };
const list = {
  listId: 'list-1',
  slug: 'my/list',
  description: 'desc',
  ownerId: 'u1',
  createdAt: 1,
  updatedAt: 2,
  links: [{
    id: 'link-1',
    url: 'https://example.com/',
    position: 0,
    pinned: false,
    folder: 'Folder',
    ogTitle: 'Title',
    ogDescription: 'Desc',
    ogImage: null,
    ogSiteName: null,
    createdAt: 1,
  }],
};

const json = async (res: Response) => ({ status: res.status, body: await res.json() });

describe('GET /api/lists/[listId]/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getListWithLinks).mockResolvedValue(list);
  });

  it('exports JSON by default with download headers', async () => {
    const res = await GET(new NextRequest('https://urlist.test/api/lists/list-1/export'), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="urlist-my-list.json"');
    const body = JSON.parse(await res.text());
    expect(body.list.links[0].folder).toBe('Folder');
  });

  it('exports CSV and HTML formats', async () => {
    const csv = await GET(new NextRequest('https://urlist.test/api/lists/list-1/export?format=csv'), ctx);
    expect(csv.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(await csv.text()).toContain('url,title,description,folder,pinned');

    const html = await GET(new NextRequest('https://urlist.test/api/lists/list-1/export?format=html'), ctx);
    expect(html.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(await html.text()).toContain('NETSCAPE-Bookmark-file-1');
  });

  it('returns 400 for unsupported formats', async () => {
    const res = await json(await GET(new NextRequest('https://urlist.test/api/lists/list-1/export?format=xml'), ctx));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FORMAT');
  });

  it('returns 404 when the list is missing', async () => {
    vi.mocked(getListWithLinks).mockResolvedValue(null);
    const res = await json(await GET(new NextRequest('https://urlist.test/api/lists/list-1/export'), ctx));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LIST_NOT_FOUND');
  });
});
