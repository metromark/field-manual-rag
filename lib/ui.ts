/**
 * The subset of a corpus config the browser needs. The client never sees
 * prompts, chunking settings, or anything else server-side.
 */
import { docUrl, type CorpusConfig } from './corpus';

/** Shared by the chat route (validation) and the input box (maxLength). */
export const MAX_MESSAGE_CHARS = 2000;

export type ChatUI = {
  name: string;
  shortName: string;
  tagline: string;
  about: string;
  disclaimer?: string;
  groupLabel?: string;
  promptChips: string[];
  searchingLabel: string;
  placeholder: string;
  openLabel: string;
  accent: string;
  documents: { title: string; url: string; source: string; license: string }[];
  maxMessageChars: number;
};

export function toChatUI(c: CorpusConfig): ChatUI {
  return {
    name: c.name,
    shortName: c.shortName,
    tagline: c.tagline,
    about: c.about,
    disclaimer: c.disclaimer,
    groupLabel: c.groups?.label,
    promptChips: c.ui.promptChips,
    searchingLabel: c.ui.searchingLabel,
    placeholder: c.ui.placeholder,
    openLabel: c.ui.openLabel,
    accent: c.ui.accent,
    documents: c.documents.map((d) => ({
      title: d.title,
      url: docUrl(c.id, d.file),
      source: d.source,
      license: d.license,
    })),
    maxMessageChars: MAX_MESSAGE_CHARS,
  };
}
