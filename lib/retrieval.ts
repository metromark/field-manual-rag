/**
 * Generic retrieval over one corpus namespace, plus the AI SDK tool that
 * exposes it to the model. Used by the chat route and the eval harness.
 */
import { embed, tool } from 'ai';
import { Index } from '@upstash/vector';
import { z } from 'zod';
import { embeddingModel } from './models';
import { docUrl, type ChunkMetadata, type CorpusConfig } from './corpus';

export type Source = {
  id: string;
  text: string;
  score: number;
  /** Short citation the model copies inline, e.g. "Chapter 6, p. 75" */
  cite: string;
  docTitle: string;
  page: number;
  pageEnd: number;
  group?: string;
  groupNum?: number;
  section?: string;
  subsection?: string;
  /** Deep link into the PDF */
  url: string;
};

/**
 * A group filter narrows but never excludes: the best unfiltered hits are
 * always merged in, so a wrong group guess (e.g. "Basic Survival Medicine"
 * for a question answered in "Cold Weather Survival") can't hide the answer.
 */
const UNFILTERED_ALWAYS = 3;

let index: Index | undefined;
const getIndex = () => (index ??= new Index());

function citeFor(corpus: CorpusConfig, m: ChunkMetadata) {
  const page = m.pageEnd > m.pdfPage ? `pp. ${m.pdfPage}–${m.pageEnd}` : `p. ${m.pdfPage}`;
  const prefix = corpus.documents.length > 1 ? `${m.docTitle}, ` : '';
  const group = corpus.groups && m.groupNum !== undefined ? `${corpus.groups.label} ${m.groupNum}, ` : '';
  return `${prefix}${group}${page}`;
}

export async function searchCorpus(
  corpus: CorpusConfig,
  query: string,
  opts: { group?: string; topK?: number; minScore?: number } = {},
): Promise<Source[]> {
  const topK = opts.topK ?? corpus.retrieval.topK;
  const minScore = opts.minScore ?? corpus.retrieval.minScore;
  const { embedding } = await embed({ model: embeddingModel, value: query });
  const ns = getIndex().namespace(corpus.id);

  const run = async (filter?: string) => {
    const hits = await ns.query<ChunkMetadata>({ vector: embedding, topK, includeMetadata: true, filter });
    return hits.filter((h) => h.metadata && h.score >= minScore);
  };

  let hits = await run();
  if (opts.group) {
    const filtered = await run(`group = '${opts.group.replace(/'/g, "\\'")}'`);
    const merged = new Map([...hits.slice(0, UNFILTERED_ALWAYS), ...filtered].map((h) => [h.id, h]));
    hits = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, topK + UNFILTERED_ALWAYS);
  }

  return hits.map((h) => {
    const m = h.metadata!;
    return {
      id: String(h.id),
      text: m.text,
      score: Math.round(h.score * 1000) / 1000,
      cite: citeFor(corpus, m),
      docTitle: m.docTitle,
      page: m.pdfPage,
      pageEnd: m.pageEnd,
      group: m.group,
      groupNum: m.groupNum,
      section: m.section,
      subsection: m.subsection,
      url: docUrl(corpus.id, m.file, m.pdfPage),
    };
  });
}

/** Builds the search tool from the corpus config: name, description, optional group filter. */
export function makeSearchTool(corpus: CorpusConfig) {
  const groupKey = corpus.groups?.label.toLowerCase();
  const base = z.object({
    query: z.string().min(2).max(300).describe('What to look up, phrased as a search query (a topic, term, or sub-question).'),
  });
  type SearchArgs = { query: string } & Record<string, string | undefined>;
  const parameters = (
    corpus.groups && groupKey
      ? base.extend({
          [groupKey]: z
            .enum(corpus.groups.values as [string, ...string[]])
            .optional()
            .describe(`Optional: restrict the search to one ${groupKey} when the question clearly belongs to it.`),
        })
      : base
  ) as z.ZodType<SearchArgs>;

  return tool({
    description: corpus.tool.description,
    parameters,
    execute: async (args: SearchArgs) => {
      const group = groupKey ? args[groupKey] : undefined;
      const sources = await searchCorpus(corpus, args.query, { group });
      return { sources };
    },
  });
}
