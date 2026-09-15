import { NextRequest, NextResponse } from 'next/server';
import { CAPTURE_STAGE_COOKIE, readCaptureStateToken } from '@/lib/capture-state';

export async function GET(request: NextRequest) {
  const capture = await readCaptureStateToken(request.cookies.get(CAPTURE_STAGE_COOKIE)?.value);
  const response = NextResponse.json({ capture });
  response.cookies.set(CAPTURE_STAGE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
