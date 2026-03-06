"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IconFileText,
  IconEye,
  IconLoader2,
  IconFiles,
  IconFileTypePdf,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { listTenantDocuments, getDocumentPreview, deleteTenantDocument } from "@/services/api";
import type { TenantDocumentInfo } from "@/services/api";

interface DocumentLibraryProps {
  apiKey: string;
}

export function DocumentLibrary({ apiKey }: DocumentLibraryProps) {
  const [previewDoc, setPreviewDoc] = React.useState<string | null>(null);
  const [previewContent, setPreviewContent] = React.useState<string>("");
  const [previewLoading, setPreviewLoading] = React.useState(false);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["tenantDocuments", apiKey],
    queryFn: () => listTenantDocuments(apiKey),
    staleTime: 30_000,
    enabled: !!apiKey,
  });

  const documents = data?.documents ?? [];

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => deleteTenantDocument(filename, apiKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenantDocuments", apiKey] });
    },
  });

  const handlePreview = React.useCallback(
    async (filename: string) => {
      setPreviewDoc(filename);
      setPreviewLoading(true);
      setPreviewContent("");
      try {
        const result = await getDocumentPreview(filename, apiKey);
        setPreviewContent(result.content);
      } catch {
        setPreviewContent("Failed to load document preview.");
      } finally {
        setPreviewLoading(false);
      }
    },
    [apiKey],
  );

  const getFileIcon = (filename: string) => {
    if (filename.toLowerCase().endsWith(".pdf")) {
      return <IconFileTypePdf className="h-4 w-4 text-red-500/80 shrink-0" />;
    }
    return <IconFileText className="h-4 w-4 text-primary/60 shrink-0" />;
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Documents
          </h3>
          {documents.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-medium">
              {documents.length}
            </Badge>
          )}
        </div>

        <ScrollArea className="max-h-[240px]">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <IconFiles className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No documents uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {documents.map((doc: TenantDocumentInfo) => (
                <div
                  key={doc.filename}
                  className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/50"
                >
                  {getFileIcon(doc.filename)}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate text-foreground">
                      {doc.filename}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {doc.chunk_count} chunks
                      {doc.last_page && ` \u00b7 ${doc.last_page} pages`}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => handlePreview(doc.filename)}
                      aria-label={`Preview ${doc.filename}`}
                    >
                      <IconEye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => deleteMutation.mutate(doc.filename)}
                      disabled={deleteMutation.isPending}
                      aria-label={`Delete ${doc.filename}`}
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <Dialog open={previewDoc !== null} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-5xl w-[90vw] h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 text-sm">
              {previewDoc && getFileIcon(previewDoc)}
              <span className="truncate">{previewDoc}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Document preview
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 mt-4 overflow-y-auto">
            {previewLoading ? (
              <div className="flex items-center justify-center py-12">
                <IconLoader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none pr-4">
                <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans text-foreground bg-transparent p-0 border-none">
                  {previewContent}
                </pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
