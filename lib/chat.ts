/** The chat configuration shared by the API route and the eval harness. */
import type { CorpusConfig } from './corpus';
import { chatModel } from './models';
import { buildSystemPrompt } from './prompt';
import { makeSearchTool } from './retrieval';

export function chatSettings(corpus: CorpusConfig) {
  return {
    model: chatModel,
    system: buildSystemPrompt(corpus),
    tools: { [corpus.tool.name]: makeSearchTool(corpus) },
    maxSteps: 3,
    temperature: 0.2,
  };
}
