import { NextRequest, NextResponse } from 'next/server';
import {
  buildStagedCapturePayload,
  CAPTURE_STAGE_COOKIE,
  createCaptureStateToken,
} from '@/lib/capture-state';

function buildRedirect(request: NextRequest, errorCode?: string): NextResponse {
  const location = new URL('/app/capture', request.url);
  if (errorCode) {
    location.searchParams.set('error', errorCode);
  }
  return NextResponse.redirect(location, { status: 303 });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const payload = formData
    ? buildStagedCapturePayload({
        url: formData.get('url'),
        title: formData.get('title'),
        text: formData.get('text'),
        source: typeof formData.get('source') === 'string' ? String(formData.get('source')) : null,
      })
    : null;

  if (!payload) {
    const response = buildRedirect(request, 'invalid_capture');
    response.cookies.set(CAPTURE_STAGE_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
    return response;
  }

  const token = await createCaptureStateToken(payload);
  const response = buildRedirect(request);
  response.cookies.set(CAPTURE_STAGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  return response;
}
