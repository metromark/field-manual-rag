import { openai } from '@ai-sdk/openai';

export const EMBEDDING_DIMS = 1536;

export const chatModel = openai('gpt-4o-mini');
export const embeddingModel = openai.embedding('text-embedding-3-small');
