/**
 * Chunking strategies.
 *
 * - `fixed`: the starter's sentence-aware window, applied per page.
 * - `headings`: structure-aware. Splits on group (chapter) and section
 *   headings, prefers subsection boundaries, keeps a lead-in sentence
 *   together with the list that follows it, and folds CAUTION/WARNING
 *   callouts into the surrounding text instead of treating them as headings.
 *
 * Every chunk gets a context header ("Chapter 6: Water Procurement ›
 * Still Construction › Aboveground Still") that is embedded along with the
 * text, so short procedural chunks still retrieve on their topic.
 */
import type { CorpusConfig, FixedChunkingConfig, HeadingsChunkingConfig } from '../corpus';
import type { PageText } from './extract';

export type Chunk = {
  /** Stored and shown to the model/user */
  text: string;
  /** What gets embedded: context header + text */
  embedText: string;
  pdfPage: number;
  pageEnd: number;
  group?: string;
  groupNum?: number;
  section?: string;
  subsection?: string;
};

export type ChunkResult = { chunks: Chunk[]; warnings: string[] };

type Doc = CorpusConfig['documents'][number];

export function chunkDocument(corpus: CorpusConfig, doc: Doc, pages: PageText[]): ChunkResult {
  const c = corpus.chunking;
  return c.strategy === 'fixed'
    ? { chunks: chunkFixed(c, doc, pages), warnings: [] }
    : chunkByHeadings(c, corpus, doc, pages);
}

// ---------------------------------------------------------------------------
// fixed

function windowText(text: string, size: number, overlap: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(text.length, i + size);
    // Extend to the next sentence boundary if we're not at the end.
    if (end < text.length) {
      const m = text.slice(end, end + 200).match(/[.!?]\s/);
      if (m?.index !== undefined) end += m.index + 1;
    }
    const piece = text.slice(i, end).trim();
    if (piece) out.push(piece);
    if (end >= text.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return out;
}

function chunkFixed(c: FixedChunkingConfig, doc: Doc, pages: PageText[]): Chunk[] {
  return pages.flatMap(({ pdfPage, lines }) =>
    windowText(lines.join(' '), c.size, c.overlap).map((text) => ({
      text,
      embedText: `${doc.title} · page ${pdfPage}\n${text}`,
      pdfPage,
      pageEnd: pdfPage,
    })),
  );
}

// ---------------------------------------------------------------------------
// headings

type Line = { text: string; page: number };
type BlockKind = 'prose' | 'item' | 'callout' | 'subheading';
type Block = { kind: BlockKind; text: string; page: number; pageEnd: number; leadIn?: boolean };
type Section = { groupNum?: number; group?: string; section?: string; blocks: Block[] };
type Atom = Omit<Block, 'kind'> & { kind: BlockKind | 'list'; overlap?: boolean };

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
const SENTENCE_END = /[.!?]["')\]]?$/;
const LEAD_IN_END = /(?:--|:)$/;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) =>
      i > 0 && SMALL_WORDS.has(w) ? w : w.replace(/(^|[-/(])([a-z])/g, (_, p, ch) => p + ch.toUpperCase()),
    )
    .join(' ');
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?]["')\]]?)\s+(?=["'(]?[A-Z0-9])/).filter(Boolean);
}

/** Packs sentences into pieces of at most `size` chars (a single long sentence stays whole). */
function packSentences(text: string, size: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const s of splitSentences(text)) {
    if (cur && cur.length + 1 + s.length > size) {
      out.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}

function chunkByHeadings(c: HeadingsChunkingConfig, corpus: CorpusConfig, doc: Doc, pages: PageText[]): ChunkResult {
  const warnings: string[] = [];
  const lines: Line[] = pages.flatMap((p) => p.lines.map((text) => ({ text, page: p.pdfPage })));

  // Typical full line width, used to tell a paragraph's short last line from a wrapped one.
  const lengths = lines.map((l) => l.text.length).sort((a, b) => a - b);
  const shortLine = 0.8 * (lengths[Math.floor(lengths.length * 0.9)] ?? 80);

  const isCallout = (t: string) => !!c.calloutPattern?.test(t);
  const isSection = (t: string) => c.sectionPattern.test(t) && !isCallout(t);
  const isListItem = (t: string) => c.listItemPattern.test(t);

  const isSubheading = (i: number, atBoundary: boolean) => {
    const t = lines[i].text;
    const next = lines[i + 1]?.text;
    if (!c.subheadings || !atBoundary || !next) return false;
    if (t.length > 60 || t.split(' ').length > 9) return false;
    if (!/^[-"(]?[A-Z]/.test(t) || /[.,;:!?\-–—]$/.test(t) || isListItem(t)) return false;
    if (!/^["'(]?[A-Z0-9]/.test(next) && !isListItem(next)) return false;
    const words = t.split(/\s+/).filter((w) => w.length > 3);
    const capitalized = words.filter((w) => /^[-"(]?[A-Z]/.test(w)).length;
    return words.length === 0 || capitalized / words.length >= 0.6;
  };

  const matchGroup = (title: string) =>
    corpus.groups?.values.find((v) => norm(v) === norm(title));

  // --- Pass 1: lines -> sections of typed blocks --------------------------
  const sections: Section[] = [];
  let cur: Section = { blocks: [] };
  sections.push(cur);
  let open: Block | null = null; // prose/item block still accepting continuation lines
  let atBoundary = true;

  const startSection = (s: Omit<Section, 'blocks'>) => {
    cur = { ...s, blocks: [] };
    sections.push(cur);
    open = null;
    atBoundary = true;
  };
  const push = (b: Block) => {
    cur.blocks.push(b);
    return b;
  };

  for (let i = 0; i < lines.length; i++) {
    const { text: t, page } = lines[i];

    const gm = c.groupPattern.exec(t);
    if (gm) {
      const parts: string[] = [];
      let j = i + 1;
      // Consume title lines: always the first, then more while the title is still incomplete.
      while (j < lines.length && isSection(lines[j].text) && parts.length < 3) {
        const last = parts[parts.length - 1];
        const needMore =
          parts.length === 0 ||
          /(?:[,&-]|\bAND)$/.test(last) ||
          (corpus.groups !== undefined && !matchGroup(parts.join(' ')));
        if (!needMore) break;
        parts.push(lines[j].text);
        j++;
      }
      const raw = parts.join(' ');
      const group = matchGroup(raw) ?? titleCase(raw);
      if (corpus.groups && !matchGroup(raw)) warnings.push(`p.${page}: group "${raw}" not in groups.values`);
      startSection({ groupNum: gm[1] ? Number(gm[1]) : undefined, group });
      i = j - 1;
      continue;
    }

    if (isCallout(t)) {
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && body.length < 8) {
        body.push(lines[j].text);
        j++;
        if (SENTENCE_END.test(lines[j - 1].text)) break;
      }
      push({ kind: 'callout', text: `${t}: ${body.join(' ')}`, page, pageEnd: lines[j - 1]?.page ?? page });
      i = j - 1;
      open = null;
      atBoundary = true;
      continue;
    }

    if (isSection(t)) {
      startSection({ groupNum: cur.groupNum, group: cur.group, section: titleCase(t) });
      continue;
    }

    if (isSubheading(i, atBoundary)) {
      push({ kind: 'subheading', text: t, page, pageEnd: page });
      open = null;
      atBoundary = true;
      continue;
    }

    let block: Block;
    if (isListItem(t)) {
      block = push({ kind: 'item', text: t.replace(c.listItemPattern, '').trim(), page, pageEnd: page });
    } else if (open) {
      block = open;
      block.text += ` ${t}`;
      block.pageEnd = page;
    } else {
      block = push({ kind: 'prose', text: t, page, pageEnd: page });
    }

    const leadIn = LEAD_IN_END.test(t);
    const closed = leadIn || (SENTENCE_END.test(t) && t.length < shortLine);
    if (leadIn) block.leadIn = true;
    open = closed ? null : block;
    atBoundary = SENTENCE_END.test(t) || leadIn;
  }

  // --- Pass 2 + 3: blocks -> atoms -> chunks, per section -----------------
  const chunks: Chunk[] = [];
  const groupLabel = corpus.groups?.label ?? '';

  for (const s of sections) {
    if (s.blocks.length === 0) continue;
    const atoms = toAtoms(s.blocks, c.size);
    const header = (sub?: string) =>
      [
        s.group ? `${groupLabel}${s.groupNum !== undefined ? ` ${s.groupNum}` : ''}: ${s.group}`.trim() : doc.title,
        s.section,
        sub,
      ]
        .filter(Boolean)
        .join(' › ');

    const sectionChunks: Chunk[] = [];
    let buf: Atom[] = [];
    let activeSub: string | undefined;
    let chunkSub: string | undefined;
    const contentLen = () => buf.filter((a) => !a.overlap).reduce((n, a) => n + a.text.length + 1, 0);

    const flush = (withOverlap: boolean) => {
      const content = buf.filter((a) => !a.overlap);
      if (content.some((a) => a.kind !== 'subheading')) {
        const text = buf.map(renderAtom).join('\n');
        sectionChunks.push({
          text,
          embedText: `${header(chunkSub)}\n${text}`,
          pdfPage: content[0].page,
          pageEnd: Math.max(...content.map((a) => a.pageEnd)),
          group: s.group,
          groupNum: s.groupNum,
          section: s.section,
          subsection: chunkSub,
        });
      }
      const last = buf[buf.length - 1];
      buf = [];
      chunkSub = activeSub;
      if (withOverlap && last && last.kind === 'prose' && c.overlap > 0) {
        const tail: string[] = [];
        for (const sentence of splitSentences(last.text).reverse()) {
          if (tail.join(' ').length + sentence.length > c.overlap) break;
          tail.unshift(sentence);
        }
        if (tail.length) buf.push({ ...last, text: tail.join(' '), overlap: true });
      }
    };

    for (const a of atoms) {
      if (a.kind === 'subheading') {
        if (contentLen() >= c.minChars) flush(false);
        activeSub = a.text;
        if (contentLen() === 0) {
          buf = []; // drop overlap: a new subsection starts clean
          chunkSub = a.text;
        }
        buf.push(a);
        continue;
      }
      if (contentLen() > 0 && contentLen() + a.text.length > c.size) {
        // Prefer closing the chunk at the last subsection heading in the buffer.
        const k = buf.map((b) => b.kind).lastIndexOf('subheading');
        if (k > 0 && buf.slice(0, k).some((b) => !b.overlap)) {
          const tail = buf.slice(k);
          buf = buf.slice(0, k);
          flush(false);
          buf = tail;
          chunkSub = tail[0].text;
        }
        if (contentLen() + a.text.length > c.size && contentLen() >= c.minChars) flush(true);
      }
      buf.push(a);
    }
    flush(false);

    // Merge a crumb at the end of a section into its predecessor.
    const n = sectionChunks.length;
    if (n >= 2 && sectionChunks[n - 1].text.length < c.minChars) {
      const [prev, last] = [sectionChunks[n - 2], sectionChunks[n - 1]];
      if (prev.text.length + last.text.length <= c.size * 1.5) {
        prev.text += `\n${last.text}`;
        prev.embedText += `\n${last.text}`;
        prev.pageEnd = Math.max(prev.pageEnd, last.pageEnd);
        sectionChunks.pop();
      }
    }
    chunks.push(...sectionChunks);
  }

  return { chunks: mergeCrumbs(chunks, c.minChars, c.size * 1.5), warnings };
}

/**
 * Short sections (a chapter's intro paragraph, a one-list section) become
 * crumbs that retrieve poorly. Fold each into a neighbour in the same group,
 * keeping its heading inline.
 */
function mergeCrumbs(chunks: Chunk[], minChars: number, maxChars: number): Chunk[] {
  const withHeading = (c: Chunk) => (c.section && !c.text.startsWith(c.section) ? `${c.section}\n${c.text}` : c.text);
  const out: Chunk[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const cur = chunks[i];
    const prev = out[out.length - 1];
    const next = chunks[i + 1];
    if (cur.text.length >= minChars) {
      out.push(cur);
      continue;
    }
    if (prev && prev.group === cur.group && prev.text.length + cur.text.length <= maxChars) {
      const add = prev.section === cur.section ? cur.text : withHeading(cur);
      prev.text += `\n${add}`;
      prev.embedText += `\n${add}`;
      prev.pageEnd = Math.max(prev.pageEnd, cur.pageEnd);
    } else if (next && next.group === cur.group && next.text.length + cur.text.length <= maxChars) {
      const nextText = next.section === cur.section ? next.text : withHeading(next);
      const header = (cur.section ? cur : next).embedText.split('\n')[0];
      next.embedText = `${header}\n${cur.text}\n${nextText}`;
      next.text = `${cur.text}\n${nextText}`;
      next.pdfPage = cur.pdfPage;
      next.section = cur.section ?? next.section;
      next.subsection = cur.subsection ?? next.subsection;
    } else {
      out.push(cur);
    }
  }
  return out;
}

/** Groups blocks into packing units: a lead-in + its list stays together when it fits. */
function toAtoms(blocks: Block[], size: number): Atom[] {
  const atoms: Atom[] = [];
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    const startsList = b.kind === 'item' || (b.kind === 'prose' && b.leadIn && blocks[k + 1]?.kind === 'item');
    if (startsList) {
      const run: Block[] = [b];
      let m = k + 1;
      while (
        m < blocks.length &&
        (blocks[m].kind === 'item' || (blocks[m].kind === 'callout' && blocks[m + 1]?.kind === 'item'))
      ) {
        run.push(blocks[m]);
        m++;
      }
      const total = run.reduce((n, r) => n + r.text.length + 3, 0);
      if (total <= size * 2) {
        atoms.push({
          kind: 'list',
          text: run.map((r) => (r.kind === 'item' ? `• ${r.text}` : r.text)).join('\n'),
          page: run[0].page,
          pageEnd: Math.max(...run.map((r) => r.pageEnd)),
        });
        k = m - 1;
        continue;
      }
    }
    if (b.kind === 'prose' && b.text.length > size) {
      for (const piece of packSentences(b.text, size)) atoms.push({ ...b, text: piece });
    } else {
      atoms.push(b);
    }
  }
  return atoms;
}

function renderAtom(a: Atom): string {
  if (a.overlap) return `…${a.text}`;
  if (a.kind === 'item') return `• ${a.text}`;
  return a.text;
}
