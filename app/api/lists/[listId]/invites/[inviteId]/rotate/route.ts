import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth, verifyAuth } from '@/lib/auth';
import { canManageCollaborators, getEffectiveListRole } from '@/lib/authorization';
import { getList, rotateInvite } from '@/lib/rtdb';
import { CreateInviteSchema } from '@/lib/schemas/shared';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string; inviteId: string }> },
) {
  const { listId, inviteId } = await params;

  try {
    const authResult = await verifyAuth(request);
    requireAuth(authResult);

    const list = await getList(listId);
    if (!list) {
      return NextResponse.json(
        { error: { code: 'LIST_NOT_FOUND', message: 'List does not exist.' } },
        { status: 404 },
      );
    }

    const userRole = await getEffectiveListRole(listId, list, authResult.uid);
    if (!canManageCollaborators(userRole)) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Only the owner can rotate invites.' } },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = CreateInviteSchema.pick({ expiresInDays: true }).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0].message } },
        { status: 400 },
      );
    }

    const rotated = await rotateInvite({
      listId,
      inviteId,
      actorId: authResult.uid,
      expiresInDays: parsed.data.expiresInDays,
    });
    if (!rotated) {
      return NextResponse.json(
        { error: { code: 'INVITE_NOT_FOUND', message: 'Invite was not found.' } },
        { status: 404 },
      );
    }

    const inviteUrl = new URL('/app/invites/accept', request.url);
    inviteUrl.hash = `token=${rotated.token}`;
    return NextResponse.json({ ...rotated, inviteUrl: inviteUrl.toString() }, { status: 201 });
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
