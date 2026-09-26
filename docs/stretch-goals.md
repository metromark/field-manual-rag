# Stretch goals

Two stretch goals are claimed.

## 1. Suggested-prompt chips

The empty state shows clickable example questions that send immediately. They come from the corpus config (`ui.promptChips` in [`corpora/fm21-76/corpus.config.ts`](../corpora/fm21-76/corpus.config.ts)), so each corpus brings its own. The FM 21-76 chips cover four topic areas (water, cold-weather shelter, navigation, medicine) plus one greeting, "Hi, what can you do?", which shows the model answering without calling the search tool.

## 2. Evaluation harness

[`lib/eval.ts`](../lib/eval.ts) runs against a per-corpus ground-truth file ([`corpora/fm21-76/evals.json`](../corpora/fm21-76/evals.json)): 19 answerable questions with expected chapter and page span, 4 the manual can't answer, and 2 small-talk turns.

- **Retrieval mode** (`npm run eval -- --corpus fm21-76`): hit@1/3/5, MRR, how many correct passages would reach the model at the configured topK/minScore, and the score margin between the lowest correct hit and the highest out-of-scope hit.
- **Full mode** (`--full`): runs the same chat settings as production (shared `lib/chat.ts`) and checks, per question: was the tool called (and skipped for small talk), does an inline citation point to the expected page, was an out-of-scope question refused, and is every claim supported. A `gpt-4.1` judge extracts claims one by one, each with evidence from the retrieved passages.
- Options: `--topK`, `--minScore`, `--only`, plus `CHAT_MODEL` / `JUDGE_MODEL` env overrides. Results are saved as JSON in `scratch/`.

**What it changed:**

| Finding | Change |
|---|---|
| Out-of-scope questions score up to 0.74, above the lowest correct hit (0.73) | Kept `minScore` as a junk filter only; refusal is handled in the prompt |
| `gpt-4o-mini` reconstructed the figure-only Universal Edibility Test from memory | Default model changed to `gpt-4.1-mini`; per-passage figure warning added |
| topK 8 lowered groundedness for both models (19/23 and 18/23, vs 23/23 at topK 5) | topK stays at 5 |
| First judge design was noisy (yes/no + list) | Rewrote it to judge claim by claim with evidence |

Final configuration: 19/19 answerable, 4/4 refused, 2/2 small talk without a tool call, 23/23 grounded (single run).

## Also built (not claimed)

- **PDF deep links:** every citation chip and source card opens the PDF at the cited page (`#page=N`).
- **Multiple corpora from config:** a second corpus (Philippine Senate Bill No. 25) runs on the same code by setting `CORPUS_ID`.
