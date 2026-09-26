import { openai } from '@ai-sdk/openai';

export const EMBEDDING_DIMS = 1536;

// gpt-4.1-mini over gpt-4o-mini: in the eval it was the only one that did not
// reconstruct figure-only procedures (Universal Edibility Test) from memory.
export const CHAT_MODEL_ID = process.env.CHAT_MODEL || 'gpt-4.1-mini';
export const chatModel = openai(CHAT_MODEL_ID);
export const embeddingModel = openai.embedding('text-embedding-3-small');
