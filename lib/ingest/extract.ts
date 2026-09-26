/**
 * Page-accurate PDF text extraction.
 *
 * pdf-parse joins pages with "\n\n", so splitting its output can't recover
 * page numbers. Instead we render each page ourselves via `pagerender` and
 * rebuild lines from text-item positions.
 */
import fs from 'node:fs/promises';
// Import the inner module: the package entry runs a self-test when it
// thinks it is the main module, which breaks under tsx/ESM.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export type PageText = { pdfPage: number; lines: string[] };

type TextItem = { str: string; width: number; transform: number[] };
type PdfPage = {
  pageIndex: number;
  getTextContent: () => Promise<{ items: TextItem[] }>;
};

/** Joins text items into lines, inserting a space only where there is a visible gap. */
function itemsToText(items: TextItem[]): string {
  let out = '';
  let lastY: number | undefined;
  let lastXEnd: number | undefined;
  for (const it of items) {
    const [, , , , x, y] = it.transform;
    if (lastY !== undefined && Math.abs(y - lastY) > 2) out += '\n';
    else if (lastXEnd !== undefined && x - lastXEnd > 1.5 && !out.endsWith(' ') && !it.str.startsWith(' ')) {
      out += ' ';
    }
    out += it.str;
    lastY = y;
    lastXEnd = x + it.width;
  }
  return out;
}

function cleanLine(line: string): string {
  return line
    .replace(/ /g, ' ')
    .replace(/\(\s*Figure\s+(\d+)\s*-\s*(\d+)\s*\)/g, '(Figure $1-$2)')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function extractPages(
  filePath: string,
  opts: { pageRange?: [number, number]; stripPatterns?: RegExp[] } = {},
): Promise<PageText[]> {
  const raw: string[] = [];
  await pdfParse(await fs.readFile(filePath), {
    pagerender: async (page: PdfPage) => {
      const { items } = await page.getTextContent();
      const text = itemsToText(items);
      raw[page.pageIndex] = text;
      return text;
    },
  });

  const [from, to] = opts.pageRange ?? [1, raw.length];
  const strip = opts.stripPatterns ?? [];
  const pages: PageText[] = [];
  for (let n = from; n <= Math.min(to, raw.length); n++) {
    const lines = (raw[n - 1] ?? '')
      .split('\n')
      .map((l) => cleanLine(strip.reduce((s, re) => s.replace(re, ''), cleanLine(l))))
      .filter((l) => l.length > 0);
    pages.push({ pdfPage: n, lines });
  }
  return pages;
}
