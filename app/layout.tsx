import type { Metadata, Viewport } from 'next';
import { getActiveCorpus } from '@/lib/corpora';
import './globals.css';

export function generateMetadata(): Metadata {
  const corpus = getActiveCorpus();
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return {
    metadataBase: new URL(host ? `https://${host}` : 'http://localhost:3000'),
    title: corpus.name,
    description: corpus.tagline,
    openGraph: { title: corpus.name, description: corpus.tagline, type: 'website' },
    twitter: { card: 'summary_large_image', title: corpus.name, description: corpus.tagline },
  };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
