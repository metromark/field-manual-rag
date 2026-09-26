import 'server-only';
import { corpora } from '@/corpora/registry.generated';
import type { CorpusConfig } from './corpus';

const DEFAULT_CORPUS = 'fm21-76';

/** The corpus this deployment serves, chosen by the server-only CORPUS_ID env var. */
export function getActiveCorpus(): CorpusConfig {
  const id = process.env.CORPUS_ID || DEFAULT_CORPUS;
  const corpus = (corpora as Record<string, CorpusConfig>)[id];
  if (!corpus) {
    throw new Error(`Unknown CORPUS_ID "${id}". Available: ${Object.keys(corpora).join(', ')}`);
  }
  return corpus;
}
