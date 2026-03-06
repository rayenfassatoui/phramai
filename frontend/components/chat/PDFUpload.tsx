"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  IconUpload,
  IconCheck,
  IconLoader2,
  IconAlertCircle,
  IconX,
  IconFileTypePdf,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { uploadPDF, getPDFJobStatus } from "@/services/api";

interface PDFUploadProps {
  apiKey: string;
  className?: string;
}

type FileJobStatus = "uploading" | "processing" | "complete" | "failed";

interface UploadJob {
  id: string; // unique client-side id
  filename: string;
  status: FileJobStatus;
  jobId: string | null; // backend job_id, null while uploading
  progress: number; // 0-100
  error: string | null;
  chunks?: number;
  pages?: number;
}

const STORAGE_KEY = "phramai_upload_jobs";

/** Read persisted jobs from localStorage (only pending/processing ones) */
function loadPersistedJobs(tenantKey: string): UploadJob[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${tenantKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UploadJob[];
    // Only restore jobs that were still in-flight
    return parsed.filter(
      (j) => j.status === "processing" && j.jobId !== null,
    );
  } catch {
    return [];
  }
}

/** Persist in-flight jobs to localStorage */
function persistJobs(tenantKey: string, jobs: UploadJob[]) {
  try {
    const toSave = jobs.filter(
      (j) => j.status === "uploading" || j.status === "processing",
    );
    if (toSave.length === 0) {
      localStorage.removeItem(`${STORAGE_KEY}_${tenantKey}`);
    } else {
      localStorage.setItem(`${STORAGE_KEY}_${tenantKey}`, JSON.stringify(toSave));
    }
  } catch {
    // localStorage may be full or disabled
  }
}

export function PDFUpload({ apiKey, className }: PDFUploadProps) {
  const [jobs, setJobs] = React.useState<UploadJob[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const pollingRef = React.useRef<Set<string>>(new Set());
  const apiKeyRef = React.useRef(apiKey);
  apiKeyRef.current = apiKey;

  // Load persisted jobs on mount / tenant change and resume polling
  React.useEffect(() => {
    const restored = loadPersistedJobs(apiKey);
    if (restored.length > 0) {
      setJobs((prev) => {
        // Merge: keep existing + add restored that don't already exist
        const existingIds = new Set(prev.map((j) => j.id));
        const newJobs = restored.filter((j) => !existingIds.has(j.id));
        return [...prev, ...newJobs];
      });
      // Resume polling for restored jobs
      for (const job of restored) {
        if (job.jobId && !pollingRef.current.has(job.id)) {
          pollJob(job.id, job.jobId);
        }
      }
    }
    // Clear jobs from other tenants
    return () => {
      setJobs([]);
      pollingRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Persist jobs whenever they change
  React.useEffect(() => {
    persistJobs(apiKey, jobs);
  }, [apiKey, jobs]);

  const updateJob = React.useCallback(
    (id: string, update: Partial<UploadJob>) => {
      setJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, ...update } : j)),
      );
    },
    [],
  );

  const removeJob = React.useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    pollingRef.current.delete(id);
  }, []);

  const pollJob = React.useCallback(
    async (clientId: string, jobId: string) => {
      if (pollingRef.current.has(clientId)) return;
      pollingRef.current.add(clientId);

      const maxAttempts = 120; // 4 minutes at 2s intervals
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 2000));

        // Stop polling if we're no longer tracking this job
        if (!pollingRef.current.has(clientId)) return;

        try {
          const result = await getPDFJobStatus(jobId, apiKeyRef.current);

          if (result.status === "processing") {
            // Simulate progress: ramp from 40% to 90% during processing
            const processingProgress = Math.min(40 + (i / maxAttempts) * 50, 90);
            updateJob(clientId, { progress: Math.round(processingProgress) });
          }

          if (result.status === "complete") {
            updateJob(clientId, {
              status: "complete",
              progress: 100,
              chunks: result.chunks_created ?? 0,
              pages: result.total_pages ?? 0,
            });
            pollingRef.current.delete(clientId);
            queryClient.invalidateQueries({
              queryKey: ["tenantDocuments", apiKeyRef.current],
            });
            // Auto-remove completed jobs after 8 seconds
            setTimeout(() => removeJob(clientId), 8000);
            return;
          }

          if (result.status === "failed") {
            updateJob(clientId, {
              status: "failed",
              progress: 0,
              error: result.error ?? "Processing failed.",
            });
            pollingRef.current.delete(clientId);
            return;
          }
        } catch {
          // Retry silently on network errors
        }
      }

      // Timeout
      updateJob(clientId, {
        status: "failed",
        progress: 0,
        error: "Processing timed out.",
      });
      pollingRef.current.delete(clientId);
    },
    [queryClient, updateJob, removeJob],
  );

  const handleFileChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;

      // Create job entries for all files
      const newJobs: UploadJob[] = files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        filename: file.name,
        status: "uploading" as const,
        jobId: null,
        progress: 0,
        error: null,
      }));

      setJobs((prev) => [...prev, ...newJobs]);

      // Upload each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const job = newJobs[i];

        // Simulate upload progress (0-35%)
        updateJob(job.id, { progress: 10 });

        try {
          const response = await uploadPDF(file, apiKey);

          updateJob(job.id, {
            status: "processing",
            jobId: response.job_id,
            progress: 35,
          });

          // Start polling
          pollJob(job.id, response.job_id);
        } catch (err) {
          updateJob(job.id, {
            status: "failed",
            progress: 0,
            error: err instanceof Error ? err.message : "Upload failed.",
          });
        }
      }

      // Reset input so same files can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [apiKey, pollJob, updateJob],
  );

  const activeJobs = jobs.filter(
    (j) => j.status === "uploading" || j.status === "processing",
  );
  const hasActiveJobs = activeJobs.length > 0;

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        multiple
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload PDF files"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        className="h-8 gap-1.5 rounded-full px-3 text-xs w-full"
        aria-label="Upload PDF documents"
      >
        <IconUpload className="h-3.5 w-3.5" />
        <span>Upload PDF</span>
      </Button>

      {/* Upload queue */}
      {jobs.length > 0 && (
        <div className="mt-3 space-y-2">
          {jobs.map((job) => (
            <UploadJobItem
              key={job.id}
              job={job}
              onRemove={() => removeJob(job.id)}
            />
          ))}
        </div>
      )}

      {/* Active upload count indicator */}
      {hasActiveJobs && (
        <p className="mt-2 text-[10px] text-muted-foreground text-center animate-pulse">
          Processing {activeJobs.length} file{activeJobs.length > 1 ? "s" : ""}…
        </p>
      )}
    </div>
  );
}

function UploadJobItem({
  job,
  onRemove,
}: {
  job: UploadJob;
  onRemove: () => void;
}) {
  const statusColor = {
    uploading: "text-primary",
    processing: "text-amber-500",
    complete: "text-emerald-500",
    failed: "text-red-500",
  }[job.status];

  const statusIcon = {
    uploading: <IconLoader2 className="h-3 w-3 animate-spin text-primary" />,
    processing: <IconLoader2 className="h-3 w-3 animate-spin text-amber-500" />,
    complete: <IconCheck className="h-3 w-3 text-emerald-500" />,
    failed: <IconAlertCircle className="h-3 w-3 text-red-500" />,
  }[job.status];

  const statusLabel = {
    uploading: "Uploading…",
    processing: "Processing…",
    complete: job.pages
      ? `${job.pages} pages · ${job.chunks} chunks`
      : "Done",
    failed: job.error ?? "Failed",
  }[job.status];

  const progressColor = {
    uploading: "[&>[data-slot=progress-indicator]]:bg-primary",
    processing: "[&>[data-slot=progress-indicator]]:bg-amber-500",
    complete: "[&>[data-slot=progress-indicator]]:bg-emerald-500",
    failed: "[&>[data-slot=progress-indicator]]:bg-red-500",
  }[job.status];

  return (
    <div className="group relative rounded-lg border border-border/50 bg-muted/30 px-2.5 py-2 transition-colors hover:bg-muted/50">
      <div className="flex items-start gap-2">
        <IconFileTypePdf className="h-4 w-4 text-red-500/70 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium truncate text-foreground">
            {job.filename}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {statusIcon}
            <span className={`text-[10px] ${statusColor}`}>
              {statusLabel}
            </span>
            {(job.status === "uploading" || job.status === "processing") && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {job.progress}%
              </span>
            )}
          </div>
        </div>
        {(job.status === "complete" || job.status === "failed") && (
          <button
            onClick={onRemove}
            className="shrink-0 rounded-sm p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
            aria-label={`Dismiss ${job.filename}`}
          >
            <IconX className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      {(job.status === "uploading" || job.status === "processing") && (
        <Progress
          value={job.progress}
          className={`mt-1.5 h-1 ${progressColor}`}
        />
      )}
      {job.status === "complete" && (
        <Progress
          value={100}
          className={`mt-1.5 h-1 ${progressColor}`}
        />
      )}
    </div>
  );
}
