import { ImageResponse } from 'next/og';
import { getActiveCorpus } from '@/lib/corpora';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Chat assistant preview';

export default function OpengraphImage() {
  const corpus = getActiveCorpus();
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#fafaf9',
          borderLeft: `28px solid ${corpus.ui.accent}`,
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 6, color: corpus.ui.accent, fontFamily: 'monospace' }}>
          {corpus.shortName.toUpperCase()}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 68, fontWeight: 700, color: '#1c1917', lineHeight: 1.1 }}>{corpus.name}</div>
          <div style={{ fontSize: 32, color: '#57534e', lineHeight: 1.35 }}>{corpus.tagline}</div>
        </div>
        <div style={{ fontSize: 24, color: '#78716c' }}>Answers cite the source page · Retrieval-augmented chat</div>
      </div>
    ),
    size,
  );
}
