import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken } from '@/lib/auth';
import { z } from 'zod';

const GitHubTokenSchema = z.object({
  access_token: z.string().min(1),
});

const GitHubUserSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable().optional(),
});

function clearStateAndRedirect(request: NextRequest, errorCode: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/?error=${errorCode}`, request.url));
  response.cookies.set('oauth_state', '', { maxAge: 0, path: '/' });
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const storedState = request.cookies.get('oauth_state')?.value;

  // Validate OAuth state to prevent login CSRF
  if (!state || !storedState || state !== storedState) {
    return clearStateAndRedirect(request, 'invalid_state');
  }

  if (!code) {
    return clearStateAndRedirect(request, 'no_code');
  }

  const redirectUri = new URL('/api/auth/callback', request.url).toString();

  let tokenData: unknown;
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      return clearStateAndRedirect(request, 'auth_failed');
    }
    tokenData = await tokenRes.json();
  } catch {
    return clearStateAndRedirect(request, 'auth_failed');
  }

  const tokenParsed = GitHubTokenSchema.safeParse(tokenData);
  if (!tokenParsed.success) {
    return clearStateAndRedirect(request, 'auth_failed');
  }

  let userData: unknown;
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: 'Bearer ' + tokenParsed.data.access_token },
    });
    if (!userRes.ok) {
      return clearStateAndRedirect(request, 'profile_failed');
    }
    userData = await userRes.json();
  } catch {
    return clearStateAndRedirect(request, 'profile_failed');
  }

  const userParsed = GitHubUserSchema.safeParse(userData);
  if (!userParsed.success) {
    return clearStateAndRedirect(request, 'profile_failed');
  }

  const ghUser = userParsed.data;
  const sessionToken = await createSessionToken({
    uid: String(ghUser.id),
    username: ghUser.login,
    name: ghUser.name || ghUser.login,
    avatar: `https://github.com/${ghUser.login}.png`,
  });

  const response = NextResponse.redirect(new URL('/app/compose', request.url));

  // Clear OAuth state cookie
  response.cookies.set('oauth_state', '', { maxAge: 0, path: '/' });

  response.cookies.set('session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });

  return response;
}
