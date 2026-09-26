import type { Metadata, Viewport } from 'next';
import { getActiveCorpus } from '@/lib/corpora';
import './globals.css';

export function generateMetadata(): Metadata {
  const corpus = getActiveCorpus();
  return {
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
