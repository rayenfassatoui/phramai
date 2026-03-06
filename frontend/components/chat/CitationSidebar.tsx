"use client";

import { useCallback, useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { IconFileText, IconLoader2, IconX } from "@tabler/icons-react";
import { fetchDocumentBlob } from "@/services/api";

import { ScrollArea } from "@/components/ui/scroll-area";

// Worker MUST be configured in the same file as <Document>/<Page>
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

interface Source {
  content: string;
  metadata: Record<string, string>;
  index?: number;
}

interface CitationSidebarProps {
  open: boolean;
  onClose: () => void;
  source: Source | null;
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

function normalizeWS(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function CitationSidebar({
  open,
  onClose,
  source,
  apiKey,
}: CitationSidebarProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filename = source?.metadata.filename || source?.metadata.source || "";
  const pageNumber = parseInt(source?.metadata.page_number || "1", 10) || 1;
  const highlightText = source?.content || "";
  const isPdf = filename.toLowerCase().endsWith(".pdf");

  // Fetch PDF blob when sidebar opens with a PDF source
  useEffect(() => {
    if (!open || !filename || !isPdf) {
      setBlobUrl(null);
      return;
    }
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
  }, [open, filename, apiKey, isPdf]);

  // Revoke blob URL on unmount or when source changes
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  // customTextRenderer: highlight matching text spans
  const textRenderer = useCallback(
    ({ str }: { str: string; itemIndex: number }): string => {
      if (!highlightText) return str;

      const escaped = escapeRegex(str);
      const normalizedHighlight = normalizeWS(highlightText);
      const normalizedStr = normalizeWS(str);

      if (
        normalizedHighlight.toLowerCase().includes(normalizedStr.toLowerCase()) &&
        normalizedStr.length > 2
      ) {
        return `<mark class="pdf-highlight">${str}</mark>`;
      }

      const pattern = new RegExp(escapeRegex(normalizedStr.slice(0, 30)), "gi");
      if (pattern.test(normalizedHighlight)) {
        return `<mark class="pdf-highlight">${str}</mark>`;
      }

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
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <IconFileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{filename || "Source"}</p>
            {isPdf && (
              <p className="text-xs text-muted-foreground">Page {pageNumber}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Close citation sidebar"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>

      {/* Source text excerpt */}
      {source && (
        <div className="px-4 py-3 border-b border-border/50 bg-muted/20 shrink-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Referenced passage
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground line-clamp-4">
            {source.content}
          </p>
        </div>
      )}

      {/* PDF viewer or text content */}
      <ScrollArea className="flex-1 min-h-0">
        {isPdf ? (
          <div className="p-4">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading PDF...</span>
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
              <div className="flex justify-center">
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
                    width={380}
                  />
                </Document>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4">
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
              <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                {source?.content || "No content available."}
              </p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
