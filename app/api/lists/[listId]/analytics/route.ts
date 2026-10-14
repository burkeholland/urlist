import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, requireAuth, AuthError } from '@/lib/auth';
import { getList } from '@/lib/rtdb';
import { getListAnalytics } from '@/lib/analytics';
import { getEffectiveListRole, hasMinimumRole } from '@/lib/authorization';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const { listId } = await params;

  try {
    const authResult = await verifyAuth(request);
    requireAuth(authResult);

    // Verify list exists and user has collaborator access
    const list = await getList(listId);
    if (!list) {
      return NextResponse.json(
        { error: { code: 'LIST_NOT_FOUND', message: 'No list exists with this ID.' } },
        { status: 404 },
      );
    }

    const userRole = await getEffectiveListRole(listId, list, authResult.uid);
    if (!hasMinimumRole(userRole, 'viewer')) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You do not have access to this list.' } },
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
