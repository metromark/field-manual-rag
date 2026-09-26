import { openai } from '@ai-sdk/openai';

export const EMBEDDING_DIMS = 1536;

export const CHAT_MODEL_ID = process.env.CHAT_MODEL || 'gpt-4o-mini';
export const chatModel = openai(CHAT_MODEL_ID);
export const embeddingModel = openai.embedding('text-embedding-3-small');
