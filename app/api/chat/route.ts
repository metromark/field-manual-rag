/**
 * Chat route: RAG as a tool call.
 *
 * The model decides whether to call the corpus search tool. Substantive
 * questions trigger a vector search; greetings and meta questions don't.
 * Tool results (text, citation, page, deep link) stream to the client and
 * render as source cards under the answer.
 */
import { streamText, type Message } from 'ai';
import { getActiveCorpus } from '@/lib/corpora';
import { chatModel } from '@/lib/models';
import { buildSystemPrompt } from '@/lib/prompt';
import { makeSearchTool } from '@/lib/retrieval';

export const maxDuration = 30;

// Basic guards: this endpoint is public and spends the OpenAI key.
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 2000;

export async function POST(req: Request) {
  let messages: Message[];
  try {
    ({ messages } = await req.json());
    if (!Array.isArray(messages) || messages.length === 0) throw new Error();
  } catch {
    return new Response('Expected { messages: [...] }', { status: 400 });
  }

  const last = messages[messages.length - 1];
  if (last.role !== 'user' || typeof last.content !== 'string' || last.content.length > MAX_MESSAGE_CHARS) {
    return new Response(`Message must be from the user and at most ${MAX_MESSAGE_CHARS} characters.`, { status: 400 });
  }

  // Keep only recent history, starting on a user turn.
  let recent = messages.slice(-MAX_MESSAGES);
  const firstUser = recent.findIndex((m) => m.role === 'user');
  recent = recent.slice(firstUser);

  const corpus = getActiveCorpus();
  const result = streamText({
    model: chatModel,
    system: buildSystemPrompt(corpus),
    messages: recent,
    tools: { [corpus.tool.name]: makeSearchTool(corpus) },
    maxSteps: 3,
    temperature: 0.2,
  });

  return result.toDataStreamResponse({
    getErrorMessage: (error) => {
      console.error('chat error', error);
      return 'Something went wrong while answering. Please try again.';
    },
  });
}
