import { invokeLLM } from "./_core/llm";

/**
 * Extract text from different file types
 */
export async function extractTextFromFile(
  fileBuffer: Buffer,
  fileType: string,
  filename: string
): Promise<string> {
  switch (fileType.toLowerCase()) {
    case "text/plain":
    case "txt":
      return fileBuffer.toString("utf-8");

    case "application/pdf":
    case "pdf": {
      try {
        const pdfParse = require("pdf-parse");
        const data = await pdfParse(fileBuffer);
        return data.text || "";
      } catch (error) {
        console.error("Error parsing PDF:", error);
        throw new Error(`Failed to parse PDF: ${error}`);
      }
    }

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "docx": {
      try {
        const mammoth = require("mammoth");
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        return result.value || "";
      } catch (error) {
        console.error("Error parsing DOCX:", error);
        throw new Error(`Failed to parse DOCX: ${error}`);
      }
    }

    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * Split text into chunks with configurable size and overlap
 */
export function chunkText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 100
): string[] {
  if (chunkSize <= 0) throw new Error("Chunk size must be positive");
  if (overlap < 0 || overlap >= chunkSize) {
    throw new Error("Overlap must be between 0 and chunk size");
  }

  const chunks: string[] = [];
  const step = chunkSize - overlap;

  for (let i = 0; i < text.length; i += step) {
    const chunk = text.slice(i, i + chunkSize);
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

/**
 * Generate embeddings for text chunks using LLM
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Use LLM to generate embeddings
  // This is a simplified version - in production you'd use a dedicated embedding model
  const embeddings: number[][] = [];

  for (const text of texts) {
    // Call LLM to generate embedding (simplified - returns mock embedding)
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are an embedding generator. Generate a JSON array of 384 numbers between -1 and 1 representing the embedding of the following text. Return ONLY the JSON array, no other text.",
        },
        {
          role: "user",
          content: text.substring(0, 500), // Limit text length for embedding
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "embedding",
          strict: true,
          schema: {
            type: "object",
            properties: {
              embedding: {
                type: "array",
                items: { type: "number" },
                description: "384-dimensional embedding vector",
              },
            },
            required: ["embedding"],
            additionalProperties: false,
          },
        },
      },
    });

    try {
      const content = response.choices[0]?.message.content;
      if (typeof content === "string") {
        const parsed = JSON.parse(content);
        embeddings.push(parsed.embedding || Array(384).fill(0));
      } else {
        embeddings.push(Array(384).fill(0));
      }
    } catch (error) {
      console.error("Failed to parse embedding response:", error);
      embeddings.push(Array(384).fill(0));
    }
  }

  return embeddings;
}

/**
 * Process a document: extract text, chunk it, and generate embeddings
 */
export async function processDocument(
  fileBuffer: Buffer,
  fileType: string,
  filename: string,
  chunkSize: number = 1000,
  overlap: number = 100
): Promise<{ chunks: string[]; embeddings: number[][] }> {
  // Extract text from file
  const text = await extractTextFromFile(fileBuffer, fileType, filename);

  // Chunk the text
  const chunks = chunkText(text, chunkSize, overlap);

  // Generate embeddings for chunks
  const embeddings = await generateEmbeddings(chunks);

  return { chunks, embeddings };
}
