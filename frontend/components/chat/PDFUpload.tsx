"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { IconUpload, IconCheck, IconLoader2, IconAlertCircle } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { uploadPDF, getPDFJobStatus } from "@/services/api";

interface PDFUploadProps {
  apiKey: string;
  className?: string;
}

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; filename: string }
  | { status: "processing"; filename: string; jobId: string }
  | { status: "complete"; filename: string; chunks: number; pages: number }
  | { status: "error"; filename: string; error: string };

export function PDFUpload({ apiKey, className }: PDFUploadProps) {
  const [state, setState] = React.useState<UploadState>({ status: "idle" });
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const pollJobStatus = React.useCallback(
    async (jobId: string, filename: string) => {
      const maxAttempts = 60;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const status = await getPDFJobStatus(jobId, apiKey);
          if (status.status === "complete") {
            setState({
              status: "complete",
              filename,
              chunks: status.chunks_created ?? 0,
              pages: status.total_pages ?? 0,
            });
            queryClient.invalidateQueries({ queryKey: ["tenantDocuments", apiKey] });
            // Reset to idle after 5 seconds so user can upload another file
            setTimeout(() => setState({ status: "idle" }), 5000);
            return;
          }
          if (status.status === "failed") {
            setState({
              status: "error",
              filename,
              error: status.error ?? "Processing failed.",
            });
            return;
          }
        } catch {
          // Retry on network errors
        }
      }
      setState({ status: "error", filename, error: "Processing timed out." });
    },
    [apiKey, queryClient],
  );

  const handleFileChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setState({ status: "uploading", filename: file.name });

      try {
        const response = await uploadPDF(file, apiKey);
        setState({ status: "processing", filename: file.name, jobId: response.job_id });
        pollJobStatus(response.job_id, file.name);
      } catch (err) {
        setState({
          status: "error",
          filename: file.name,
          error: err instanceof Error ? err.message : "Upload failed.",
        });
      }

      // Reset input so same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [apiKey, pollJobStatus],
  );

  const stateIcon = () => {
    switch (state.status) {
      case "uploading":
      case "processing":
        return <IconLoader2 className="h-3.5 w-3.5 animate-spin" />;
      case "complete":
        return <IconCheck className="h-3.5 w-3.5 text-emerald-500" />;
      case "error":
        return <IconAlertCircle className="h-3.5 w-3.5 text-red-500" />;
      default:
        return <IconUpload className="h-3.5 w-3.5" />;
    }
  };

  const stateLabel = () => {
    switch (state.status) {
      case "uploading":
        return "Uploading...";
      case "processing":
        return "Processing...";
      case "complete":
        return `${state.pages} pages, ${state.chunks} chunks`;
      case "error":
        return "Failed";
      default:
        return "Upload PDF";
    }
  };

  const isDisabled = state.status === "uploading" || state.status === "processing";

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload PDF file"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={isDisabled}
        className="h-8 gap-1.5 rounded-full px-3 text-xs"
        aria-label="Upload PDF document"
      >
        {stateIcon()}
        <span>{stateLabel()}</span>
      </Button>
      {state.status === "error" && (
        <p className="mt-1 text-[10px] text-red-500">{state.error}</p>
      )}
    </div>
  );
}
