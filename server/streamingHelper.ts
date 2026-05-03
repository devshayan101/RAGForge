/**
 * Helper functions for Server-Sent Events (SSE) streaming
 */

import { Response } from "express";
import { invokeLLM } from "./_core/llm";

export interface StreamingChatOptions {
  query: string;
  context: string;
  systemPrompt?: string;
}

/**
 * Stream a chat response using Server-Sent Events
 * Sends tokens one at a time as they are generated
 */
export async function streamChatResponse(
  res: Response,
  options: StreamingChatOptions
): Promise<string> {
  const { query, context, systemPrompt } = options;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const fullSystemPrompt =
    systemPrompt ||
    `You are a helpful assistant. Use the following context to answer the user's question.

Context:
${context}

Answer the user's question based on the context above.`;

  try {
    // Call LLM to generate response
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: fullSystemPrompt,
        },
        {
          role: "user",
          content: query,
        },
      ],
    });
    const messageContent = response.choices[0]?.message.content;
    const fullResponse =
      typeof messageContent === "string" ? messageContent : "";

    // Stream the response word by word
    const words = fullResponse.split(/(\s+)/);
    let totalTokens = 0;

    for (const word of words) {
      if (word.trim()) {
        // Estimate tokens (rough approximation: 1 word ≈ 1.3 tokens)
        totalTokens += Math.ceil(word.length / 4);

        // Send token as SSE event
        res.write(`data: ${JSON.stringify({ token: word })}\n\n`);

        // Small delay to simulate streaming
        await new Promise((resolve) => setTimeout(resolve, 10));
      } else if (word === " ") {
        res.write(`data: ${JSON.stringify({ token: " " })}\n\n`);
      }
    }

    // Send completion event
    res.write(
      `data: ${JSON.stringify({
        done: true,
        totalTokens,
        fullResponse,
      })}\n\n`
    );

    res.end();

    return fullResponse;
  } catch (error: any) {
    console.error("[StreamingHelper] Error streaming response:", error);
    res.write(
      `data: ${JSON.stringify({
        error: error.message,
        done: true,
      })}\n\n`
    );
    res.end();
    throw error;
  }
}

/**
 * Parse SSE stream from response
 * Used by client to consume streaming responses
 */
export function parseSSEStream(
  response: globalThis.Response
): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      const reader = response.body?.getReader?.();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");

          for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i];
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              yield data;
            }
          }

          buffer = lines[lines.length - 1];
        }

        if (buffer.startsWith("data: ")) {
          yield buffer.slice(6);
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}
