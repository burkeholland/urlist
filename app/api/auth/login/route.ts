import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { normalizeSafeReturnTo } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: { code: 'OAUTH_NOT_CONFIGURED', message: 'GitHub OAuth not configured.' } }, { status: 500 });
  }

  const state = randomBytes(32).toString('hex');
  const redirectUri = new URL('/api/auth/callback', request.url).toString();

  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'read:user',
    redirect_uri: redirectUri,
    state,
  });

  const response = NextResponse.redirect('https://github.com/login/oauth/authorize?' + params.toString());
  const returnTo = normalizeSafeReturnTo(request.nextUrl.searchParams.get('returnTo'));

  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });
  if (returnTo) {
    response.cookies.set('oauth_return_to', returnTo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
  } else {
    response.cookies.set('oauth_return_to', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
  }

  return response;
}
