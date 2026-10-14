import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth, verifyAuth } from '@/lib/auth';
import { canManageCollaborators, getEffectiveListRole } from '@/lib/authorization';
import { getList, getListMemberships } from '@/lib/rtdb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const { listId } = await params;

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
        { error: { code: 'FORBIDDEN', message: 'Only the owner can manage collaborators.' } },
        { status: 403 },
      );
    }

    const members = await getListMemberships(listId);
    if (list.ownerId && !members.some((member) => member.uid === list.ownerId)) {
      members.unshift({
        id: `${list.ownerId}_${listId}`,
        uid: list.ownerId,
        listId,
        role: 'owner',
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
        acceptedAt: list.createdAt,
      });
    }
    return NextResponse.json({ members });
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
