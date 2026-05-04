import { invokeLLM, embedTexts } from "./_core/llm";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

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
        const { PDFParse } = pdfParse;
        const parser = new PDFParse({ data: fileBuffer });
        const data = await parser.getText();
        return data.text || "";
      } catch (error) {
        console.error("Error parsing PDF:", error);
        throw new Error(`Failed to parse PDF: ${error}`);
      }
    }

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "docx": {
      try {
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
  
  // Use a real embedding model (Option 1: Google AI Studio)
  // We use gemini-embedding-2 which is the current state-of-the-art model.
  return await embedTexts(texts, "gemini-embedding-2");
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
