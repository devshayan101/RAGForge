# 🛠️ RagForge: The Ultimate RAG Pipeline Factory

RagForge is a high-performance, developer-centric platform for building, versioning, and deploying **Retrieval-Augmented Generation (RAG)** pipelines. Effortlessly transform your documents into searchable, intelligent knowledge bases powered by the latest LLMs.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-4.0-38B2AC?logo=tailwind-css)

---

## ✨ Key Features

### 🏗️ Advanced Pipeline Management
- **Multi-Project Support**: Organize your workflows into distinct projects.
- **Linear Versioning**: Experiment with different configurations (chunk size, overlap, models) by creating multiple versions (v1, v2, ...) for each pipeline.
- **Granular Control**: Fine-tune how your data is processed at the version level.

### 📥 Robust Document Ingestion
- **Multi-Format Support**: Process PDF, DOCX, and TXT files seamlessly.
- **Smart Storage**: Integrated with S3/Cloudflare R2 for scalable file management.
- **Intelligent OCR**: Automatically detects scanned documents with low text density and offers LLM-powered OCR.
- **Real-time Feedback**: Detailed progress tracking with granular states: `uploading` ➔ `extracting` ➔ `embedding` ➔ `ready`.
- **Wait-Time Estimation**: Smart calculation of processing time based on document size and server load.

### 🧠 High-Performance RAG Engine
- **Optimized Embeddings**: Parallelized batch processing (10x concurrency) with exponential backoff to maximize throughput while respecting API limits.
- **Semantic Retrieval**: Advanced vector search using Cosine Similarity to find the most relevant context.
- **Grounded Chat**: Interactive chat interface that provides LLM responses strictly grounded in your uploaded documents.
- **Source Citations**: Every answer comes with precise references (document name, page number, and text snippet).

### 🛠️ Developer Ecosystem
- **API Key Management**: Securely generate, hash, and manage API keys for programmatic access.
- **Usage Analytics**: Track document counts, chunk statistics, query response times, and token usage through a beautiful dashboard.
- **End-to-End Type Safety**: Built with tRPC and TypeScript for a rock-solid developer experience.

---

## ⚙️ How It Works

### The RAG Lifecycle
1.  **Ingestion**: When a document is uploaded, it is stored in S3/R2. A background worker (powered by **BullMQ**) is triggered.
2.  **Extraction & Chunking**: The system extracts text (using OCR if necessary) and breaks it into overlapping chunks based on your pipeline's configuration.
3.  **Vectorization**: Chunks are sent to the **Gemini Embedding API** to generate high-dimensional vectors representing their semantic meaning.
4.  **Retrieval**: When you ask a question, your query is embedded. The system performs a similarity search across all chunks in the active pipeline version.
5.  **Generation**: The top context chunks are injected into a prompt for **Gemma 4 / Gemini**, which generates a grounded response with citations.

---

## 🚀 Getting Started

### Prerequisites
- [Bun](https://bun.sh/) runtime
- [MySQL](https://www.mysql.com/) (or TiDB) database
- [Redis](https://redis.io/) (for background job processing)
- Google AI API Key (for Gemini/Gemma)
- Cloudflare R2 or AWS S3 credentials

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/devshayan101/RAGForge.git
   cd RAGForge
   ```

2. **Install dependencies:**
   ```bash
   bun install
   ```

3. **Configure environment:**
   Create a `.env` file in the root directory (refer to `.env.example`).

4. **Run migrations:**
   ```bash
   bun run db:push
   ```

5. **Start the development server:**
   ```bash
   bun run dev
   ```

---

## 📖 Usage Guide

1.  **Create a Project**: Start by defining a project container (e.g., "Customer Support Knowledge Base").
2.  **Define a Pipeline**: Create a pipeline and its initial version (v1).
3.  **Upload Documents**: Drag and drop your PDFs or text files. Watch the real-time progress bar as they are indexed.
4.  **Chat & Test**: Head to the Chat tab to start querying your data. Verify the accuracy using the source citations.
5.  **Go Programmatic**: Generate an API key and use the `/api` endpoints to integrate RagForge into your own applications.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, Tailwind CSS 4, wouter, Lucide Icons, shadcn/ui.
- **Backend**: Express.js, tRPC, Bun.
- **Database**: MySQL (via Drizzle ORM).
- **Queueing**: BullMQ & Redis.
- **AI**: Google Gemini Gemma 4 31B (LLM) & Gemini Embedding 2.
- **Storage**: AWS S3 / Cloudflare R2.

---

## 📄 License

This project is licensed under the MIT License.
