"use client";

import { useQuery } from "@tanstack/react-query";
import { IconDatabase } from "@tabler/icons-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMetrics } from "@/services/api";

interface MetricsPanelProps {
  tenantId: string;
  apiKey: string;
}

export function MetricsPanel({ tenantId, apiKey }: MetricsPanelProps) {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ["metrics", tenantId],
    queryFn: () => fetchMetrics(tenantId, apiKey),
    refetchInterval: 30000,
    enabled: !!apiKey,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <IconDatabase className="h-3 w-3" />
        <span>Live Metrics</span>
      </div>

      <div className="grid gap-4">
        <Card className="p-4 bg-background/40 border-border/60 shadow-none">
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Total Queries</div>
          <div className="text-2xl font-light tabular-nums tracking-tight">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              metrics?.total_queries.toLocaleString() ?? "—"
            )}
          </div>
        </Card>

        <Card className="p-4 bg-background/40 border-border/60 shadow-none">
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Avg Latency</div>
          <div className="text-2xl font-light tabular-nums tracking-tight">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="flex items-baseline gap-1">
                {metrics?.avg_response_time_ms ? Math.round(metrics.avg_response_time_ms) : "—"}
                <span className="text-sm text-muted-foreground font-medium">ms</span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
