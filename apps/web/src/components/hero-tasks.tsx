"use client";

import { LockKeyhole, RotateCcw, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";

type Sample = {
  task: string;
  pay: number;
  chips: string[];
  outcome: "pass" | "fail";
  verdict: string;
  rule: string;
};

// Real-world steps an agent can't do itself, each the kind of check a business pays a person for.
// Illustrative: what tasks on boreal.work look like, not live ones.
const SAMPLES: Sample[] = [
  {
    task: "Confirm the supplier really runs a warehouse at its listed address, before the buyer pays a 30% deposit",
    pay: 600,
    chips: ["Proven local resident", "Photo", "Due in 2 days"],
    outcome: "pass",
    verdict: "Storefront, business sign and street number match",
    rule: "R4.1",
  },
  {
    task: "Photograph the price tags of the three top-selling sunscreens at a big beauty store downtown",
    pay: 400,
    chips: ["Photo", "Under 10 minutes", "Due this week"],
    outcome: "pass",
    verdict: "Three tags readable, store visible in the second photo",
    rule: "R4.1",
  },
  {
    task: "From the street, photograph the pre-selling tower a buyer is paying for, and count its finished floors",
    pay: 800,
    chips: ["Photo", "Text", "Due in 3 days"],
    outcome: "pass",
    verdict: "Whole tower in frame; 14 finished floors, matching the photo",
    rule: "R4.1",
  },
  {
    task: "Check that the bank's branch on the main square opens at 9 a.m. on Saturdays, as its website says",
    pay: 300,
    chips: ["Photo", "Saturday", "Due in 4 days"],
    outcome: "fail",
    verdict: "The photo shows the door, but the posted hours aren't readable",
    rule: "R4.2",
  },
  {
    task: "Order the café's best seller and note how long it takes from paying to getting it",
    pay: 500,
    chips: ["Text", "Photo", "Due today"],
    outcome: "pass",
    verdict: "Receipt time and pickup photo show 7 minutes",
    rule: "R4.1",
  },
];

const EVERY_MS = 5_500;
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * The hero's sample task: cycles through real-world tasks and their verdicts, pausing while the
 * pointer is on it. People who ask for less motion pick one with the dots instead.
 */
export function HeroTasks({ privateReview }: { privateReview: boolean }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  // Only a swap animates: the first sample is there from the start, fully drawn.
  const [swapped, setSwapped] = useState(false);
  const show = (n: number) => {
    setSwapped(true);
    setI(n);
  };

  useEffect(() => {
    if (paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      setSwapped(true);
      setI((n) => (n + 1) % SAMPLES.length);
    }, EVERY_MS);
    return () => clearInterval(t);
  }, [paused]);

  const s = SAMPLES[i]!;
  return (
    <div
      className="relative flex flex-col gap-5 frost rounded-2xl border p-7"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p className="font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Sample task</p>
      <div key={i} className={`flex flex-col gap-5 ${swapped ? "animate-in duration-500 fade-in slide-in-from-bottom-2" : ""}`} aria-live="polite">
        <div className="flex items-start justify-between gap-6">
          <p className="min-h-[4.5rem] text-lg leading-snug">{s.task}</p>
          <p className="text-3xl font-light tracking-tight tabular-nums text-primary">{usd(s.pay)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {s.chips.map((c) => (
            <Badge key={c} variant="outline">
              {c}
            </Badge>
          ))}
        </div>
        <div className={`flex flex-col gap-1 rounded-2xl p-4 text-sm ${s.outcome === "pass" ? "bg-foreground/6" : "bg-destructive/10"}`}>
          <p className="font-medium">
            Reviewer verdict: {s.outcome} <span className="font-mono text-xs font-normal text-muted-foreground">· {s.rule}</span>
          </p>
          <p className="text-muted-foreground">{s.verdict}</p>
          {privateReview && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <LockKeyhole className="size-3.5 text-primary" aria-hidden /> Reviewed by private AI, with a signed proof
            </p>
          )}
        </div>
        {s.outcome === "pass" ? (
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <Wallet className="size-4" aria-hidden /> Paid {usd(s.pay)} to the worker
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <RotateCcw className="size-4" aria-hidden /> Not paid; the money is released to the agent
          </p>
        )}
      </div>
      <div className="flex gap-1.5" role="tablist" aria-label="Sample tasks">
        {SAMPLES.map((_, n) => (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={n === i}
            aria-label={`Sample task ${n + 1}`}
            onClick={() => show(n)}
            className={`h-1.5 rounded-full transition-all ${n === i ? "w-6 bg-primary" : "w-1.5 bg-foreground/20 hover:bg-foreground/40"}`}
          />
        ))}
      </div>
    </div>
  );
}
