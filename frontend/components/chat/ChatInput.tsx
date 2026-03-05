"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { IconSend } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSubmit,
  disabled,
  placeholder = "Type a message...",
}: ChatInputProps) {
  const [value, setValue] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (!value.trim() || disabled) return;
    onSubmit(value);
    setValue("");
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    e.target.style.height = "auto";
    const maxHeight = 24 * 5; // approx 5 rows
    e.target.style.height = `${Math.min(e.target.scrollHeight, maxHeight)}px`;
  };

  return (
    <div
      className={cn(
        "relative flex items-end gap-2 rounded-2xl border border-border/60 bg-background p-2 shadow-sm transition-all focus-within:border-primary/50 focus-within:shadow-md",
        disabled && "opacity-60 cursor-not-allowed bg-muted/20"
      )}
    >
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="min-h-[44px] w-full resize-none border-0 bg-transparent py-3 text-base shadow-none focus-visible:ring-0 disabled:cursor-not-allowed md:text-sm"
      />
      <Button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        size="icon"
        className={cn(
          "mb-0.5 h-10 w-10 shrink-0 rounded-full transition-all duration-200",
          value.trim() ? "opacity-100 scale-100" : "opacity-50 scale-95 bg-muted text-muted-foreground hover:bg-muted"
        )}
      >
        <IconSend className="h-5 w-5" />
        <span className="sr-only">Send</span>
      </Button>
    </div>
  );
}
