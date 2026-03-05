"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconFileText } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

interface Source {
  content: string;
  metadata: Record<string, string>;
}

interface SourceListProps {
  sources: Source[];
}

export function SourceList({ sources }: SourceListProps) {
  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1 text-sm font-medium text-muted-foreground/80">
        <IconFileText className="h-4 w-4" />
        <span>Sources</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((source, index) => (
          <Card
            key={index}
            className="flex flex-col justify-between gap-3 overflow-hidden rounded-xl border border-border/50 bg-card/50 p-3 shadow-sm transition-all hover:border-border/80 hover:bg-card hover:shadow-md"
          >
            <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
              {source.content}
            </p>
            
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
        ))}
      </div>
    </div>
  );
}
