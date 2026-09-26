/**
 * Seeds one corpus into its own Upstash Vector namespace.
 *
 *   npm run seed -- --corpus fm21-76            # extract, chunk, embed, upsert
 *   npm run seed -- --corpus fm21-76 --dry-run  # extract + chunk only; writes scratch/chunks-<id>.jsonl
 *
 * The namespace is reset first, so re-seeding never leaves stale chunks behind.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Index } from '@upstash/vector';
import { embedMany } from 'ai';
import { flag, loadCorpusFromArgs, corpusDir, requireEnv } from './cli';
import { extractPages } from './extract';
import { chunkDocument, type Chunk } from './chunk';
import { EMBEDDING_DIMS, embeddingModel } from '../models';
import type { ChunkMetadata, CorpusConfig } from '../corpus';

type Record = { id: string; chunk: Chunk; doc: CorpusConfig['documents'][number] };

const EMBED_BATCH = 100;
const UPSERT_BATCH = 100;

function summarize(corpus: CorpusConfig, records: Record[]) {
  const lens = records.map((r) => r.chunk.text.length).sort((a, b) => a - b);
  const pct = (p: number) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))];
  const pages = new Set(records.map((r) => `${r.doc.docId}:${r.chunk.pdfPage}`));
  console.log(`\n${records.length} chunks · ${pages.size} distinct start pages`);
  console.log(`chunk chars  min ${lens[0]} · p10 ${pct(0.1)} · median ${pct(0.5)} · p90 ${pct(0.9)} · max ${lens[lens.length - 1]}`);

  if (corpus.groups) {
    const byGroup = new Map<string, number>();
    for (const r of records) byGroup.set(r.chunk.group ?? '(none)', (byGroup.get(r.chunk.group ?? '(none)') ?? 0) + 1);
    console.log(`\nchunks per ${corpus.groups.label.toLowerCase()}:`);
    for (const g of [...corpus.groups.values, '(none)']) {
      const n = byGroup.get(g);
      if (n || g !== '(none)') console.log(`  ${String(n ?? 0).padStart(4)}  ${g}${n ? '' : '   ⚠ missing'}`);
    }
  }

  console.log('\nsamples:');
  for (const r of [records[0], records[Math.floor(records.length / 2)], records[records.length - 1]]) {
    console.log(`--- ${r.id}  (pp. ${r.chunk.pdfPage}–${r.chunk.pageEnd})`);
    console.log(r.chunk.embedText.slice(0, 400));
  }
}

async function main() {
  const corpus = await loadCorpusFromArgs();
  const dryRun = flag('dry-run');
  if (!dryRun) requireEnv('OPENAI_API_KEY', 'UPSTASH_VECTOR_REST_URL', 'UPSTASH_VECTOR_REST_TOKEN');

  console.log(`Corpus: ${corpus.id} (${corpus.chunking.strategy}, size ${corpus.chunking.size}, overlap ${corpus.chunking.overlap})`);

  const records: Record[] = [];
  for (const doc of corpus.documents) {
    const file = path.join(corpusDir(corpus.id), 'docs', doc.file);
    const pages = await extractPages(file, { pageRange: doc.pageRange, stripPatterns: corpus.chunking.stripPatterns });
    const { chunks, warnings } = chunkDocument(corpus, doc, pages);
    warnings.forEach((w) => console.warn(`  ⚠ ${doc.file} ${w}`));
    console.log(`  ${doc.file}: ${pages.length} pages → ${chunks.length} chunks`);
    chunks.forEach((chunk, i) =>
      records.push({ id: `${doc.docId}-${String(i).padStart(4, '0')}-p${chunk.pdfPage}`, chunk, doc }),
    );
  }
  if (records.length === 0) throw new Error('No chunks produced. Check the PDF has a text layer and pageRange.');

  summarize(corpus, records);

  if (dryRun) {
    const out = path.join(process.cwd(), 'scratch', `chunks-${corpus.id}.jsonl`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, records.map((r) => JSON.stringify({ id: r.id, ...r.chunk })).join('\n'));
    console.log(`\nDry run: wrote ${path.relative(process.cwd(), out)}. Nothing embedded.`);
    return;
  }

  const index = new Index();
  const info = await index.info();
  if (info.dimension !== EMBEDDING_DIMS) {
    throw new Error(
      `Upstash index has ${info.dimension} dimensions; expected ${EMBEDDING_DIMS} for text-embedding-3-small. ` +
        'Create an index with 1536 dimensions, COSINE metric, and no built-in embedding model.',
    );
  }
  const ns = index.namespace(corpus.id);

  console.log(`\nEmbedding ${records.length} chunks…`);
  const vectors: number[][] = [];
  for (let i = 0; i < records.length; i += EMBED_BATCH) {
    const batch = records.slice(i, i + EMBED_BATCH);
    const { embeddings } = await embedMany({ model: embeddingModel, values: batch.map((r) => r.chunk.embedText) });
    vectors.push(...embeddings);
    process.stdout.write(`  ${Math.min(i + EMBED_BATCH, records.length)}/${records.length}\r`);
  }

  console.log(`\nResetting namespace "${corpus.id}" and upserting…`);
  await ns.reset();
  for (let i = 0; i < records.length; i += UPSERT_BATCH) {
    await ns.upsert(
      records.slice(i, i + UPSERT_BATCH).map((r, j) => {
        const { chunk, doc } = r;
        const metadata: ChunkMetadata = {
          text: chunk.text,
          docId: doc.docId,
          docTitle: doc.title,
          file: doc.file,
          pdfPage: chunk.pdfPage,
          pageEnd: chunk.pageEnd,
          ...(chunk.group && { group: chunk.group }),
          ...(chunk.groupNum !== undefined && { groupNum: chunk.groupNum }),
          ...(chunk.section && { section: chunk.section }),
          ...(chunk.subsection && { subsection: chunk.subsection }),
        };
        return { id: r.id, vector: vectors[i + j], metadata };
      }),
    );
  }
  console.log(`✅ Seeded ${records.length} chunks into namespace "${corpus.id}".`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
