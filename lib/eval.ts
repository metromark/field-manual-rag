/**
 * Eval harness over corpora/<id>/evals.json.
 *
 *   npm run eval -- --corpus fm21-76           # retrieval: hit@1/3/5, MRR, score margins
 *   npm run eval -- --corpus fm21-76 --full    # + end-to-end chat: tool use, citations, refusals
 *
 * Options: --topK N and --minScore X override the corpus config; --only id1,id2
 * runs a subset. Results are written to scratch/eval-<corpus>-<mode>-<time>.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateObject, generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { arg, corpusDir, flag, loadCorpusFromArgs, requireEnv } from './ingest/cli';
import { searchCorpus, type Source } from './retrieval';
import { chatSettings } from './chat';
import { CHAT_MODEL_ID } from './models';
import type { CorpusConfig } from './corpus';

type EvalQuestion = {
  id: string;
  question: string;
  group?: string;
  pages?: [number, number];
  answerable?: boolean;
  smalltalk?: boolean;
};
type Kind = 'answerable' | 'unanswerable' | 'smalltalk';

const kindOf = (q: EvalQuestion): Kind =>
  q.smalltalk ? 'smalltalk' : q.answerable === false ? 'unanswerable' : 'answerable';

/** Depth used to find where the right passage ranks, independent of the configured topK. */
const DIAG_K = 10;

const JUDGE_MODEL = process.env.JUDGE_MODEL || 'gpt-4.1';

/** "FM 21-76 does not cover…" as the opening sentence. Only the first sentence is checked, so "Do not give…" steps don't match. */
const REFUSAL_LEAD =
  /\b(?:does not|doesn't|do not|don't|did not|can't|cannot)\s+(?:\w+\s+){0,2}(?:cover|contain|include|mention|provide|address|discuss|give|specify|help)|not covered|no (?:information|guidance)/i;
const firstSentence = (s: string) => s.split(/(?<=[.!?])\s/)[0] ?? s;

const JudgeSchema = z.object({
  mainMessage: z
    .enum(['answers', 'partly-answers', 'declines'])
    .describe(
      '"declines" if the answer\'s main message is that the source does not cover or does not answer the question (even if it then mentions related topics); "partly-answers" if it answers part and says the rest is not covered; otherwise "answers"',
    ),
  claims: z
    .array(
      z.object({
        claim: z.string().describe('one factual claim, number, step, or piece of advice from the answer'),
        evidence: z.string().describe('the passage number(s) and a short quote that support it, or "none"'),
        supported: z.boolean(),
      }),
    )
    .describe('every substantive claim in the answer, in order'),
});

/**
 * LLM-as-judge: is every claim in the answer supported by the passages the
 * model actually retrieved? Claim-by-claim with evidence, which is far more
 * consistent than asking for a single yes/no plus a list.
 */
async function judge(corpus: CorpusConfig, question: string, answer: string, sources: Source[]) {
  const passages = sources.length
    ? sources.map((s, i) => `[${i + 1}] (${s.cite})\n${s.text}`).join('\n\n')
    : '(no passages were retrieved)';
  const { object } = await generateObject({
    model: openai(JUDGE_MODEL),
    schema: JudgeSchema,
    temperature: 0,
    maxRetries: 8, // low-tier accounts hit tokens-per-minute limits on the judge model
    prompt: `You audit a retrieval-augmented assistant for ${corpus.shortName}. It must answer ONLY from the source passages below, which are excerpts of ${corpus.shortName}.

Question: ${question}

Source passages:
${passages}

Answer to audit:
${answer}

Extract each substantive claim from the answer and decide whether the passages support it. A claim is supported if a passage states it or it is a faithful paraphrase or summary.

Do NOT extract these (they are not substantive claims):
- attribution or meta statements ("per ${corpus.shortName}", the document's name or date, "see Figure 9-5 in the manual");
- statements about what the source does or does not cover, including a one-line description of its general scope;
- suggestions of other questions to ask, and generic referrals ("seek medical help", "consult the manufacturer").

If no passages were retrieved, every substantive claim is unsupported.`,
  });
  const unsupported = object.claims.filter((c) => !c.supported).map((c) => c.claim);
  return { mainMessage: object.mainMessage, grounded: unsupported.length === 0, unsupported };
}

const overlaps = (a: [number, number], b: [number, number]) => a[0] <= b[1] && a[1] >= b[0];
const isHit = (q: EvalQuestion, s: Source) =>
  !!q.pages && overlaps([s.page, s.pageEnd], q.pages) && (!q.group || s.group === q.group);

/** Page ranges cited inline, e.g. "[Chapter 6, pp. 78–79]" → [[78, 79]] */
function citedRanges(answer: string): [number, number][] {
  const out: [number, number][] = [];
  for (const [, inner] of answer.matchAll(/\[([^\]]+)\]/g)) {
    for (const m of inner.matchAll(/pp?\.\s*(\d+)(?:\s*[–-]\s*(\d+))?/g)) {
      out.push([Number(m[1]), Number(m[2] ?? m[1])]);
    }
  }
  return out;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : 'n/a');
const pad = (s: string | number, n: number) => String(s).padEnd(n);

async function retrievalEval(corpus: CorpusConfig, questions: EvalQuestion[]) {
  const { topK, minScore } = corpus.retrieval;
  const rows = await pool(questions.filter((q) => kindOf(q) !== 'smalltalk'), 4, async (q) => {
    const sources = await searchCorpus(corpus, q.question, { topK: DIAG_K, minScore: 0 });
    const rank = kindOf(q) === 'answerable' ? sources.findIndex((s) => isHit(q, s)) + 1 : 0;
    const top = sources[0];
    const hitScore = rank ? sources[rank - 1].score : undefined;
    return {
      id: q.id,
      kind: kindOf(q),
      rank,
      inContext: rank > 0 && rank <= topK && (hitScore ?? 0) >= minScore,
      topScore: top?.score ?? 0,
      topCite: top ? `${top.cite} · ${top.section ?? ''}` : '',
      hitScore,
    };
  });

  console.log(`\n${pad('id', 20)}${pad('rank', 6)}${pad('top', 7)}top source`);
  for (const r of rows) {
    const rank = r.kind === 'answerable' ? (r.rank ? String(r.rank) : '✗') : '—';
    console.log(`${pad(r.id, 20)}${pad(rank, 6)}${pad(r.topScore.toFixed(3), 7)}${r.topCite}`);
  }

  const ans = rows.filter((r) => r.kind === 'answerable');
  const una = rows.filter((r) => r.kind === 'unanswerable');
  const at = (k: number) => ans.filter((r) => r.rank > 0 && r.rank <= k).length;
  const mrr = ans.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / (ans.length || 1);
  const minHit = Math.min(...ans.filter((r) => r.hitScore !== undefined).map((r) => r.hitScore!));
  const maxUna = Math.max(...una.map((r) => r.topScore));

  const summary = {
    answerable: ans.length,
    hitAt1: at(1) / ans.length,
    hitAt3: at(3) / ans.length,
    hitAt5: at(5) / ans.length,
    mrr,
    inContext: ans.filter((r) => r.inContext).length / ans.length,
    lowestCorrectScore: minHit,
    highestUnanswerableScore: una.length ? maxUna : null,
  };
  console.log(
    `\nhit@1 ${pct(at(1), ans.length)} · hit@3 ${pct(at(3), ans.length)} · hit@5 ${pct(at(5), ans.length)} · MRR ${mrr.toFixed(3)}` +
      ` · reaches the model (topK ${topK}, minScore ${minScore}): ${pct(ans.filter((r) => r.inContext).length, ans.length)}`,
  );
  console.log(
    `lowest score of a correct hit: ${minHit.toFixed(3)} · highest top score on unanswerable: ${una.length ? maxUna.toFixed(3) : 'n/a'}`,
  );
  return { rows, summary };
}

async function fullEval(corpus: CorpusConfig, questions: EvalQuestion[]) {
  const settings = chatSettings(corpus);
  const rows = await pool(questions, 3, async (q) => {
    const r = await generateText({ ...settings, messages: [{ role: 'user', content: q.question }] });
    const calls = r.steps.flatMap((s) => s.toolCalls);
    const sources = r.steps
      .flatMap((s) => s.toolResults)
      .flatMap((t) => ((t as { result?: { sources?: Source[] } }).result?.sources ?? []));
    const cites = citedRanges(r.text);
    const kind = kindOf(q);
    const verdict = kind === 'smalltalk' ? undefined : await judge(corpus, q.question, r.text, sources);
    // Out-of-scope: saying "not covered" and then pointing to related topics still counts as a refusal.
    const refused =
      kind === 'unanswerable'
        ? verdict?.mainMessage !== 'answers' || REFUSAL_LEAD.test(firstSentence(r.text))
        : verdict?.mainMessage === 'declines';
    const pass =
      kind === 'smalltalk'
        ? calls.length === 0
        : kind === 'unanswerable'
          ? refused
          : calls.length > 0 && !refused && cites.length > 0 && cites.some((c) => overlaps(c, q.pages!));
    return {
      id: q.id,
      kind,
      pass,
      grounded: verdict?.grounded,
      unsupported: verdict?.unsupported ?? [],
      toolCalls: calls.map((c) => c.args),
      retrievedHit: kind === 'answerable' ? sources.some((s) => isHit(q, s)) : undefined,
      cites,
      refused,
      answer: r.text,
    };
  });

  console.log(`\n${pad('id', 20)}${pad('kind', 14)}${pad('pass', 6)}${pad('grnd', 6)}${pad('tool', 6)}detail`);
  for (const r of rows) {
    const detail =
      r.kind === 'answerable'
        ? `retrieved ${r.retrievedHit ? '✓' : '✗'} · cites ${r.cites.map((c) => (c[0] === c[1] ? c[0] : `${c[0]}-${c[1]}`)).join(',') || 'none'}${r.refused ? ' · REFUSED' : ''}`
        : r.kind === 'unanswerable'
          ? r.refused ? 'refused' : `ANSWERED: ${r.answer.slice(0, 80).replace(/\n/g, ' ')}…`
          : r.toolCalls.length ? 'called tool unnecessarily' : 'no tool call';
    const grnd = r.grounded === undefined ? '—' : r.grounded ? '✓' : '✗';
    console.log(`${pad(r.id, 20)}${pad(r.kind, 14)}${pad(r.pass ? '✓' : '✗', 6)}${pad(grnd, 6)}${pad(r.toolCalls.length, 6)}${detail}`);
    for (const u of r.unsupported) console.log(`${' '.repeat(26)}unsupported: ${u}`);
  }

  const by = (k: Kind) => rows.filter((r) => r.kind === k);
  const passed = (k: Kind) => by(k).filter((r) => r.pass).length;
  const judged = rows.filter((r) => r.grounded !== undefined);
  const grounded = judged.filter((r) => r.grounded).length;
  const summary = {
    answerablePass: passed('answerable') / (by('answerable').length || 1),
    unanswerableRefused: passed('unanswerable') / (by('unanswerable').length || 1),
    smalltalkNoTool: passed('smalltalk') / (by('smalltalk').length || 1),
    grounded: grounded / (judged.length || 1),
  };
  console.log(
    `\nanswerable (tool + correct citation): ${passed('answerable')}/${by('answerable').length}` +
      ` · unanswerable refused: ${passed('unanswerable')}/${by('unanswerable').length}` +
      ` · small talk without tool: ${passed('smalltalk')}/${by('smalltalk').length}` +
      ` · grounded (judge ${JUDGE_MODEL}): ${grounded}/${judged.length}`,
  );
  return { rows, summary };
}

async function main() {
  requireEnv('OPENAI_API_KEY', 'UPSTASH_VECTOR_REST_URL', 'UPSTASH_VECTOR_REST_TOKEN');
  let corpus = await loadCorpusFromArgs();
  const topK = arg('topK');
  const minScore = arg('minScore');
  corpus = {
    ...corpus,
    retrieval: {
      topK: topK ? Number(topK) : corpus.retrieval.topK,
      minScore: minScore ? Number(minScore) : corpus.retrieval.minScore,
    },
  };

  const file = path.join(corpusDir(corpus.id), 'evals.json');
  let { questions } = JSON.parse(fs.readFileSync(file, 'utf8')) as { questions: EvalQuestion[] };
  const only = arg('only')?.split(',');
  if (only) questions = questions.filter((q) => only.includes(q.id));

  const full = flag('full');
  console.log(
    `Eval ${corpus.id}: ${questions.length} questions · topK ${corpus.retrieval.topK} · minScore ${corpus.retrieval.minScore}` +
      (full ? ` · model ${CHAT_MODEL_ID}` : ''),
  );

  const retrieval = await retrievalEval(corpus, questions);
  const chat = full ? await fullEval(corpus, questions) : undefined;

  const out = path.join(process.cwd(), 'scratch', `eval-${corpus.id}-${full ? 'full' : 'retrieval'}-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify({ corpus: corpus.id, retrieval: corpus.retrieval, model: full ? CHAT_MODEL_ID : undefined, results: { retrieval, chat } }, null, 2),
  );
  console.log(`\nSaved ${path.relative(process.cwd(), out)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
