"use client";

import * as React from "react";
import { IconFileTypePdf, IconMarkdown } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import type { UIMessage } from "ai";

interface ExportButtonsProps {
  messages: UIMessage[];
  className?: string;
}

function messagesToMarkdown(messages: UIMessage[]): string {
  const lines: string[] = [];
  lines.push("# Chat Export");
  lines.push("");
  lines.push(`Exported: ${new Date().toLocaleString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const msg of messages) {
    const role = msg.role === "user" ? "User" : "Assistant";
    lines.push(`## ${role}`);
    lines.push("");

    for (const part of msg.parts ?? []) {
      if ((part as { type: string }).type === "text") {
        lines.push((part as { type: string; text: string }).text);
        lines.push("");
      }
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportMarkdown(messages: UIMessage[]) {
  const md = messagesToMarkdown(messages);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  downloadBlob(blob, `chat-export-${Date.now()}.md`);
}

async function exportPDF(messages: UIMessage[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth() - 2 * margin;
  let y = margin;

  doc.setFontSize(16);
  doc.text("Chat Export", margin, y);
  y += 10;

  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(`Exported: ${new Date().toLocaleString()}`, margin, y);
  y += 10;
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(10);
  for (const msg of messages) {
    const role = msg.role === "user" ? "User" : "Assistant";

    doc.setFont("helvetica", "bold");
    doc.text(`${role}:`, margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");

    for (const part of msg.parts ?? []) {
      if ((part as { type: string }).type === "text") {
        const text = (part as { type: string; text: string }).text;
        const lines = doc.splitTextToSize(text, pageWidth) as string[];
        for (const line of lines) {
          if (y > doc.internal.pageSize.getHeight() - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(line, margin, y);
          y += 5;
        }
      }
    }

    y += 6;
    if (y > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  }

  doc.save(`chat-export-${Date.now()}.pdf`);
}

export function ExportButtons({ messages, className }: ExportButtonsProps) {
  const [exporting, setExporting] = React.useState(false);
  const hasMessages = messages.length > 0;

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      await exportPDF(messages);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPDF}
          disabled={!hasMessages || exporting}
          className="h-7 gap-1 rounded-full px-2.5 text-xs"
          aria-label="Export as PDF"
        >
          <IconFileTypePdf className="h-3.5 w-3.5" />
          PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportMarkdown(messages)}
          disabled={!hasMessages}
          className="h-7 gap-1 rounded-full px-2.5 text-xs"
          aria-label="Export as Markdown"
        >
          <IconMarkdown className="h-3.5 w-3.5" />
          MD
        </Button>
      </div>
    </div>
  );
}
