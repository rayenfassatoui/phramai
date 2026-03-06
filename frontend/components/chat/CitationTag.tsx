"use client";

import { cn } from "@/lib/utils";

interface CitationTagProps {
  index: number;
  onClick?: (index: number) => void;
  className?: string;
}

export function CitationTag({ index, onClick, className }: CitationTagProps) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(index)}
      className={cn(
        "inline-flex items-center justify-center",
        "ml-0.5 mr-0.5 align-super",
        "min-w-[1.25rem] h-5 px-1 rounded-md",
        "text-[10px] font-semibold leading-none",
        "bg-primary/15 text-primary hover:bg-primary/25",
        "border border-primary/20 hover:border-primary/40",
        "transition-all duration-150 cursor-pointer",
        "hover:scale-110 active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1",
        className,
      )}
      aria-label={`View source ${index}`}
      title={`View source ${index}`}
    >
      {index}
    </button>
  );
}
