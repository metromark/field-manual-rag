import { defineCorpus } from '../../lib/corpus';

export default defineCorpus({
  id: 'ph-sb25',
  name: 'Senate Bill No. 25 · AI Regulation Act Explorer',
  shortName: 'S.B. No. 25',
  tagline: 'Ask about the proposed Philippine Artificial Intelligence Regulation Act (AIRA).',
  about:
    'Answers come only from Senate Bill No. 25 of the 20th Congress of the Philippines, which proposes the Artificial Intelligence Regulation Act: its policy, definitions, obligations, institutions, and penalties.',
  disclaimer: 'A filed bill, not enacted law. Not legal advice.',
  documents: [
    {
      file: 'ph-senate-bill-25-ai.pdf',
      docId: 'ph-sb25',
      title: 'Senate Bill No. 25 (20th Congress)',
      source: 'Senate of the Philippines, S. No. 25, 20th Congress, First Regular Session (2025).',
      license: 'Work of the Government of the Philippines; no copyright subsists (R.A. 8293, Sec. 176).',
    },
  ],
  systemPrompt: [
    'You answer questions about Philippine Senate Bill No. 25, the proposed Artificial Intelligence Regulation Act (AIRA).',
    'Cite the section number (e.g. "Sec. 5") along with the page when the retrieved text shows it.',
    'Remind the user that it is a bill, not enacted law, when they ask what is "required" or "illegal".',
  ].join(' '),
  tool: {
    name: 'searchBill',
    description:
      'Search the text of Philippine Senate Bill No. 25 (Artificial Intelligence Regulation Act) for passages about its policy, definitions, coverage, obligations of AI developers and deployers, government bodies, prohibited uses, and penalties. Call this for any substantive question about the bill. Do not call it for greetings or questions about what you can do.',
  },
  chunking: {
    strategy: 'fixed',
    size: 800,
    overlap: 100,
    // Margin line numbers: whole lines of digits, and the number prefixed to each text line.
    stripPatterns: [/^\d{1,2}$/, /^\d{1,2}\s+(?=\S)/],
  },
  retrieval: { topK: 4, minScore: 0.25 },
  ui: {
    promptChips: [
      'What does the bill mean by "AI"?',
      'What are the penalties for violations?',
      'Which government body would oversee AI?',
      'Hi, what can you do?',
    ],
    searchingLabel: 'Searching the bill…',
    placeholder: 'Ask about definitions, obligations, penalties…',
    openLabel: 'Open bill',
    accent: '#1e3a8a',
  },
});
