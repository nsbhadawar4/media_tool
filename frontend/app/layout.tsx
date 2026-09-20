import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/lib/theme/ThemeContext';
import { ToastProvider } from '@/lib/toast/ToastContext';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { QueryProvider } from '@/lib/QueryProvider';
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'media_tool — Private Media Library',
  description: 'A private, self-hosted photo, video and document manager.',
  robots: { index: false, follow: false },
  applicationName: 'media_tool',
  appleWebApp: {
    capable: true,
    title: 'media_tool',
    // The app draws its own background under the status bar and pads the header by the
    // safe-area inset, so the status bar sits over the app rather than beside it.
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the app paint into the display cutout and home-indicator areas. Everything that
  // would otherwise land underneath them is padded by env(safe-area-inset-*).
  viewportFit: 'cover',
  // Zoom is deliberately left enabled. Pinning maximumScale would make the app feel more
  // like a native shell and would also stop anyone who needs to magnify text.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0d' },
  ],
};

// Runs before first paint so a saved theme preference never flashes the wrong colors.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("media_tool_theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="h-full min-h-full antialiased">
        <QueryProvider>
          <ThemeProvider>
            <ToastProvider>
              <AuthProvider>{children}</AuthProvider>
            </ToastProvider>
          </ThemeProvider>
        </QueryProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
