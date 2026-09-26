/**
 * Corpus configuration: everything corpus-specific lives in
 * corpora/<id>/corpus.config.ts. App code in lib/, app/ and components/
 * stays generic and reads only from this shape.
 */
import { z } from 'zod';

const regex = z.instanceof(RegExp);

const DocumentSchema = z.object({
  /** File name inside corpora/<id>/docs/ */
  file: z.string().min(1),
  docId: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  /** Where the document came from (URL or citation) */
  source: z.string().min(1),
  license: z.string().min(1),
  /** Inclusive 1-based PDF page range to index. Omit to index every page. */
  pageRange: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
});

const common = {
  /** Target characters per chunk */
  size: z.number().int().min(200),
  /** Characters carried over between consecutive chunks of the same section */
  overlap: z.number().int().min(0),
  /** Matched text is removed from each line; lines left empty are dropped (headers, footers, line numbers) */
  stripPatterns: z.array(regex).default([]),
};

const FixedChunking = z.object({ strategy: z.literal('fixed'), ...common });

const HeadingsChunking = z.object({
  strategy: z.literal('headings'),
  ...common,
  /** A chunk is not closed before reaching this length (avoids crumbs) */
  minChars: z.number().int().min(0).default(300),
  /** Starts a new group (e.g. a chapter). Capture 1 = group number. Title = following section-style lines. */
  groupPattern: regex,
  /** A top-level section heading line (e.g. ALL CAPS) */
  sectionPattern: regex,
  /** Heading-like lines that are really inline callouts (CAUTION, WARNING) */
  calloutPattern: regex.optional(),
  /** Start of a list item */
  listItemPattern: regex.default(/^(?:•|▪|\d+\.|[a-z]\.)\s*/),
  /** Detect short Title Case lines as subsection headings */
  subheadings: z.boolean().default(true),
});

export const CorpusConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Full product name shown in the header, e.g. "Field Manual 21-76 · Survival Assistant" */
  name: z.string().min(1),
  /** Short document name used in citations, e.g. "FM 21-76" */
  shortName: z.string().min(1),
  tagline: z.string().min(1),
  /** One or two sentences for the empty state describing what is covered */
  about: z.string().min(1),
  disclaimer: z.string().optional(),
  documents: z.array(DocumentSchema).min(1),
  /** Domain-specific instructions; generic grounding rules are added in code */
  systemPrompt: z.string().min(1),
  tool: z.object({
    name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
    description: z.string().min(1),
  }),
  /** Optional filter the model can pass to the search tool (e.g. a chapter) */
  groups: z
    .object({
      label: z.string().min(1),
      values: z.array(z.string().min(1)).min(1),
    })
    .optional(),
  chunking: z.discriminatedUnion('strategy', [FixedChunking, HeadingsChunking]),
  retrieval: z.object({
    topK: z.number().int().min(1).max(20),
    /** Hits below this cosine score are dropped before reaching the model */
    minScore: z.number().min(0).max(1),
  }),
  ui: z.object({
    promptChips: z.array(z.string().min(1)).max(8),
    /** Shown while the search tool runs, e.g. "Checking the manual…" */
    searchingLabel: z.string().min(1),
    placeholder: z.string().min(1),
    /** Label for the deep link, e.g. "Open manual" */
    openLabel: z.string().min(1),
  }),
});

export type CorpusConfigInput = z.input<typeof CorpusConfigSchema>;
export type CorpusConfig = z.output<typeof CorpusConfigSchema>;
export type HeadingsChunkingConfig = z.output<typeof HeadingsChunking>;
export type FixedChunkingConfig = z.output<typeof FixedChunking>;

/** Validates a corpus config at import time so mistakes fail loudly. */
export function defineCorpus(input: CorpusConfigInput): CorpusConfig {
  const parsed = CorpusConfigSchema.safeParse(input);
  if (!parsed.success) {
    const id = (input as { id?: string }).id ?? '(unknown)';
    throw new Error(`Invalid corpus config "${id}":\n${parsed.error.toString()}`);
  }
  return parsed.data;
}

/** Metadata stored with every vector. Optional fields depend on the chunking strategy. */
export type ChunkMetadata = {
  text: string;
  docId: string;
  docTitle: string;
  file: string;
  pdfPage: number;
  pageEnd: number;
  group?: string;
  groupNum?: number;
  section?: string;
  subsection?: string;
};

/** Public URL of a corpus document, optionally deep-linked to a page. */
export function docUrl(corpusId: string, file: string, page?: number) {
  const base = `/corpora/${corpusId}/${encodeURIComponent(file)}`;
  return page ? `${base}#page=${page}` : base;
}
