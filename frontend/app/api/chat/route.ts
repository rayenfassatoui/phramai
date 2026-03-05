import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';

interface MessagePart {
  type: string;
  text?: string;
}

interface UIMessagePayload {
  role: string;
  content?: string;
  parts?: MessagePart[];
}

interface SSEEvent {
  type: 'sources' | 'token' | 'done' | 'error';
  token?: string;
  sources?: Array<{ content: string; metadata: Record<string, string> }>;
  confidence_score?: number;
  duration_ms?: number;
  error?: string;
}

export async function POST(req: Request) {
  const body = await req.json();
  const { messages } = body as { messages: UIMessagePayload[] };
  const lastMessage = messages[messages.length - 1];

  // AI SDK v5 sends messages with parts array, not content
  const userText =
    lastMessage.parts?.find((p) => p.type === 'text')?.text
    ?? lastMessage.content
    ?? '';

  const apiKey = (body.apiKey ?? '') as string;
  const fastapiUrl = process.env.FASTAPI_URL || 'http://localhost:8000';

  // Use SSE streaming endpoint
  const res = await fetch(`${fastapiUrl}/api/query/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ question: userText }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Query failed');
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'start' });
        const partId = 'err-' + Math.random().toString(36).slice(2, 9);
        writer.write({ type: 'text-start', id: partId });
        writer.write({ type: 'text-delta', id: partId, delta: `Error: ${errorText}` });
        writer.write({ type: 'text-end', id: partId });
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: 'start' });
      const textPartId = 'txt-' + Math.random().toString(36).slice(2, 9);
      let textStarted = false;

      const reader = res.body?.getReader();
      if (!reader) {
        writer.write({ type: 'text-start', id: textPartId });
        writer.write({ type: 'text-delta', id: textPartId, delta: 'Error: No response stream.' });
        writer.write({ type: 'text-end', id: textPartId });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const event = JSON.parse(dataStr) as SSEEvent;

            if (event.type === 'sources') {
              // Send sources as custom data part
              if (event.sources && event.sources.length > 0) {
                writer.write({
                  type: 'data-custom',
                  id: 'sources-' + Math.random().toString(36).slice(2, 9),
                  data: {
                    type: 'sources',
                    sources: event.sources,
                    confidence_score: event.confidence_score ?? 0,
                  },
                });
              }
            } else if (event.type === 'token') {
              if (!textStarted) {
                writer.write({ type: 'text-start', id: textPartId });
                textStarted = true;
              }
              if (event.token) {
                writer.write({ type: 'text-delta', id: textPartId, delta: event.token });
              }
            } else if (event.type === 'done') {
              if (textStarted) {
                writer.write({ type: 'text-end', id: textPartId });
              }
              // Send confidence and duration as custom data
              writer.write({
                type: 'data-custom',
                id: 'meta-' + Math.random().toString(36).slice(2, 9),
                data: {
                  type: 'metadata',
                  confidence_score: event.confidence_score ?? 0,
                  duration_ms: event.duration_ms ?? 0,
                },
              });
            } else if (event.type === 'error') {
              if (!textStarted) {
                writer.write({ type: 'text-start', id: textPartId });
                textStarted = true;
              }
              writer.write({
                type: 'text-delta',
                id: textPartId,
                delta: `Error: ${event.error ?? 'Unknown error'}`,
              });
              writer.write({ type: 'text-end', id: textPartId });
              return;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      // Ensure text part is closed if stream ended unexpectedly
      if (textStarted) {
        // text-end may have already been sent in 'done' handler
      } else {
        writer.write({ type: 'text-start', id: textPartId });
        writer.write({
          type: 'text-delta',
          id: textPartId,
          delta: 'No response received from the AI service.',
        });
        writer.write({ type: 'text-end', id: textPartId });
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
