"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { UIMessage } from "@ai-sdk/react";
import { IconUser, IconRobot } from "@tabler/icons-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { CitationTag } from "@/components/chat/CitationTag";

interface ChatMessageProps {
  message: UIMessage;
  isStreaming?: boolean;
  onCitationClick?: (index: number) => void;
}

/** Regex to match citation markers like [1], [2], [12], etc. */
const CITATION_REGEX = /\[(\d+)\]/g;

interface TextSegment {
  type: "text";
  content: string;
}

interface CitationSegment {
  type: "citation";
  index: number;
}

type Segment = TextSegment | CitationSegment;

/**
 * Split text content into alternating text and citation segments.
 * E.g. "The FDA [1] requires [2] this" =>
 *   [{ type: "text", content: "The FDA " }, { type: "citation", index: 1 }, ...]
 */
function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(CITATION_REGEX)) {
    const matchStart = match.index!;
    if (matchStart > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, matchStart) });
    }
    segments.push({ type: "citation", index: parseInt(match[1], 10) });
    lastIndex = matchStart + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments;
}

export function ChatMessage({ message, isStreaming, onCitationClick }: ChatMessageProps) {
  const isUser = message.role === "user";

  const textContent = message.parts
    ?.filter((p) => (p as { type: string }).type === "text")
    .map((p) => (p as { type: string; text: string }).text)
    .join("") ?? "";

  const segments = useMemo(() => parseSegments(textContent), [textContent]);
  const hasCitations = segments.some((s) => s.type === "citation");

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
          ) : hasCitations ? (
            <div className="streamdown-chat">
              {segments.map((segment, i) =>
                segment.type === "citation" ? (
                  <CitationTag
                    key={`cite-${i}`}
                    index={segment.index}
                    onClick={onCitationClick}
                  />
                ) : (
                  <Streamdown
                    key={`text-${i}`}
                    plugins={{ code }}
                    isAnimating={i === segments.length - 1 && isStreaming}
                    className="streamdown-chat-inline"
                  >
                    {segment.content}
                  </Streamdown>
                )
              )}
            </div>
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
