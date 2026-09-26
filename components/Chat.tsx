'use client';

import { useChat } from '@ai-sdk/react';
import type { ToolInvocation, UIMessage } from 'ai';
import { useEffect, useRef, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import type { Source } from '@/lib/retrieval';
import type { ChatUI } from '@/lib/ui';

// Matches inline citations such as "[Chapter 6, p. 75]" or "[Chapter 13, pp. 175–176; Chapter 13, p. 173]".
const CITATION = /\[([^[\]]*?\bpp?\.\s*\d+[^[\]]*)\]/g;

/** "#4d5a2c" → "77 90 44", the format Tailwind's accent color expects. */
const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');

function readMessage(m: UIMessage) {
  const text = m.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('');
  const invocations: ToolInvocation[] = m.parts.flatMap((p) => (p.type === 'tool-invocation' ? [p.toolInvocation] : []));
  const seen = new Set<string>();
  const sources = invocations
    .flatMap((inv) => (inv.state === 'result' ? ((inv.result?.sources as Source[] | undefined) ?? []) : []))
    .filter((s) => !seen.has(s.id) && seen.add(s.id));
  const pending = invocations.find((inv) => inv.state !== 'result');
  return { text, sources, pending };
}

/** Pages cited inline in the answer text. */
function citedPages(text: string): number[] {
  const pages: number[] = [];
  for (const [, inner] of text.matchAll(CITATION)) {
    for (const m of inner.matchAll(/pp?\.\s*(\d+)/g)) pages.push(Number(m[1]));
  }
  return pages;
}

/** Turns inline citations into markdown links that open the PDF at the cited page. */
function linkCitations(text: string, sources: Source[], fallbackUrl: string): string {
  return text.replace(CITATION, (_, inner: string) =>
    inner
      .split(/;\s*/)
      .map((part) => {
        const m = part.match(/pp?\.\s*(\d+)/);
        if (!m) return part;
        const page = Number(m[1]);
        const src = sources.find((s) => page >= s.page && page <= s.pageEnd) ?? sources[0];
        const base = (src?.url ?? fallbackUrl).split('#')[0];
        return `[${part.trim()}](${base}#page=${page})`;
      })
      .join(' '),
  );
}

const markdown: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1.5 pl-5 last:mb-0">{children}</ol>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1.5 pl-5 last:mb-0">{children}</ul>,
  strong: ({ children }) => <strong className="font-semibold text-stone-900">{children}</strong>,
  h1: ({ children }) => <p className="mb-2 font-semibold">{children}</p>,
  h2: ({ children }) => <p className="mb-2 font-semibold">{children}</p>,
  h3: ({ children }) => <p className="mb-2 font-semibold">{children}</p>,
  a: ({ href, children }) =>
    href?.includes('#page=') ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mx-0.5 inline-block whitespace-nowrap rounded border border-accent/30 bg-accent/10 px-1.5 py-px align-baseline font-mono text-[0.72em] text-accent no-underline hover:bg-accent/20"
        title="Open this page of the PDF"
      >
        {children}
      </a>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline">
        {children}
      </a>
    ),
};

function SourceCard({ s, ui }: { s: Source; ui: ChatUI }) {
  const pages = s.pageEnd > s.page ? `pp. ${s.page}–${s.pageEnd}` : `p. ${s.page}`;
  return (
    <li className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {s.groupNum !== undefined && (
          <span className="rounded bg-accent px-1.5 py-0.5 font-mono font-medium uppercase tracking-wide text-white">
            {ui.groupLabel ? `${ui.groupLabel.slice(0, 2)} ${s.groupNum}` : s.groupNum}
          </span>
        )}
        {s.group && <span className="font-medium text-stone-800">{s.group}</span>}
        <span className="font-mono text-stone-500">{pages}</span>
        <span className="ml-auto font-mono text-stone-400" title="Similarity score">
          {s.score.toFixed(2)}
        </span>
      </div>
      {s.section && (
        <p className="mt-1 text-sm text-stone-600">
          {s.section}
          {s.subsection && <span className="text-stone-400"> › {s.subsection}</span>}
        </p>
      )}
      <details className="group mt-2">
        <summary className="cursor-pointer select-none text-xs text-stone-500 hover:text-stone-800">Show passage</summary>
        <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-line border-l-2 border-stone-200 pl-3 text-sm leading-relaxed text-stone-700">
          {s.text}
        </p>
      </details>
      <a
        href={s.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
      >
        {ui.openLabel} p. {s.page} ↗
      </a>
    </li>
  );
}

function Sources({ sources, text, ui }: { sources: Source[]; text: string; ui: ChatUI }) {
  if (sources.length === 0) return null;
  const pages = citedPages(text);
  const isCited = (s: Source) => pages.some((p) => p >= s.page && p <= s.pageEnd);
  const cited = sources.filter(isCited);
  const others = sources.filter((s) => !isCited(s));
  const primary = cited.length ? cited : others;
  const rest = cited.length ? others : [];

  return (
    <div className="mt-3 w-full">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-500">
        {cited.length ? `Sources cited (${cited.length})` : `Passages retrieved (${others.length})`}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {primary.map((s) => (
          <SourceCard key={s.id} s={s} ui={ui} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer select-none text-xs text-stone-500 hover:text-stone-800">
            {rest.length} more passage{rest.length > 1 ? 's' : ''} retrieved but not cited
          </summary>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {rest.map((s) => (
              <SourceCard key={s.id} s={s} ui={ui} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Indicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-stone-500" role="status">
      <span className="flex gap-1">
        {[0, 150, 300].map((d) => (
          <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
      {label}
    </div>
  );
}

export default function Chat({ ui }: { ui: ChatUI }) {
  const { messages, input, setInput, handleInputChange, handleSubmit, append, status, error, reload, stop, setMessages } =
    useChat({ api: '/api/chat' });
  const bottom = useRef<HTMLDivElement>(null);
  const busy = status === 'submitted' || status === 'streaming';
  const docUrl = ui.documents[0]?.url ?? '#';

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, status]);

  const ask = (q: string) => {
    if (!busy) append({ role: 'user', content: q });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (input.trim() && !busy) handleSubmit();
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim() && !busy) handleSubmit(e);
  };

  const last = messages[messages.length - 1];
  const lastInfo = last?.role === 'assistant' ? readMessage(last) : undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-stone-50" style={{ '--accent-rgb': hexToRgb(ui.accent) } as CSSProperties}>
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <div className="h-8 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-lg font-semibold text-stone-900">{ui.name}</h1>
            <p className="truncate text-xs text-stone-500">{ui.tagline}</p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => {
                stop();
                setMessages([]);
                setInput('');
              }}
              className="shrink-0 rounded-md border border-stone-300 px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-100"
            >
              New chat
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {messages.length === 0 ? (
          <section className="mx-auto max-w-xl pt-6 text-center sm:pt-12">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">{ui.shortName}</p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">What do you need to know?</h2>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">{ui.about}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {ui.promptChips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => ask(chip)}
                  className="rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-sm text-stone-700 shadow-sm transition hover:border-accent hover:text-accent"
                >
                  {chip}
                </button>
              ))}
            </div>
            <p className="mt-8 text-xs text-stone-500">
              Answers cite page numbers. Click a citation to open that page of the{' '}
              <a href={docUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-800">
                source PDF
              </a>
              .
            </p>
          </section>
        ) : (
          <ul className="space-y-6">
            {messages.map((m) => {
              if (m.role === 'user') {
                return (
                  <li key={m.id} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-stone-800 px-4 py-2.5 text-[15px] text-white">
                      {m.content}
                    </p>
                  </li>
                );
              }
              const { text, sources, pending } = readMessage(m);
              return (
                <li key={m.id} className="flex flex-col items-start">
                  {pending && (
                    <Indicator
                      label={`${ui.searchingLabel}${pending.args?.query ? ` “${pending.args.query}”` : ''}`}
                    />
                  )}
                  {text && (
                    <div className="w-full rounded-2xl rounded-bl-sm border border-stone-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-stone-800 shadow-sm">
                      <ReactMarkdown components={markdown}>{linkCitations(text, sources, docUrl)}</ReactMarkdown>
                    </div>
                  )}
                  <Sources sources={sources} text={text} ui={ui} />
                </li>
              );
            })}
            {(status === 'submitted' || (status === 'streaming' && lastInfo && !lastInfo.text && !lastInfo.pending)) && (
              <li>
                <Indicator label="Thinking…" />
              </li>
            )}
          </ul>
        )}

        {error && (
          <div className="mt-6 flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
            <span className="flex-1">Something went wrong. Please try again.</span>
            <button onClick={() => reload()} className="rounded-md bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700">
              Retry
            </button>
          </div>
        )}
        <div ref={bottom} />
      </main>

      <footer className="sticky bottom-0 border-t border-stone-200 bg-white/95 backdrop-blur">
        <form onSubmit={onSubmit} className="mx-auto flex max-w-3xl items-end gap-2 px-4 pb-2 pt-3">
          <label htmlFor="chat-input" className="sr-only">
            Your question
          </label>
          <textarea
            id="chat-input"
            value={input}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={ui.maxMessageChars}
            placeholder={ui.placeholder}
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              className="h-11 rounded-xl border border-stone-300 px-4 text-sm font-medium text-stone-700 hover:bg-stone-100"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="h-11 rounded-xl bg-accent px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            >
              Send
            </button>
          )}
        </form>
        {ui.disclaimer && (
          <p className="mx-auto max-w-3xl px-4 pb-3 text-center text-[11px] leading-snug text-stone-500">{ui.disclaimer}</p>
        )}
      </footer>
    </div>
  );
}
