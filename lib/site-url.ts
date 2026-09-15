interface HeaderLookup {
  get(name: string): string | null;
}

export function getRequestOrigin(headers: HeaderLookup): string {
  const forwardedHost = headers.get('x-forwarded-host');
  const host = forwardedHost || headers.get('host');
  const protocol = headers.get('x-forwarded-proto') || 'https';

  if (!host) {
    return 'https://urlist.app';
  }

  return `${protocol}://${host}`;
}
