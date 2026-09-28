import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Tier2 — Social Intelligence',
  description: 'A clearer picture of your brand’s social presence.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
