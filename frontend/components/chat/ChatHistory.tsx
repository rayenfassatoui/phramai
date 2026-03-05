"use client";

import * as React from "react";
import { IconMessagePlus, IconTrash, IconMessages } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listChatSessions, createChatSession, deleteChatSession } from "@/services/api";
import type { ChatSessionResponse } from "@/services/api";
import { cn } from "@/lib/utils";

interface ChatHistoryProps {
  apiKey: string;
  activeSessionId: string | null;
  onSelectSession: (session: ChatSessionResponse) => void;
  onNewSession: (session: ChatSessionResponse) => void;
}

export function ChatHistory({
  apiKey,
  activeSessionId,
  onSelectSession,
  onNewSession,
}: ChatHistoryProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["chatSessions", apiKey],
    queryFn: () => listChatSessions(apiKey),
    staleTime: 30_000,
    enabled: !!apiKey,
  });

  const createMutation = useMutation({
    mutationFn: () => createChatSession(apiKey),
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({ queryKey: ["chatSessions", apiKey] });
      onNewSession(newSession);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => deleteChatSession(sessionId, apiKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatSessions", apiKey] });
    },
  });

  const sessions = data?.sessions ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          History
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="h-7 w-7 p-0"
          aria-label="New chat session"
        >
          <IconMessagePlus className="h-4 w-4" />
        </Button>
      </div>

      <div className="max-h-[320px] overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <IconMessages className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No chat history yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors cursor-pointer",
                  session.id === activeSessionId
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted/50 text-foreground",
                )}
                onClick={() => onSelectSession(session)}
                role="button"
                tabIndex={0}
                aria-label={`Chat: ${session.title}`}
                aria-current={session.id === activeSessionId ? "true" : undefined}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelectSession(session);
                }}
              >
                <span className="flex-1 truncate text-xs">{session.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMutation.mutate(session.id);
                  }}
                  className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  aria-label={`Delete chat: ${session.title}`}
                >
                  <IconTrash className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
