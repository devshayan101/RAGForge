import dotenv from "dotenv";
dotenv.config();
import { embedTexts } from "../server/_core/llm";

async function test() {
  console.log("--- Testing Robust Embedding Logic ---");
  
  // Test 1: Multiple batches (throttling)
  const chunks = Array.from({ length: 150 }, (_, i) => `This is test chunk number ${i} for rate limiting verification.`);
  
  console.log(`Testing with ${chunks.length} chunks (2 batches)...`);
  const start = Date.now();
  
  try {
    const embeddings = await embedTexts(chunks);
    const duration = Date.now() - start;
    console.log(`✅ Success! Generated ${embeddings.length} embeddings.`);
    console.log(`⏱️ Duration: ${duration}ms (Expected > 600ms due to throttling)`);
    
    if (embeddings.length === chunks.length) {
      console.log("✅ All embeddings returned correctly.");
    } else {
      console.error(`❌ Expected ${chunks.length} embeddings, got ${embeddings.length}`);
    }
  } catch (error: any) {
    console.error("❌ Test failed:", error.message);
  }
}

test();
