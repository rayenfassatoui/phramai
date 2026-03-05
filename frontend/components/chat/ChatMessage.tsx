"use client";

import { cn } from "@/lib/utils";
import type { UIMessage } from "@ai-sdk/react";
import { IconUser, IconRobot } from "@tabler/icons-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";

interface ChatMessageProps {
  message: UIMessage;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";

  const textContent = message.parts
    ?.filter((p) => (p as { type: string }).type === "text")
    .map((p) => (p as { type: string; text: string }).text)
    .join("") ?? "";

  return (
    <div
      className={cn(
        "flex w-full gap-4 p-4 md:p-6",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full border border-border bg-background shadow-sm">
          <IconRobot className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      <div
        className={cn(
          "relative max-w-[80%] rounded-2xl px-5 py-3 text-sm leading-relaxed shadow-sm transition-all",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-none"
            : "bg-muted/30 text-foreground rounded-bl-none border border-border/40"
        )}
      >
        <div className="break-words">
          {isUser ? (
            <span className="whitespace-pre-wrap">{textContent}</span>
          ) : (
            <Streamdown
              plugins={{ code }}
              isAnimating={isStreaming}
              className="streamdown-chat"
            >
              {textContent}
            </Streamdown>
          )}

          {isStreaming && !isUser && !textContent && (
            <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-primary align-middle" />
          )}
        </div>
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <IconUser className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
