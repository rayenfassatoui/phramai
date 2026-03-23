"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { IconActivity, IconMessage, IconLoader2 } from "@tabler/icons-react";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { SourceList } from "@/components/chat/SourceList";
import { TenantSelector } from "@/components/chat/TenantSelector";
import { MetricsPanel } from "@/components/chat/MetricsPanel";
import { ChatHistory } from "@/components/chat/ChatHistory";
import { ConfidenceScore } from "@/components/chat/ConfidenceScore";
import { ExportButtons } from "@/components/chat/ExportButtons";
import { PDFUpload } from "@/components/chat/PDFUpload";
import { DocumentLibrary } from "@/components/chat/DocumentLibrary";

// SSR-disabled import — react-pdf uses window/canvas at import time
const CitationSidebar = dynamic(
  () => import("@/components/chat/CitationSidebar").then((m) => m.CitationSidebar),
  { ssr: false },
);
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useQueryClient } from "@tanstack/react-query";
import { createChatSession, addChatMessage, getChatSession } from "@/services/api";
import type { ChatSessionResponse, ChatMessageResponse } from "@/services/api";

const TENANT_THEMES = {
  "tenant-1": {
    primary: "oklch(0.55 0.17 155)",
    primaryForeground: "oklch(0.98 0.01 155)",
    label: "Tenant 1",
  },
  "tenant-2": {
    primary: "oklch(0.55 0.15 250)",
    primaryForeground: "oklch(0.98 0.01 250)",
    label: "Tenant 2",
  },
  "tenant-3": {
    primary: "oklch(0.55 0.20 27)",
    primaryForeground: "oklch(0.98 0.01 27)",
    label: "Tenant 3",
  },
} as const;

const TENANTS = [
  { id: "tenant-1", label: "Tenant 1", key: "tenant-1-secret-key" },
  { id: "tenant-2", label: "Tenant 2", key: "tenant-2-secret-key" },
  { id: "tenant-3", label: "Tenant 3", key: "tenant-3-secret-key" },
] as const;

interface Source { content: string; metadata: Record<string, string>; index?: number; }
interface CustomDataPart { type: "data-custom"; data: { type: string; sources?: Source[]; confidence_score?: number; duration_ms?: number }; }

export default function ChatPage() {
  const [selectedTenantId, setSelectedTenantId] = React.useState<string>(TENANTS[0].id);
  const selectedTenant = TENANTS.find(t => t.id === selectedTenantId) || TENANTS[0];
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(null);
  const queryClient = useQueryClient();
  const sessionIdRef = React.useRef<string | null>(null);
  const persistedCountRef = React.useRef(0);
  const messagesTenantKeyRef = React.useRef<string>(selectedTenant.key);
  const { messages, setMessages, sendMessage, status } = useChat({ transport: new DefaultChatTransport({ api: "/api/chat" }) });
  const isStreaming = status === "submitted" || status === "streaming";
  const [citationSource, setCitationSource] = React.useState<Source | null>(null);

  // Close citation sidebar when tenant changes
  React.useEffect(() => {
    setCitationSource(null);
  }, [selectedTenantId]);

  // Reset all chat state when tenant changes
  React.useEffect(() => {
    setMessages([]);
    sessionIdRef.current = null;
    persistedCountRef.current = 0;
    setActiveSessionId(null);
    // NOTE: messagesTenantKeyRef is intentionally NOT updated here.
    // It retains the OLD tenant key so the persistence effect can detect
    // that the current messages belong to a different tenant and bail out.
    // It only gets updated when messages are genuinely created for the new tenant.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenantId]);

  // Persist messages to backend session after streaming completes
  React.useEffect(() => {
    if (isStreaming || messages.length === 0) return;
    const newMessages = messages.slice(persistedCountRef.current);
    if (newMessages.length === 0) return;

    // Guard: only persist if messages belong to the current tenant.
    // After a tenant switch, messagesTenantKeyRef still holds the OLD key
    // while selectedTenant.key is the NEW key — mismatch blocks persistence.
    if (messagesTenantKeyRef.current !== selectedTenant.key) return;

    const apiKey = selectedTenant.key;

    const persist = async () => {
      try {
        // Auto-create session if none exists
        if (!sessionIdRef.current) {
          const firstUserMsg = newMessages.find(m => m.role === "user");
          const title = firstUserMsg
            ? (firstUserMsg.parts?.find((p) => (p as { type: string }).type === "text") as { text?: string } | undefined)?.text?.slice(0, 60) ?? "New Chat"
            : "New Chat";
          const session = await createChatSession(apiKey, title);

          // Bail if tenant changed during the async call
          if (messagesTenantKeyRef.current !== apiKey) return;

          sessionIdRef.current = session.id;
          setActiveSessionId(session.id);
          queryClient.invalidateQueries({ queryKey: ["chatSessions", apiKey] });
        }

        // Persist each new message
        for (const msg of newMessages) {
          if (messagesTenantKeyRef.current !== apiKey) return;

          const textContent = msg.parts
            ?.filter((p) => (p as { type: string }).type === "text")
            .map((p) => (p as { type: string; text: string }).text)
            .join("") ?? "";
          const customPart = msg.parts?.find((p) => (p as { type: string }).type === "data-custom") as CustomDataPart | undefined;
          const sources = customPart?.data?.sources ?? null;
          const confidence = customPart?.data?.confidence_score ?? null;
          await addChatMessage(sessionIdRef.current, apiKey, msg.role, textContent, sources, confidence);
        }
        persistedCountRef.current = messages.length;
      } catch {
        // Silently fail — persistence is best-effort
      }
    };
    persist();
  }, [isStreaming, messages, selectedTenant.key, queryClient]);

  const handleSendMessage = (text: string) => { messagesTenantKeyRef.current = selectedTenant.key; sendMessage({ text }, { body: { apiKey: selectedTenant.key } }); };

  const handleSelectSession = async (session: ChatSessionResponse) => {
    setActiveSessionId(session.id);
    try {
      const fullSession = await getChatSession(session.id, selectedTenant.key);
      const uiMessages = fullSession.messages.map((msg: ChatMessageResponse) => {
        const parts: Array<{ type: "text"; text: string } | { type: "data-custom"; data: Record<string, unknown> }> = [
          { type: "text" as const, text: msg.content },
        ];
        if (msg.role === "assistant" && (msg.sources || msg.confidence_score !== null)) {
          parts.push({
            type: "data-custom" as const,
            data: {
              type: "sources",
              sources: msg.sources ?? [],
              confidence_score: msg.confidence_score ?? 0,
            },
          });
        }
        return {
          id: String(msg.id),
          role: msg.role as "user" | "assistant",
          parts,
        };
      });
      setMessages(uiMessages);
      sessionIdRef.current = session.id;
      persistedCountRef.current = uiMessages.length;
      messagesTenantKeyRef.current = selectedTenant.key;
    } catch {
      // If fetch fails, still show the session as selected but with empty messages
    }
  };

  const handleNewSession = (session: ChatSessionResponse) => {
    sessionIdRef.current = session.id;
    persistedCountRef.current = 0;
    setActiveSessionId(session.id);
    messagesTenantKeyRef.current = selectedTenant.key;
  };

  // Extract confidence score from the last assistant message
  const getConfidenceForMessage = (message: typeof messages[number]): number | null => {
    if (message.role !== "assistant") return null;
    for (const part of message.parts ?? []) {
      const p = part as CustomDataPart;
      if (p.type === "data-custom" && p.data?.type === "sources" && typeof p.data.confidence_score === "number") {
        return p.data.confidence_score;
      }
      if (p.type === "data-custom" && p.data?.type === "metadata" && typeof p.data.confidence_score === "number") {
        return p.data.confidence_score;
      }
    }
    return null;
  };

  // Handle citation click — find the source by index from current messages' sources
  const handleCitationClick = React.useCallback((citationIndex: number) => {
    // Collect all sources from all assistant messages
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts ?? []) {
        const p = part as CustomDataPart;
        if (p.type === "data-custom" && p.data?.type === "sources" && p.data.sources) {
          const source = p.data.sources.find((s: Source) => s.index === citationIndex);
          if (source) {
            setCitationSource(source);
            return;
          }
        }
      }
    }
    // Fallback: use array index (1-based)
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts ?? []) {
        const p = part as CustomDataPart;
        if (p.type === "data-custom" && p.data?.type === "sources" && p.data.sources) {
          const source = p.data.sources[citationIndex - 1];
          if (source) {
            setCitationSource(source);
            return;
          }
        }
      }
    }
  }, [messages]);

  const tenantTheme = TENANT_THEMES[selectedTenantId as keyof typeof TENANT_THEMES];

  const themeStyle = React.useMemo(() => ({
    "--primary": tenantTheme.primary,
    "--primary-foreground": tenantTheme.primaryForeground,
    "--sidebar-primary": tenantTheme.primary,
    "--sidebar-primary-foreground": tenantTheme.primaryForeground,
    "--chart-1": tenantTheme.primary,
  } as React.CSSProperties), [tenantTheme]);

  return (
    <div style={themeStyle} className="flex h-screen w-full flex-col bg-background text-foreground md:flex-row overflow-hidden">
      <aside className="hidden border-r border-border bg-muted/10 md:flex md:w-80 md:flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
          <div className="flex items-center gap-2 font-semibold">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"><IconActivity className="h-5 w-5" /></div>
            <span className="text-sm tracking-tight">Pharma AI</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            <TenantSelector value={selectedTenantId} onValueChange={setSelectedTenantId} tenants={TENANTS} />
            <Separator />
            <PDFUpload apiKey={selectedTenant.key} />
            <Separator />
            <ChatHistory
              apiKey={selectedTenant.key}
              activeSessionId={activeSessionId}
              onSelectSession={handleSelectSession}
              onNewSession={handleNewSession}
            />
            <Separator />
            <DocumentLibrary apiKey={selectedTenant.key} />
            <Separator />
            <MetricsPanel tenantId={selectedTenantId} apiKey={selectedTenant.key} />
          </div>
        </div>
        <div className="p-4 text-[10px] text-center text-muted-foreground border-t border-border bg-muted/20">Regulatory Assistant v1.0 &bull; Confidential</div>
      </aside>

      <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
        <ResizablePanel defaultSize={citationSource ? "65%" : "100%"} minSize="30%" className="flex">
          <main className="flex flex-1 flex-col overflow-hidden bg-background relative h-full">
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2 md:hidden">
                <div className="flex items-center gap-2 font-semibold"><IconActivity className="h-5 w-5 text-primary" /><span className="text-sm">Pharma AI</span></div>
              </div>
              <div className="flex items-center gap-2">
                <ExportButtons messages={messages} />
                <div className="md:hidden">
                  <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                    <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{TENANTS.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-hidden relative">
              <ScrollArea className="h-full">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 pb-32 md:p-8 md:pb-32">
                  {messages.length === 0 ? (
                    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center opacity-0 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-forwards">
                      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/5 shadow-inner"><IconMessage className="h-10 w-10 text-primary/60" /></div>
                      <div className="max-w-[420px] space-y-3">
                        <h3 className="text-xl font-semibold tracking-tight text-foreground">Welcome to {selectedTenant.label}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed text-balance">Ask questions about regulatory documents, guidelines, and compliance standards. I can search across millions of records to find precise answers.</p>
                      </div>
                    </div>
                  ) : (
                    messages.map((message, index) => {
                      const customPart = message.parts?.find((p) => (p as { type: string }).type === "data-custom") as { type: "data-custom"; data: { type: string; sources: Source[] } } | undefined;
                      const sources = customPart?.data?.sources ?? [];
                      const confidence = getConfidenceForMessage(message);
                      return (
                        <div key={message.id} className="flex flex-col gap-3 group animate-in fade-in slide-in-from-bottom-2 duration-300">
                          <ChatMessage message={message} isStreaming={index === messages.length - 1 && isStreaming} onCitationClick={handleCitationClick} />
                          {message.role === "assistant" && (
                            <div className="pl-4 md:pl-16 pr-4 flex items-center gap-2 flex-wrap">
                              {confidence !== null && confidence > 0 && <ConfidenceScore score={confidence} />}
                              {sources.length > 0 && <SourceList sources={sources} apiKey={selectedTenant.key} />}
                            </div>
                          )}
                          {message.role === "assistant" && !(index === messages.length - 1 && isStreaming) && sources.length === 0 && (!message.parts || message.parts.every((p) => (p as { type: string }).type !== "text" || !(p as { type: string; text: string }).text?.trim())) && (
                            <div className="pl-4 md:pl-16 pr-4">
                              <p className="text-sm text-muted-foreground italic">No relevant regulatory information found for this query. Try rephrasing your question or using more specific terminology.</p>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
              <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 z-20">
              <div className="mx-auto max-w-3xl">
                <div className="relative group">
                  <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-primary/20 to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity blur duration-500" />
                  <div className="relative bg-background rounded-2xl shadow-xl shadow-black/5 ring-1 ring-border/50">
                    <ChatInput onSubmit={handleSendMessage} disabled={isStreaming} placeholder={`Ask ${selectedTenant.label} a question...`} />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-muted-foreground/60">
                  {isStreaming && <IconLoader2 className="h-3 w-3 animate-spin text-primary" />}<span>AI-generated content can be inaccurate. Verify important information.</span>
                </div>
              </div>
            </div>
          </main>
        </ResizablePanel>

        {citationSource && (
          <>
            <ResizableHandle withHandle className="hidden md:flex" />
            <ResizablePanel defaultSize="35%" minSize="15%" maxSize="80%" className="hidden md:flex border-l border-border">
              <CitationSidebar
                open={citationSource !== null}
                onClose={() => setCitationSource(null)}
                source={citationSource}
                apiKey={selectedTenant.key}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* Mobile: full-screen overlay for citation sidebar */}
      {citationSource && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background md:hidden">
          <CitationSidebar
            open={citationSource !== null}
            onClose={() => setCitationSource(null)}
            source={citationSource}
            apiKey={selectedTenant.key}
          />
        </div>
      )}
    </div>
  );
}
