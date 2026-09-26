/** Shared helpers for the seed/eval command-line scripts. */
import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import type { CorpusConfig } from '../corpus';

// Next.js reads .env.local automatically; standalone scripts do not.
loadEnv({ path: path.join(process.cwd(), '.env.local') });

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export const flag = (name: string) => process.argv.includes(`--${name}`);

export function requireEnv(...names: string[]) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`Missing ${missing.join(', ')}. Copy .env.example to .env.local and fill it in.`);
    process.exit(1);
  }
}

export const corpusDir = (id: string) => path.join(process.cwd(), 'corpora', id);

/** Loads corpora/<id>/corpus.config.ts. The id comes from --corpus, then CORPUS_ID, then the default. */
export async function loadCorpusFromArgs(): Promise<CorpusConfig> {
  const id = arg('corpus') ?? process.env.CORPUS_ID ?? 'fm21-76';
  const file = path.join(corpusDir(id), 'corpus.config.ts');
  if (!fs.existsSync(file)) {
    console.error(`Corpus "${id}" not found: expected ${path.relative(process.cwd(), file)}`);
    process.exit(1);
  }
  const mod = await import(file);
  return (mod.default?.default ?? mod.default) as CorpusConfig;
}
