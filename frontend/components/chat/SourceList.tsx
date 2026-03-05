"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconFileText, IconEye } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// SSR-disabled import — react-pdf uses window/canvas at import time
const SourcePreview = dynamic(
  () =>
    import("@/components/chat/SourcePreview").then((m) => m.SourcePreview),
  { ssr: false },
);

interface Source {
  content: string;
  metadata: Record<string, string>;
}

interface SourceListProps {
  sources: Source[];
  apiKey: string;
}

interface PreviewState {
  filename: string;
  pageNumber: number;
  highlightText: string;
}

export function SourceList({ sources, apiKey }: SourceListProps) {
  const [preview, setPreview] = useState<PreviewState | null>(null);

  if (!sources || sources.length === 0) {
    return null;
  }

  const handleSourceClick = (source: Source) => {
    const filename =
      source.metadata.filename || source.metadata.source || "";
    const pageNumber = parseInt(source.metadata.page_number || "1", 10);

    if (!filename) return;

    setPreview({
      filename,
      pageNumber: isNaN(pageNumber) ? 1 : pageNumber,
      highlightText: source.content,
    });
  };

  const hasPdfSource = (source: Source): boolean => {
    const filename =
      source.metadata.filename || source.metadata.source || "";
    return filename.toLowerCase().endsWith(".pdf");
  };

  return (
    <>
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 px-1 text-sm font-medium text-muted-foreground/80">
          <IconFileText className="h-4 w-4" />
          <span>Sources</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((source, index) => {
            const isPdf = hasPdfSource(source);
            return (
              <Card
                key={index}
                role={isPdf ? "button" : undefined}
                tabIndex={isPdf ? 0 : undefined}
                onClick={isPdf ? () => handleSourceClick(source) : undefined}
                onKeyDown={
                  isPdf
                    ? (e: React.KeyboardEvent) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSourceClick(source);
                        }
                      }
                    : undefined
                }
                className={cn(
                  "flex flex-col justify-between gap-3 overflow-hidden rounded-xl border border-border/50 bg-card/50 p-3 shadow-sm transition-all hover:border-border/80 hover:bg-card hover:shadow-md",
                  isPdf && "cursor-pointer group"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {source.content}
                  </p>
                  {isPdf && (
                    <IconEye className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-hover:text-primary transition-colors mt-0.5" />
                  )}
                </div>

                {Object.keys(source.metadata).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {Object.entries(source.metadata).map(([key, value]) => (
                      <Badge
                        key={key}
                        variant="outline"
                        className="max-w-full truncate rounded-md border-border/50 bg-background/50 px-1.5 py-0 text-[10px] font-medium text-muted-foreground hover:bg-background"
                      >
                        <span className="opacity-70">{key}:</span> {value}
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {preview && (
        <SourcePreview
          open={true}
          onOpenChange={(open) => {
            if (!open) setPreview(null);
          }}
          filename={preview.filename}
          pageNumber={preview.pageNumber}
          highlightText={preview.highlightText}
          apiKey={apiKey}
        />
      )}
    </>
  );
}
