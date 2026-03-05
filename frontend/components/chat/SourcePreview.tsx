"use client";

import { useCallback, useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { IconFileText, IconLoader2 } from "@tabler/icons-react";
import { fetchDocumentBlob } from "@/services/api";

// Worker MUST be configured in the same file as <Document>/<Page>
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

interface SourcePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string;
  pageNumber: number;
  highlightText: string;
  apiKey: string;
}

const PDF_OPTIONS = {
  cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalize whitespace in a string so that any run of whitespace becomes a
 * single space. This lets us match chunk text against the text-layer spans
 * even when the PDF renderer inserts different whitespace.
 */
function normalizeWS(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function SourcePreview({
  open,
  onOpenChange,
  filename,
  pageNumber,
  highlightText,
  apiKey,
}: SourcePreviewProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch PDF blob when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setBlobUrl(null);

    fetchDocumentBlob(filename, apiKey)
      .then((url) => {
        if (!cancelled) {
          setBlobUrl(url);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, filename, apiKey]);

  // Revoke blob URL on unmount or when dialog closes
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  // customTextRenderer: highlight matching text spans
  const textRenderer = useCallback(
    ({ str }: { str: string; itemIndex: number }): string => {
      if (!highlightText) return str;

      // Try exact match first
      const escaped = escapeRegex(str);
      const normalizedHighlight = normalizeWS(highlightText);

      // Check if this span's text appears within the highlight chunk
      const normalizedStr = normalizeWS(str);
      if (
        normalizedHighlight.toLowerCase().includes(normalizedStr.toLowerCase()) &&
        normalizedStr.length > 2
      ) {
        return `<mark class="pdf-highlight">${str}</mark>`;
      }

      // Otherwise check if the highlight text appears within this span
      const pattern = new RegExp(escapeRegex(normalizedStr.slice(0, 30)), "gi");
      if (pattern.test(normalizedHighlight)) {
        return `<mark class="pdf-highlight">${str}</mark>`;
      }

      // Fallback: check words overlap
      const highlightWords = normalizedHighlight
        .toLowerCase()
        .split(" ")
        .filter((w) => w.length > 4);
      const strWords = normalizedStr.toLowerCase().split(" ");

      const matchCount = strWords.filter((w) =>
        highlightWords.some((hw) => hw.includes(w) || w.includes(hw)),
      ).length;

      if (strWords.length > 0 && matchCount / strWords.length > 0.6) {
        return `<mark class="pdf-highlight">${str}</mark>`;
      }

      return escaped.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") !== str
        ? str
        : str;
    },
    [highlightText],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <IconFileText className="h-4 w-4" />
            {filename}
            <span className="ml-1 text-muted-foreground font-normal">
              — Page {pageNumber}
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            PDF source preview showing page {pageNumber} of {filename}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto rounded-lg border border-border/50 bg-muted/20 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading PDF...
              </span>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <p className="text-sm text-destructive">{error}</p>
              <p className="text-xs text-muted-foreground">
                The document may need to be re-uploaded for preview.
              </p>
            </div>
          )}

          {blobUrl && !loading && !error && (
            <div className="flex justify-center p-4">
              <Document
                file={blobUrl}
                options={PDF_OPTIONS}
                loading={
                  <div className="flex items-center justify-center py-20">
                    <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                }
                error={
                  <div className="text-sm text-destructive py-10 text-center">
                    Failed to render PDF.
                  </div>
                }
              >
                <Page
                  pageNumber={pageNumber}
                  renderTextLayer={true}
                  renderAnnotationLayer={false}
                  customTextRenderer={textRenderer}
                  loading={null}
                  width={600}
                />
              </Document>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
