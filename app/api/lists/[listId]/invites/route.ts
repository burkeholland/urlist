import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth, verifyAuth } from '@/lib/auth';
import { canManageCollaborators, getEffectiveListRole } from '@/lib/authorization';
import { createInvite, getList, listInvites } from '@/lib/rtdb';
import { CreateInviteSchema } from '@/lib/schemas/shared';

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
        { error: { code: 'FORBIDDEN', message: 'Only the owner can manage invites.' } },
        { status: 403 },
      );
    }

    return NextResponse.json({ invites: await listInvites(listId) });
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

export async function POST(
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
        { error: { code: 'FORBIDDEN', message: 'Only the owner can create invites.' } },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = CreateInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0].message } },
        { status: 400 },
      );
    }

    const { invite, token } = await createInvite({
      listId,
      role: parsed.data.role,
      expiresInDays: parsed.data.expiresInDays,
      createdBy: authResult.uid,
    });
    const inviteUrl = new URL('/app/invites/accept', request.url);
    inviteUrl.hash = `token=${token}`;

    return NextResponse.json({ invite, token, inviteUrl: inviteUrl.toString() }, { status: 201 });
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
