import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveBaseUrl = () =>
  ENV.geminiApiUrl && ENV.geminiApiUrl.trim().length > 0
    ? ENV.geminiApiUrl.replace(/\/$/, "")
    : "https://generativelanguage.googleapis.com";

const resolveChatUrl = () => {
  const baseUrl = resolveBaseUrl();
  if (baseUrl.includes("generativelanguage.googleapis.com")) {
    return `${baseUrl}/v1beta/openai/chat/completions`;
  }
  return `${baseUrl}/v1/chat/completions`;
};

const resolveEmbedUrl = () => {
  const baseUrl = resolveBaseUrl();
  if (baseUrl.includes("generativelanguage.googleapis.com")) {
    return `${baseUrl}/v1beta/openai/embeddings`;
  }
  return `${baseUrl}/v1/embeddings`;
};

const assertApiKey = () => {
  if (!ENV.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Please set it in your .env file.");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
  } = {}
): Promise<T> {
  const { maxRetries = 5, initialDelay = 2000, maxDelay = 60000 } = options;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      if (attempt >= maxRetries) throw error;

      const isRateLimit =
        error.message?.includes("429") ||
        error.status === 429 ||
        error.message?.includes("RESOURCE_EXHAUSTED");

      if (!isRateLimit) throw error;

      // Try to parse retryDelay from Google error if available
      let delay = initialDelay * Math.pow(2, attempt - 1);

      try {
        // Look for "Please retry in X.Xs" or similar in error message
        const match = error.message?.match(/retry in ([\d.]+)s/);
        if (match) {
          delay = parseFloat(match[1]) * 1000 + 1000; // Add 1s buffer
        }
      } catch (e) {
        // Ignore parsing errors
      }

      delay = Math.min(delay, maxDelay);
      console.warn(
        `[LLM] Rate limited. Retrying in ${Math.round(
          delay / 1000
        )}s (attempt ${attempt}/${maxRetries})...`
      );
      await sleep(delay);
    }
  }
  throw new Error("Retry failed");
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model: params.model || ENV.geminiModel,
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }


  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  console.log("[LLM] Invoking with payload:", JSON.stringify(payload, null, 2));
  const response = await fetch(resolveChatUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.geminiApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[LLM] API Error: ${response.status} ${response.statusText}`, errorText);
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
}

export async function embedTexts(texts: string[], model = "gemini-embedding-2"): Promise<number[][]> {
  assertApiKey();
  const baseUrl = resolveBaseUrl();
  const BATCH_SIZE = 100;
  const BATCH_DELAY = 600; // 600ms delay between batches to stay under 100 RPM limit

  // Handle Google native API
  if (baseUrl.includes("generativelanguage.googleapis.com")) {
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      // Add a small delay between batches to stay under the 100 requests per minute limit
      if (i > 0) await sleep(BATCH_DELAY);

      const batch = texts.slice(i, i + BATCH_SIZE);
      const url = `${baseUrl}/v1beta/models/${model}:batchEmbedContents?key=${ENV.geminiApiKey}`;
      
      console.log(`[LLM] Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)} (${batch.length} texts)`);
      
      const batchEmbeddings = await withRetry(async () => {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            requests: batch.map(text => ({
              model: `models/${model}`,
              content: { parts: [{ text }] },
              output_dimensionality: 768, // Maintain compatibility with 768-dim vector expectations
            })),
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error: any = new Error(`Google Embedding failed: ${response.status} ${response.statusText} – ${errorText}`);
          error.status = response.status;
          throw error;
        }

        const json = await response.json();
        if (!json.embeddings) {
          throw new Error(`Invalid Google embedding response: ${JSON.stringify(json)}`);
        }
        return json.embeddings.map((item: any) => item.values);
      });

      allEmbeddings.push(...batchEmbeddings);
    }

    return allEmbeddings;
  }

  // Fallback for OpenAI-compatible proxies (Forge, Ollama, etc.)
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(BATCH_DELAY);
    
    const batch = texts.slice(i, i + BATCH_SIZE);
    
    const batchEmbeddings = await withRetry(async () => {
      const response = await fetch(resolveEmbedUrl(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ENV.geminiApiKey}`,
        },
        body: JSON.stringify({
          model,
          input: batch,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error: any = new Error(`Embedding failed: ${response.status} ${response.statusText} – ${errorText}`);
        error.status = response.status;
        throw error;
      }

      const json = await response.json();
      return json.data.map((item: any) => item.embedding);
    });

    allEmbeddings.push(...batchEmbeddings);
  }
  
  return allEmbeddings;
}
