'use client';

import { AuthProvider } from '@/hooks/use-auth';
import { ThemeProvider } from '@/hooks/use-theme';
import { PwaBootstrap } from '@/components/pwa-bootstrap';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PwaBootstrap />
        {children}
      </AuthProvider>
    </ThemeProvider>
  );
}
