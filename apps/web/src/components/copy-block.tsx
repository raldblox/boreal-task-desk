"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/** A block of text to paste somewhere else (a command, config or prompt), with a copy button. */
export function CopyBlock({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="relative">
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-foreground p-4 pr-14 font-mono text-xs leading-relaxed text-background">
        {text}
      </pre>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={copy}
        aria-label={copied ? "Copied" : `Copy ${label}`}
        className="absolute top-2 right-2 text-background hover:bg-background/15 hover:text-background"
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}
