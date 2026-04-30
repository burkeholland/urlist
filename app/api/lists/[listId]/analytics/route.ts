import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, requireAuth, AuthError } from '@/lib/auth';
import { getList } from '@/lib/rtdb';
import { getListAnalytics } from '@/lib/analytics';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const { listId } = await params;

  try {
    const authResult = await verifyAuth(request);
    requireAuth(authResult);

    // Verify list exists and user owns it
    const list = await getList(listId);
    if (!list) {
      return NextResponse.json(
        { error: { code: 'LIST_NOT_FOUND', message: 'No list exists with this ID.' } },
        { status: 404 },
      );
    }

    if (list.ownerId !== authResult.uid) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You are not the owner of this list.' } },
        { status: 403 },
      );
    }

    // Optional date range
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from')
      ? Number(searchParams.get('from'))
      : undefined;
    const to = searchParams.get('to')
      ? Number(searchParams.get('to'))
      : undefined;

    const analytics = await getListAnalytics(list.slug, listId, from, to);
    return NextResponse.json(analytics);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 401 },
      );
    }
    throw error;
  }
}
