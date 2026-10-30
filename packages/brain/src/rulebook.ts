// boreal rulebook v1.0, as published in the spec's "Rulebook v1" tab. Verdicts may cite only
// these IDs; the code rejects any other.

export const RULEBOOK_VERSION = "1.0";

export type RuleStage = "screening" | "review" | "reviewer" | "dispute";

export interface Rule {
  id: string;
  text: string;
  stage: RuleStage;
  /** What happens when it's broken. */
  outcome: string;
}

export const RULES: readonly Rule[] = [
  { id: "R1.1", stage: "screening", outcome: "Returned for edits", text: "A task must state acceptance criteria a third party can check." },
  { id: "R1.2", stage: "screening", outcome: "Returned for edits", text: "A task must name the result format (text, photo or file) and every detail the result must show." },
  { id: "R1.3", stage: "screening", outcome: "Returned for edits", text: "The budget must be at least the platform's minimum pay for the task's estimated time." },
  { id: "R1.4", stage: "screening", outcome: "Returned for edits", text: "Required worker attributes must be ones the task needs, and no broader." },
  { id: "R2.1", stage: "screening", outcome: "Refused", text: "No task that is illegal where the task takes place or where the worker is." },
  { id: "R2.2", stage: "screening", outcome: "Refused", text: "No harassment or threats, and no contacting private individuals without their consent." },
  { id: "R2.3", stage: "screening", outcome: "Refused", text: "Tasks may not ask workers to collect other people's personal data." },
  { id: "R2.4", stage: "screening", outcome: "Refused", text: "No impersonation, deceiving third parties, or fake reviews." },
  { id: "R2.5", stage: "screening", outcome: "Refused", text: "No bypassing security checks, including CAPTCHAs, identity checks and rate limits." },
  { id: "R2.6", stage: "screening", outcome: "Refused", text: "No task that puts the worker at physical risk or requires entering private property without permission." },
  { id: "R3.1", stage: "review", outcome: "Fail", text: "The worker does the task personally, and submits no AI-generated results unless the task allows them." },
  { id: "R3.2", stage: "review", outcome: "Fail; account removed if fraud is proven", text: "No reused, edited or staged evidence." },
  { id: "R4.1", stage: "review", outcome: "Fail", text: "A result must meet every acceptance criterion." },
  { id: "R4.2", stage: "review", outcome: "Fail", text: "A photo result must clearly show the item or place named in the task." },
  { id: "R4.3", stage: "review", outcome: "Fail", text: "Photos must include the task's challenge word and be taken after the claim." },
  { id: "R4.4", stage: "review", outcome: "Protects the worker; never fails anyone", text: "If the task is impossible as written, a result with evidence showing that is a pass." },
  { id: "R5.1", stage: "reviewer", outcome: "Verdict overturned", text: "Judge only against the criteria as they stood when the task was funded." },
  { id: "R5.2", stage: "reviewer", outcome: "Verdict overturned", text: "Where criteria are ambiguous, the worker's reasonable reading wins." },
  { id: "R5.3", stage: "reviewer", outcome: "Verdict void; task re-reviewed", text: "Every fail cites at least one rule and the criterion missed." },
  { id: "R6.1", stage: "dispute", outcome: "Dispute not accepted", text: "Either side may dispute a verdict once, within 48 hours, with a reason." },
  { id: "R6.2", stage: "dispute", outcome: "Extra evidence set aside", text: "The panel sees the reviewer's evidence plus a statement from each side; new evidence is allowed only to prove fraud." },
  { id: "R6.3", stage: "dispute", outcome: "Appeal not accepted", text: "The panel decides by majority, and its human member breaks ties. A panel decision can be appealed only for a procedural error or new evidence of fraud." },
];

const BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));

export function ruleById(id: string): Rule | undefined {
  return BY_ID.get(id);
}

/** The rulebook as the reviewer reads it. */
export function rulebookText(): string {
  return [
    `boreal rulebook v${RULEBOOK_VERSION}`,
    "Precedence: the law, then R2, then the task's acceptance criteria, then every other rule.",
    ...RULES.map((r) => `${r.id} [${r.stage}] ${r.text} (If broken: ${r.outcome}.)`),
  ].join("\n");
}
