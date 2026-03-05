// ── Types ────────────────────────────────────────────────────────────────────

export interface MetricsResponse {
  tenant_id: string;
  total_queries: number;
  avg_response_time_ms: number;
}

export interface ChatSessionResponse {
  id: string;
  tenant_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageResponse {
  id: number;
  session_id: string;
  role: string;
  content: string;
  sources: Array<{ content: string; metadata: Record<string, string> }> | null;
  confidence_score: number | null;
  created_at: string;
}

export interface ChatSessionWithMessages extends ChatSessionResponse {
  messages: ChatMessageResponse[];
}

export interface ChatSessionList {
  sessions: ChatSessionResponse[];
  total: number;
}

export interface PDFUploadResponse {
  job_id: string;
  filename: string;
  status: string;
  message: string;
}

export interface PDFJobStatusResponse {
  job_id: string;
  status: string;
  filename: string;
  chunks_created: number | null;
  total_pages: number | null;
  error: string | null;
}

// ── Config ───────────────────────────────────────────────────────────────────

const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000';

function apiHeaders(apiKey: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  };
}


// ── Metrics ──────────────────────────────────────────────────────────────────

export async function fetchMetrics(tenantId: string, apiKey: string): Promise<MetricsResponse> {
  const res = await fetch(`${FASTAPI_URL}/api/metrics/${tenantId}`, {
    headers: { 'X-API-Key': apiKey },
  });
  if (!res.ok) throw new Error(`Failed to fetch metrics: ${res.status}`);
  return res.json() as Promise<MetricsResponse>;
}

// ── Chat Sessions ────────────────────────────────────────────────────────────

export async function createChatSession(
  apiKey: string,
  title: string = 'New Chat',
): Promise<ChatSessionResponse> {
  const res = await fetch(`${FASTAPI_URL}/api/chat/sessions`, {
    method: 'POST',
    headers: apiHeaders(apiKey),
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  return res.json() as Promise<ChatSessionResponse>;
}

export async function listChatSessions(
  apiKey: string,
  limit: number = 20,
  offset: number = 0,
): Promise<ChatSessionList> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await fetch(`${FASTAPI_URL}/api/chat/sessions?${params}`, {
    headers: { 'X-API-Key': apiKey },
  });
  if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`);
  return res.json() as Promise<ChatSessionList>;
}

export async function getChatSession(
  sessionId: string,
  apiKey: string,
): Promise<ChatSessionWithMessages> {
  const res = await fetch(`${FASTAPI_URL}/api/chat/sessions/${sessionId}`, {
    headers: { 'X-API-Key': apiKey },
  });
  if (!res.ok) throw new Error(`Failed to get session: ${res.status}`);
  return res.json() as Promise<ChatSessionWithMessages>;
}

export async function deleteChatSession(
  sessionId: string,
  apiKey: string,
): Promise<void> {
  const res = await fetch(`${FASTAPI_URL}/api/chat/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { 'X-API-Key': apiKey },
  });
  if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`);
}

export async function updateChatSessionTitle(
  sessionId: string,
  apiKey: string,
  title: string,
): Promise<ChatSessionResponse> {
  const res = await fetch(`${FASTAPI_URL}/api/chat/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: apiHeaders(apiKey),
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to update session: ${res.status}`);
  return res.json() as Promise<ChatSessionResponse>;
}

// ── Chat Messages ────────────────────────────────────────────────────────────

export async function addChatMessage(
  sessionId: string,
  apiKey: string,
  role: string,
  content: string,
  sources?: Array<{ content: string; metadata: Record<string, string> }> | null,
  confidenceScore?: number | null,
): Promise<ChatMessageResponse> {
  const res = await fetch(`${FASTAPI_URL}/api/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: apiHeaders(apiKey),
    body: JSON.stringify({
      role,
      content,
      sources: sources ?? null,
      confidence_score: confidenceScore ?? null,
    }),
  });
  if (!res.ok) throw new Error(`Failed to add message: ${res.status}`);
  return res.json() as Promise<ChatMessageResponse>;
}

// ── PDF Upload ───────────────────────────────────────────────────────────────

export async function uploadPDF(
  file: File,
  apiKey: string,
): Promise<PDFUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${FASTAPI_URL}/api/documents/upload`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'Upload failed');
    throw new Error(text);
  }
  return res.json() as Promise<PDFUploadResponse>;
}

export async function getPDFJobStatus(
  jobId: string,
  apiKey: string,
): Promise<PDFJobStatusResponse> {
  const res = await fetch(`${FASTAPI_URL}/api/documents/jobs/${jobId}`, {
    headers: { 'X-API-Key': apiKey },
  });
  if (!res.ok) throw new Error(`Failed to get job status: ${res.status}`);
  return res.json() as Promise<PDFJobStatusResponse>;
}


// ── Tenant Documents ─────────────────────────────────────────────────────────────

export interface TenantDocumentInfo {
  filename: string;
  chunk_count: number;
  first_page: string | null;
  last_page: string | null;
}

export interface TenantDocumentListResponse {
  tenant_id: string;
  documents: TenantDocumentInfo[];
}

export interface DocumentPreviewResponse {
  tenant_id: string;
  filename: string;
  content: string;
}

export async function listTenantDocuments(
  apiKey: string,
): Promise<TenantDocumentListResponse> {
  const res = await fetch(`${FASTAPI_URL}/api/tenant-documents`, {
    headers: { 'X-API-Key': apiKey },
  });
  if (!res.ok) throw new Error(`Failed to list tenant documents: ${res.status}`);
  return res.json() as Promise<TenantDocumentListResponse>;
}

export async function getDocumentPreview(
  filename: string,
  apiKey: string,
): Promise<DocumentPreviewResponse> {
  const res = await fetch(`${FASTAPI_URL}/api/tenant-documents/${encodeURIComponent(filename)}/preview`, {
    headers: { 'X-API-Key': apiKey },
  });
  if (!res.ok) throw new Error(`Failed to get document preview: ${res.status}`);
  return res.json() as Promise<DocumentPreviewResponse>;
}

export interface DeleteDocumentResponse {
  tenant_id: string;
  filename: string;
  chunks_deleted: number;
}

export async function deleteTenantDocument(
  filename: string,
  apiKey: string,
): Promise<DeleteDocumentResponse> {
  const res = await fetch(`${FASTAPI_URL}/api/tenant-documents/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    headers: { 'X-API-Key': apiKey },
  });
  if (!res.ok) throw new Error(`Failed to delete document: ${res.status}`);
  return res.json() as Promise<DeleteDocumentResponse>;
}
