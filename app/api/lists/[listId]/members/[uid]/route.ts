import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth, verifyAuth } from '@/lib/auth';
import { canManageCollaborators, getEffectiveListRole } from '@/lib/authorization';
import { getList, removeListMembership, updateListMembershipRole } from '@/lib/rtdb';
import { UpdateMemberSchema } from '@/lib/schemas/shared';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string; uid: string }> },
) {
  const { listId, uid } = await params;

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

    if (uid === list.ownerId) {
      return NextResponse.json(
        { error: { code: 'INVALID_MEMBER_CHANGE', message: 'The owner role cannot be changed.' } },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = UpdateMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0].message } },
        { status: 400 },
      );
    }

    const member = await updateListMembershipRole({ listId, uid, role: parsed.data.role });
    if (!member) {
      return NextResponse.json(
        { error: { code: 'MEMBER_NOT_FOUND', message: 'Collaborator was not found.' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ member });
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string; uid: string }> },
) {
  const { listId, uid } = await params;

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

    if (uid === list.ownerId || uid === authResult.uid) {
      return NextResponse.json(
        { error: { code: 'INVALID_MEMBER_CHANGE', message: 'The owner cannot be removed.' } },
        { status: 400 },
      );
    }

    const removed = await removeListMembership(listId, uid);
    if (!removed) {
      return NextResponse.json(
        { error: { code: 'MEMBER_NOT_FOUND', message: 'Collaborator was not found.' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ removed: true, uid });
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
