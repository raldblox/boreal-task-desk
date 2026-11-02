"use client";

import { FEE_POLICY, POLICY, quoteFees } from "@boreal/core";
import { useActionState, useState } from "react";

import type { ActionState } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const pct = (rate: number) => `${Math.round(rate * 100)}%`;

const DEADLINES = [
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "1 week" },
  { hours: 336, label: "2 weeks" },
];

const COUNTRIES = [
  { code: "", label: "Anywhere" },
  { code: "PH", label: "Philippines" },
  { code: "SG", label: "Singapore" },
  { code: "MY", label: "Malaysia" },
  { code: "ID", label: "Indonesia" },
  { code: "TH", label: "Thailand" },
  { code: "VN", label: "Vietnam" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "DE", label: "Germany" },
];

const selectClass = "h-9 rounded-lg border border-input bg-background px-2.5 text-sm";

/**
 * A person's task, field for field what post_task takes, with the fee quote worked out as they
 * type. `maxTask` is what they can post per task today (lower without Concordium ID).
 */
export function PostForm({ action, maxTask, verified }: { action: Action; maxTask: number; verified: boolean }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [budget, setBudget] = useState("5.00");
  const [reviewer, setReviewer] = useState<"requester" | "boreal">("requester");
  const [criteria, setCriteria] = useState("");

  const cents = Math.round(Number(budget) * 100);
  const quote = Number.isSafeInteger(cents) && cents > 0 ? quoteFees(cents, { reviewer }) : null;
  const checks = criteria.split("\n").filter((l) => l.trim()).length;
  const overCap = cents > maxTask;

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <section className="flex flex-col gap-5 rounded-2xl border bg-card p-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="description">What should the worker do?</Label>
          <Textarea
            id="description"
            name="description"
            rows={4}
            required
            minLength={20}
            maxLength={4000}
            placeholder="Go to the 7-Eleven at 1234 Taft Avenue, Malate, Manila, and photograph the 500 ml Nature's Spring bottles with their price tag."
          />
          <p className="text-xs text-muted-foreground">Plain words a stranger can follow: the exact place, item and what the result must show.</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="criteria">What counts as done</Label>
          <Textarea
            id="criteria"
            name="criteria"
            rows={4}
            required
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            placeholder={"The photo shows the 500 ml bottles on a shelf\nThe price tag is readable"}
          />
          <p className={`text-xs ${checks > 10 ? "text-destructive" : "text-muted-foreground"}`}>
            One check per line, 1 to 10 ({checks} so far). Each must be something a stranger can verify from the result alone:
            the reviewer judges against these and nothing else.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="resultFormat">What the worker sends back</Label>
          <select id="resultFormat" name="resultFormat" defaultValue="photo" className={selectClass}>
            <option value="photo">A photo</option>
            <option value="text">A written answer</option>
            <option value="file">A file (image or PDF)</option>
          </select>
        </div>
      </section>

      <section className="flex flex-col gap-5 rounded-2xl border bg-card p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">Who can take it</h2>
          <p className="text-sm text-muted-foreground">
            Optional. Either one limits the task to workers who proved it with Concordium ID, so it may take longer to fill.
          </p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Who can do this</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="fulfilment" value="people" defaultChecked /> People only
          </label>
          {/* Agents from NEAR Agent Market will fulfil tasks too; until then the choice is shown, not offered. */}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="radio" name="fulfilment" value="people_or_agents" disabled /> People or agents (coming soon)
          </label>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="adult" /> Only workers who are 18 or older
        </label>
        <div className="flex flex-col gap-2">
          <Label htmlFor="country">Worker lives in</Label>
          <select id="country" name="country" defaultValue="" className={selectClass}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="flex flex-col gap-5 rounded-2xl border bg-card p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="budget">Worker&apos;s pay (US$)</Label>
            <Input
              id="budget"
              name="budget"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max={(POLICY.maxTaskBudget / 100).toFixed(2)}
              required
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
            <p className={`text-xs ${overCap ? "text-destructive" : "text-muted-foreground"}`}>
              Up to {usd(maxTask)} a task
              {verified ? "." : ` until you add Concordium ID on My account (then up to ${usd(POLICY.maxTaskBudget)}).`} Pay
              fairly for the time it takes.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="deadlineHours">Deadline</Label>
            <select id="deadlineHours" name="deadlineHours" defaultValue="72" className={selectClass}>
              {DEADLINES.map((d) => (
                <option key={d.hours} value={d.hours}>
                  {d.label} from now
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">If nobody takes it by then, you get everything back.</p>
          </div>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">Who reviews the result</legend>
          <label className="flex gap-3 rounded-xl border p-4 has-checked:border-primary/50 has-checked:bg-primary-soft/30">
            <input
              type="radio"
              name="reviewer"
              value="requester"
              checked={reviewer === "requester"}
              onChange={() => setReviewer("requester")}
              className="mt-1"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">I&apos;ll review it myself</span>
              <span className="text-sm text-muted-foreground">
                No review fee. Your pass is final at once and pays the worker. A fail must cite a rule, and the worker can
                dispute it once to a human panel.
              </span>
            </span>
          </label>
          <label className="flex gap-3 rounded-xl border p-4 has-checked:border-primary/50 has-checked:bg-primary-soft/30">
            <input
              type="radio"
              name="reviewer"
              value="boreal"
              checked={reviewer === "boreal"}
              onChange={() => setReviewer("boreal")}
              className="mt-1"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">boreal reviews it</span>
              <span className="text-sm text-muted-foreground">
                boreal&apos;s reviewer judges it against your checks, for a {pct(FEE_POLICY.reviewRate)} review fee. You can
                accept a pass early, or dispute a verdict once.
              </span>
            </span>
          </label>
        </fieldset>

        <dl className="grid gap-1.5 rounded-xl bg-muted/60 p-4 text-sm" aria-live="polite">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Worker&apos;s pay</dt>
            <dd className="tabular-nums">{quote ? usd(quote.budget) : "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              Platform fee ({pct(FEE_POLICY.platformRate)}, at least {usd(FEE_POLICY.platformMin)})
            </dt>
            <dd className="tabular-nums">{quote ? usd(quote.platformFee) : "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              Review fee {reviewer === "boreal" ? `(${pct(FEE_POLICY.reviewRate)}, at least ${usd(FEE_POLICY.reviewMin)})` : "(you review)"}
            </dt>
            <dd className="tabular-nums">{quote ? usd(quote.reviewFee) : "—"}</dd>
          </div>
          <div className="mt-1 flex justify-between border-t pt-2 font-semibold">
            <dt>You pay into escrow</dt>
            <dd className="tabular-nums">{quote ? usd(quote.total) : "—"}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Nothing is charged now. boreal checks the task against its rulebook first; then you pay with PayPal, which holds
          the money until the work passes. If it fails, expires or you cancel before anyone claims it, the hold is released
          {reviewer === "boreal" ? " (a fail still pays the review fee)" : ""}.
        </p>
      </section>

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" disabled={pending || overCap || checks > 10} className="w-full sm:w-fit">
        {pending ? "Posting…" : "Post for screening"}
      </Button>
    </form>
  );
}
