import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { acceptInvite } from '@/lib/rtdb';
import { AcceptInviteSchema } from '@/lib/schemas/shared';

const STATUS_ERROR: Record<string, { code: string; message: string; status: number }> = {
  invalid: { code: 'INVALID_INVITE', message: 'Invite link is invalid.', status: 404 },
  expired: { code: 'INVITE_EXPIRED', message: 'Invite link has expired.', status: 410 },
  revoked: { code: 'INVITE_REVOKED', message: 'Invite link was revoked.', status: 410 },
  used: { code: 'INVITE_USED', message: 'Invite link has already been used.', status: 409 },
  list_not_found: { code: 'LIST_NOT_FOUND', message: 'Invited list no longer exists.', status: 404 },
};

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to accept this invite.' } },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = AcceptInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0].message } },
      { status: 400 },
    );
  }

  const result = await acceptInvite({ token: parsed.data.token, user });
  if (result.status !== 'accepted') {
    const error = STATUS_ERROR[result.status];
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  return NextResponse.json({
    listId: result.listId,
    slug: result.slug,
    role: result.role,
  });
}
