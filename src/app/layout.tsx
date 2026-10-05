import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { bootScript } from '@/lib/ui-prefs';
export const metadata: Metadata = {
  title: 'Tier2 — Social Intelligence',
  description: 'A clearer picture of your brand’s social presence.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Light by default; the boot script switches to a saved dark theme and sets data-sidebar before hydration,
    // so React must not flag the difference.
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>
        {/* beforeInteractive puts it in the server HTML's <head>, so it runs before first paint. */}
        <Script id="ui-prefs" strategy="beforeInteractive">
          {bootScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
