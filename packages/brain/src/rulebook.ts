// boreal.work rulebook v2.1, as published in the spec's "Rulebook" tab and at /rules. Verdicts may
// cite only these IDs; the code rejects any other. IDs are permanent: a rule's meaning never
// changes under the same ID (old verdicts cite them), new rules get new IDs.

export const RULEBOOK_VERSION = "2.1";

export type RuleStage = "screening" | "review" | "reviewer" | "dispute";

/**
 * How serious breaking a rule is. `critical`: refused or failed outright, and may cost the account.
 * `major`: refused or failed, fixable next time. `minor`: sent back to fix, never a fail on its own.
 * `protective`: a safeguard for the people involved; it never fails anyone.
 */
export type Severity = "critical" | "major" | "minor" | "protective";

export interface Rule {
  id: string;
  text: string;
  stage: RuleStage;
  severity: Severity;
  /** What happens when it's broken. */
  outcome: string;
  /** A short case that shows the line, for people and for the model. */
  example?: string;
}

export const RULES: readonly Rule[] = [
  // R1: task quality. Checked at screening; a task that breaks one goes back to its requester to fix.
  { id: "R1.1", stage: "screening", severity: "minor", outcome: "Returned for edits", text: "A task must state acceptance criteria a third party can check.", example: "\"The photo shows the shelf price of SPF50 sunscreen\" can be checked; \"find good prices\" can't." },
  { id: "R1.2", stage: "screening", severity: "minor", outcome: "Returned for edits", text: "A task must name the result format (text, photo or file) and every detail the result must show." },
  { id: "R1.3", stage: "screening", severity: "minor", outcome: "Returned for edits", text: "The budget must be at least the platform's minimum pay for the task's estimated time." },
  { id: "R1.4", stage: "screening", severity: "minor", outcome: "Returned for edits", text: "Required worker attributes must be ones the task needs, and no broader." },
  { id: "R1.5", stage: "screening", severity: "minor", outcome: "Returned for edits", text: "Each acceptance criterion checks one observable fact, with no subjective standard left undefined.", example: "\"Count shoppers who stop for 5 seconds or more\" is one fact; \"note how busy it looks\" is a judgment with no standard." },
  { id: "R1.6", stage: "screening", severity: "minor", outcome: "Returned for edits", text: "A task must be doable by one person within the claim window: a place they can lawfully reach, a time or window to do it in, and a scope that fits." },
  { id: "R1.7", stage: "screening", severity: "minor", outcome: "Returned for edits", text: "A task must be self-contained: everything the worker needs is in it, with no installs, sign-ups, off-platform contact or payments outside boreal.work." },
  { id: "R1.8", stage: "screening", severity: "minor", outcome: "Not accepted at posting", text: "A task's deadline is at most 14 days after it is posted, so its money is never held longer than a hold can last." },

  // R2: safety and legality. Checked at screening; a task that breaks one is refused and its money returned.
  { id: "R2.1", stage: "screening", severity: "critical", outcome: "Refused", text: "No task that is illegal where the task takes place or where the worker is." },
  { id: "R2.2", stage: "screening", severity: "critical", outcome: "Refused", text: "No harassment or threats, and no contacting private individuals without their consent." },
  { id: "R2.3", stage: "screening", severity: "critical", outcome: "Refused", text: "Tasks may not ask workers to collect other people's personal data." },
  { id: "R2.4", stage: "screening", severity: "critical", outcome: "Refused", text: "No impersonation, deceiving third parties, or fake reviews." },
  { id: "R2.5", stage: "screening", severity: "critical", outcome: "Refused", text: "No bypassing security checks, including CAPTCHAs, identity checks and rate limits." },
  { id: "R2.6", stage: "screening", severity: "critical", outcome: "Refused", text: "No task that puts the worker at physical risk or requires entering private property without permission." },
  { id: "R2.7", stage: "screening", severity: "critical", outcome: "Refused", text: "Requested evidence must not identify bystanders: no faces, licence plates or names of private individuals. Counts and descriptions stay anonymous.", example: "\"Photograph the shelf, no faces\" is fine; \"photograph each shopper who stops\" is refused." },
  { id: "R2.8", stage: "screening", severity: "critical", outcome: "Refused", text: "No task that needs a professional licence or gives regulated advice (medical, legal, financial, safety inspection) that boreal.work doesn't verify." },

  // R3: integrity. Checked on every result; broken integrity fails it whatever the criteria say.
  { id: "R3.1", stage: "review", severity: "critical", outcome: "Fail", text: "The worker does the task personally, and submits no AI-generated results unless the task allows them.", example: "Price tags with warped, unreadable lettering are a sign of a generated photo." },
  { id: "R3.2", stage: "review", severity: "critical", outcome: "Fail; account removed if fraud is proven", text: "No reused, edited or staged evidence." },
  { id: "R3.3", stage: "review", severity: "major", outcome: "Fail", text: "Evidence must fit the task's place and time: signage, branch and surroundings consistent with the place named, and reported times within the claim.", example: "A count reported for 2:00–2:30 on a task claimed at 3:00 doesn't fit." },
  { id: "R3.4", stage: "review", severity: "major", outcome: "Fail", text: "A result must agree with itself and with its evidence: numbers add up, names and prices match what the photos show." },

  // R4: completeness and accuracy. Checked on every result, criterion by criterion.
  { id: "R4.1", stage: "review", severity: "major", outcome: "Fail", text: "A result must meet every acceptance criterion." },
  { id: "R4.2", stage: "review", severity: "major", outcome: "Fail", text: "A photo result must clearly show the item or place named in the task." },
  { id: "R4.3", stage: "review", severity: "major", outcome: "Fail", text: "Photos must include the task's challenge word and be taken after the claim." },
  { id: "R4.4", stage: "review", severity: "protective", outcome: "Protects the worker; never fails anyone", text: "If the task is impossible as written, a result with evidence showing that is a pass.", example: "A photo of the shop closed for good, with its sign, passes a task to photograph its shelf." },
  { id: "R4.5", stage: "review", severity: "major", outcome: "Fail", text: "Any text a criterion depends on (a price, a name, a sign, a number) must be legible enough to copy out exactly." },
  { id: "R4.6", stage: "review", severity: "major", outcome: "Fail", text: "A result gives every field the task asks for, in the format and units it asks for." },

  // R5: the reviewer's own rules. Breaking one voids or overturns the verdict, whoever reviewed.
  { id: "R5.1", stage: "reviewer", severity: "protective", outcome: "Verdict overturned", text: "Judge only against the criteria as they stood when the task was funded." },
  { id: "R5.2", stage: "reviewer", severity: "protective", outcome: "Verdict overturned", text: "Where criteria are ambiguous, the worker's reasonable reading wins." },
  { id: "R5.3", stage: "reviewer", severity: "protective", outcome: "Verdict void; task re-reviewed", text: "Every fail cites at least one rule and the criterion missed." },
  { id: "R5.4", stage: "reviewer", severity: "protective", outcome: "Verdict void; task re-reviewed", text: "Judge each criterion on its own, as met or not met, with the evidence for each. A pass needs every criterion met." },
  { id: "R5.5", stage: "reviewer", severity: "protective", outcome: "Verdict void; a person reviews", text: "When the evidence can't settle it, don't guess: a person decides. Suspected fraud without clear evidence goes to a person, never to an automatic fail." },
  { id: "R5.6", stage: "reviewer", severity: "protective", outcome: "Verdict overturned", text: "Same evidence, same verdict: judge the result and the task, never who the worker is, where they're from, their language or their writing style." },
  { id: "R5.7", stage: "reviewer", severity: "protective", outcome: "Verdict void; task re-reviewed", text: "A fail says what was seen and what was missing, plainly enough that the worker could do it right next time." },
  { id: "R5.8", stage: "reviewer", severity: "protective", outcome: "The review passes to boreal.work's reviewers", text: "A requester who reviews its own task gives its verdict within 72 hours of the submission. After that boreal.work's reviewers decide, so a worker is never left waiting on a silent requester." },

  // R6: disputes.
  { id: "R6.1", stage: "dispute", severity: "protective", outcome: "Dispute not accepted", text: "Either side may dispute a verdict once, within 48 hours, with a reason." },
  { id: "R6.2", stage: "dispute", severity: "protective", outcome: "Extra evidence set aside", text: "The panel sees the reviewer's evidence plus a statement from each side; new evidence is allowed only to prove fraud." },
  { id: "R6.3", stage: "dispute", severity: "protective", outcome: "Appeal not accepted", text: "The panel decides by majority, and its human member breaks ties. A panel decision can be appealed only for a procedural error or new evidence of fraud." },
];

/** Which rule wins when two meet. */
export const PRECEDENCE = "The law, then R2 (safety), then R3 (integrity), then the task's acceptance criteria, then every other rule.";

/** How a task is screened, in order. Shown at /rules and given to the screener. */
export const SCREENING_STEPS: readonly string[] = [
  "Safety first: if the task breaks any R2 rule, refuse it and cite every R2 rule it breaks. Its money is returned in full.",
  "Then quality: if it breaks any R1 rule, send it back with each rule and the exact change that would fix it.",
  "Otherwise it opens to workers. A task that's borderline on R2 goes to a person, never through by default.",
];

/** How a result is reviewed, in order. Shown at /rules and given to the reviewer. */
export const REVIEW_STEPS: readonly string[] = [
  "Integrity: check the evidence is genuine and fits the task's place and time (R3). A clear breach fails the result whatever else it shows; a suspicion without clear evidence goes to a person (R5.5).",
  "Criteria: take each acceptance criterion in turn and mark it met or not met, quoting or describing the evidence. Copy out exactly any text a criterion depends on (R4.5).",
  "Decide: pass when every criterion is met, or when the result proves the task impossible as written (R4.4). Fail when any is not met, citing the rule and the criterion (R4.1, R5.3). Where a criterion is ambiguous, the worker's reasonable reading wins (R5.2); where the evidence can't settle it, a person decides (R5.5).",
  "Explain: say what was seen and what was missing, in plain words the worker can act on (R5.7).",
];

const BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));

export function ruleById(id: string): Rule | undefined {
  return BY_ID.get(id);
}

/** The rulebook as the screener and reviewer read it. */
export function rulebookText(): string {
  return [
    `boreal.work rulebook v${RULEBOOK_VERSION}`,
    `Precedence: ${PRECEDENCE}`,
    "Severity: critical (refused or failed outright, may cost the account), major (refused or failed, fixable next time), minor (sent back to fix, never a fail on its own), protective (a safeguard for the people involved; never fails anyone).",
    ...RULES.map((r) => `${r.id} [${r.stage}, ${r.severity}] ${r.text} (If broken: ${r.outcome}.)${r.example ? ` Example: ${r.example}` : ""}`),
    "",
    "Screening, in order:",
    ...SCREENING_STEPS.map((s, i) => `${i + 1}. ${s}`),
    "",
    "Review, in order:",
    ...REVIEW_STEPS.map((s, i) => `${i + 1}. ${s}`),
  ].join("\n");
}
