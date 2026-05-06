# RagForge Application Mind-Map

```mermaid
mindmap
  root((RagForge))
    Frontend (Client)
      Frameworks
        Vite
        React
        TypeScript
        tRPC Client
      Pages
        Home (Dashboard)
        ProjectsPage
        PipelinesPage
        DocumentsPage
        ChatPage
        ApiKeysPage
        UsageDashboard
      Components
        AIChatBox
        DashboardLayout
        Map Component
        UI Components (shadcn/ui)
    Backend (Server)
      API (tRPC)
        Projects Router
        Pipelines Router
        Versions Router
        Documents Router
        Search & Chat Routers
      Services
        LLM Integration (llm.ts - configurable via GEMINI_MODEL)
        Document Processing (batched & rate-limited embeddings)
        Queue Management (BullMQ/Redis)
        Storage Service (S3/MinIO)
        Authentication (Clerk SDK)
      Core Logic
        Vector Search (Cosine Similarity)
        Ingestion Pipeline
        Usage Logging & Analytics
    Database (Drizzle/MySQL)
      Tables
        Users
        Projects
        Pipelines
        Pipeline Versions
        Documents
        Chunks (Embeddings)
        API Keys
        Usage Logs
    Shared
      Types & Interfaces
      Constants
```

## Key Features & Workflows

### 1. RAG Pipeline Management
Users can create **Projects**, each containing multiple **Pipelines**. Pipelines are versioned, allowing users to experiment with different configurations (e.g., chunk size, overlap).

### 2. Document Ingestion
Documents are uploaded (via presigned URLs), processed into chunks, and transformed into vector embeddings using `gemini-embedding-2`. The system tracks granular ingestion stages (**uploading**, **extracting**, **embedding**, **ready**) to provide real-time feedback. Embedding generation is processed in batches of 100 with exponential backoff and parallel processing to take advantage of high API rate limits (2200 RPM). This is handled by a background queue (`BullMQ`) with a synchronous fallback.

### 3. Vector Search & RAG Chat
The system performs **Cosine Similarity** search over chunks to find relevant context for user queries. The **Chat** feature uses this context to provide grounded LLM responses.

### 4. API & External Access
Users can generate **API Keys** to interact with their RAG pipelines programmatically, with built-in usage tracking and analytics.

### 5. Infrastructure
- **Type Safety**: End-to-end type safety using tRPC and Drizzle.
- **Scalability**: Background processing for heavy tasks (embeddings).
- **Persistence**: MySQL for metadata and structured data; Vector storage (implied) for embeddings.
