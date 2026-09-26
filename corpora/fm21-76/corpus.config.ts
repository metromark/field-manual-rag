import { defineCorpus } from '../../lib/corpus';

export default defineCorpus({
  id: 'fm21-76',
  name: 'Field Manual 21-76 · Survival Assistant',
  shortName: 'FM 21-76',
  tagline: 'Ask the 1992 U.S. Army Survival manual. Every answer cites the chapter and page.',
  about:
    'Answers come only from FM 21-76 Survival (June 1992), chapters 1–23: survival medicine, shelters, water, fire, food, plants and animals, desert, tropical, cold and sea survival, water crossings, direction finding, signaling, evasion, and man-made hazards.',
  disclaimer:
    'Historical military reference from 1992. Not medical advice or emergency guidance. In an emergency, contact local emergency services.',
  documents: [
    {
      file: 'fm21-76-survival.pdf',
      docId: 'fm21-76',
      title: 'FM 21-76 Survival (1992)',
      source:
        'Headquarters, Department of the Army, FM 21-76 / MCRP 3-02F "Survival", 5 June 1992. Copy from the Internet Archive: https://archive.org/details/MCRP_3-02F_FM_21-76_Survival (trimmed to PDF pages 1–307; appendices removed).',
      license: 'U.S. Government work, not subject to copyright in the United States (17 U.S.C. § 105).',
      // Chapters 1–23. Pages 1–3 are cover/preface/signature; 308+ are appendices (plant and snake catalogues).
      pageRange: [4, 307],
    },
  ],
  systemPrompt: [
    'You answer questions using U.S. Army Field Manual FM 21-76, Survival (1992).',
    'Attribute guidance to the manual, e.g. "Per FM 21-76, …".',
    'For medical, first-aid, and edible-plant questions, report only what the manual says, mention that the guidance dates from 1992, and advise seeking professional medical help or emergency services when available.',
    'Keep the manual\'s units (metric). When a passage refers to a figure (e.g. "Figure 6-6"), mention the figure number so the reader can open it in the PDF; you cannot see figures yourself.',
    'Keep procedures as numbered or bulleted steps in the manual\'s order.',
  ].join(' '),
  tool: {
    name: 'searchManual',
    description:
      'Search FM 21-76 (U.S. Army Survival manual, 1992) for passages relevant to a survival question: first aid and survival medicine, shelters, finding and purifying water, firecraft, food procurement, edible/poisonous plants, dangerous animals, improvised tools and weapons, desert/tropical/cold/sea survival, water crossings, direction finding, signaling, evasion, camouflage, and nuclear/biological/chemical hazards. Call this for any substantive question about survival techniques. Do not call it for greetings, small talk, or questions about what you can do.',
  },
  groups: {
    label: 'Chapter',
    values: [
      'Introduction',
      'Psychology of Survival',
      'Survival Planning and Survival Kits',
      'Basic Survival Medicine',
      'Shelters',
      'Water Procurement',
      'Firecraft',
      'Food Procurement',
      'Survival Use of Plants',
      'Poisonous Plants',
      'Dangerous Animals',
      'Field-Expedient Weapons, Tools, and Equipment',
      'Desert Survival',
      'Tropical Survival',
      'Cold Weather Survival',
      'Sea Survival',
      'Expedient Water Crossings',
      'Field-Expedient Direction Finding',
      'Signaling Techniques',
      'Survival Movement in Hostile Areas',
      'Camouflage',
      'Contact with People',
      'Survival in Man-Made Hazards',
    ],
  },
  chunking: {
    strategy: 'headings',
    size: 1200,
    overlap: 200,
    minChars: 400,
    groupPattern: /^CHAPTER (\d+)$/,
    // ALL-CAPS line with at least four capital letters, e.g. "STILL CONSTRUCTION"
    sectionPattern: /^(?=(?:[^A-Z]*[A-Z]){4})[A-Z0-9][A-Z0-9 ,.'’()/&-]*$/,
    calloutPattern: /^(?:CAUTION|WARNING|NOTE)S?$/,
    subheadings: true,
  },
  retrieval: { topK: 5, minScore: 0.3 },
  ui: {
    promptChips: [
      'How do I purify water without tablets?',
      'How do I build a shelter in snow?',
      'How do I find north without a compass?',
      'What are the signs of hypothermia?',
      'Hi, what can you do?',
    ],
    searchingLabel: 'Checking the manual…',
    placeholder: 'Ask about water, shelter, fire, first aid, navigation…',
    openLabel: 'Open manual',
  },
});
