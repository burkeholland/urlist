import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth, verifyAuth } from '@/lib/auth';
import { canManageCollaborators, getEffectiveListRole } from '@/lib/authorization';
import { getList, revokeInvite } from '@/lib/rtdb';

export async function DELETE(
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
        { error: { code: 'FORBIDDEN', message: 'Only the owner can revoke invites.' } },
        { status: 403 },
      );
    }

    const invite = await revokeInvite({ listId, inviteId, actorId: authResult.uid });
    if (!invite) {
      return NextResponse.json(
        { error: { code: 'INVITE_NOT_FOUND', message: 'Invite was not found.' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ invite });
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
