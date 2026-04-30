import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, requireAuth, AuthError } from '@/lib/auth';
import { getUserListIds } from '@/lib/rtdb';
import { getGlobalAnalytics } from '@/lib/analytics';

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    requireAuth(authResult);

    const listIds = await getUserListIds(authResult.uid!);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from')
      ? Number(searchParams.get('from'))
      : undefined;
    const to = searchParams.get('to')
      ? Number(searchParams.get('to'))
      : undefined;

    const analytics = await getGlobalAnalytics(listIds, from, to);
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
