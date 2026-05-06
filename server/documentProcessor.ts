import { invokeLLM, embedTexts } from "./_core/llm";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

/**
 * Custom error to signal that OCR is required for a document
 */
export class OCRRequiredError extends Error {
  constructor(message: string = "OCR required for this document") {
    super(message);
    this.name = "OCRRequiredError";
  }
}

/**
 * Extract text from different file types
 */
export async function extractTextFromFile(
  fileBuffer: Buffer,
  fileType: string,
  filename: string,
  options: { forceOCR?: boolean } = {}
): Promise<string> {
  switch (fileType.toLowerCase()) {
    case "text/plain":
    case "txt":
      return fileBuffer.toString("utf-8");

    case "application/pdf":
    case "pdf": {
      const { PDFParse } = pdfParse;
      const parser = new PDFParse({ data: fileBuffer });
      try {
        const data = await parser.getText();
        const info = await parser.getInfo();
        const pageCount = (typeof info.pages === 'number' ? info.pages : (info.total || 0));
        let text = data.text || "";

        // Detection: if text is very sparse (< 50 chars per page on average)
        // or if text is empty but there are pages
        if (pageCount > 0 && (text.length / pageCount < 50 || text.trim().length === 0)) {
          if (options.forceOCR) {
            console.log(`[Processor] Low content detected. Processing with forced OCR fallback.`);
            text = await extractTextWithOCR(parser, pageCount);
          } else {
            console.log(`[Processor] Low content detected. Signaling OCR required.`);
            throw new OCRRequiredError();
          }
        }

        return text;
      } catch (error) {
        if (error instanceof OCRRequiredError) throw error;
        console.error("Error parsing PDF:", error);
        throw new Error(`Failed to parse PDF: ${error}`);
      } finally {
        // Always destroy the parser to free resources
        if (parser && typeof parser.destroy === 'function') {
          await parser.destroy();
        }
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
 * Extract text using LLM OCR for scanned PDFs
 */
async function extractTextWithOCR(
  parser: any, 
  pageCount: number, 
  onProgress?: (progress: number) => Promise<void>
): Promise<string> {
  const BATCH_SIZE = 5; // Process 5 pages at a time to stay within limits and provide progress
  let fullText = "";

  console.log(`[OCR] Starting OCR for ${pageCount} pages...`);

  for (let i = 1; i <= pageCount; i += BATCH_SIZE) {
    const endPage = Math.min(i + BATCH_SIZE - 1, pageCount);
    const pages = Array.from({ length: endPage - i + 1 }, (_, index) => i + index);

    console.log(`[OCR] Processing pages ${i} to ${endPage}...`);
    
    // Update progress (OCR takes 0-100% of extraction phase)
    if (onProgress) {
      const progress = Math.round(((i - 1) / pageCount) * 100);
      await onProgress(progress);
    }

    try {
      // Get screenshots for the batch
      const result = await parser.getScreenshot({
        partial: pages,
        scale: 1.5, // Good balance between quality and size
        imageDataUrl: true,
      });

      const screenshots = result.pages;
      
      // Call LLM for OCR
      const response = await invokeLLM({
        model: "gemini-2.5-flash", // Use 2.5 Flash for speed, cost-effectiveness and availability
        messages: [
          {
            role: "system",
            content: "You are an expert OCR engine. Transcribe all text from the provided images accurately. Maintain the original language (e.g. Urdu, Arabic, English). Do not add any commentary. If a page is blank, skip it.",
          },
          {
            role: "user",
            content: screenshots.map((s: any) => ({
              type: "image_url",
              image_url: { url: s.dataUrl }
            })),
          },
        ],
      });

      const batchText = response.choices[0]?.message.content;
      if (typeof batchText === "string") {
        fullText += batchText + "\n\n";
      }
    } catch (error) {
      console.error(`[OCR] Error processing batch ${i}-${endPage}:`, error);
      // Continue with next batch if one fails, but log it
    }
  }

  if (onProgress) await onProgress(100);
  return fullText || "OCR failed to extract text.";
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
  overlap: number = 100,
  onStatus?: (status: "extracting" | "embedding", progress: number) => Promise<void>,
  options: { forceOCR?: boolean } = {}
): Promise<{ chunks: string[]; embeddings: number[][] }> {
  // 1. Extract text from file
  if (onStatus) await onStatus("extracting", 0);
  
  let text = "";
  if (fileType.toLowerCase() === "application/pdf" || fileType.toLowerCase() === "pdf") {
    // Specialized PDF extraction for OCR progress
    const { PDFParse } = pdfParse;
    const parser = new PDFParse({ data: fileBuffer });
    try {
      const data = await parser.getText();
      const info = await parser.getInfo();
      const pageCount = (typeof info.pages === 'number' ? info.pages : (info.total || 0));
      text = data.text || "";

      if (pageCount > 0 && (text.length / pageCount < 50 || text.trim().length === 0)) {
        if (options.forceOCR) {
          console.log(`[Processor] Low content detected. Processing with forced OCR fallback.`);
          text = await extractTextWithOCR(parser, pageCount, async (p) => {
            if (onStatus) await onStatus("extracting", p);
          });
        } else {
          console.log(`[Processor] Low content detected. Signaling OCR required.`);
          throw new OCRRequiredError();
        }
      }
    } catch (error) {
      if (error instanceof OCRRequiredError) throw error;
      console.error("Error parsing PDF:", error);
      throw new Error(`Failed to parse PDF: ${error}`);
    } finally {
      if (parser && typeof parser.destroy === 'function') {
        await parser.destroy();
      }
    }
  } else {
    // Normal extraction for other types
    text = await extractTextFromFile(fileBuffer, fileType, filename, options);
  }
  
  if (onStatus) await onStatus("extracting", 100);

  // 2. Chunk the text
  const chunks = chunkText(text, chunkSize, overlap);

  // 3. Generate embeddings for chunks with progress
  if (onStatus) await onStatus("embedding", 0);
  
  const embeddings: number[][] = [];
  const BATCH_SIZE = 100; // Consistent with db batching
  
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchEmbeddings = await generateEmbeddings(batch);
    embeddings.push(...batchEmbeddings);
    
    if (onStatus) {
      const progress = Math.round((embeddings.length / chunks.length) * 100);
      await onStatus("embedding", progress);
    }
  }

  return { chunks, embeddings };
}
