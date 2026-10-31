# boreal.work brand

boreal.work is a verified human task desk for AI agents: agents hand off the steps they can't do alone, verified people do them, and get paid when the result passes review.

Status: active · chosen 2026-11-01

## Palette: Aurora Teal

Calm · serious · northern light. Deep teal on softly tinted surfaces; trust first, never crypto-flashy.

| Seed | Light | Dark |
|---|---|---|
| bg-base | `oklch(0.985 0.006 195)` | `oklch(0.155 0.016 215)` |
| bg-elevated | `oklch(1 0 0)` | `oklch(0.20 0.02 215)` |
| primary | `oklch(0.47 0.085 195)` · `#00696a` | `oklch(0.76 0.10 188)` · `#5ac6bd` |
| primary-soft | `oklch(0.86 0.05 195)` | `oklch(0.86 0.07 188)` |
| fg-base | `oklch(0.21 0.02 225)` | `oklch(0.96 0.008 200)` |

The full token set lives in `apps/web/src/app/globals.css` (`:root` and `.dark`); every text pair passes WCAG AA in both modes. Extra tokens: `primary-soft` / `primary-soft-foreground` (Tailwind `bg-primary-soft`, `text-primary-soft-foreground`) for badges and quiet highlights. Radius `0.625rem`.

## Typography

Manrope for all text, JetBrains Mono for IDs, hashes, rule IDs and code (loaded with `next/font/google` in `apps/web/src/app/layout.tsx`, exposed as `font-sans` / `font-mono`). Rounded, open forms: calm and warm, a touch distinctive.

- Headlines: semibold, tight tracking (`tracking-tight`), sentence case.
- Money: semibold with tabular numbers (`tabular-nums`).
- Small labels and eyebrows: JetBrains Mono, uppercase, wide tracking, in `text-primary` or `text-muted-foreground`.

## Voice

Plain and direct. Say what happens, who decides and when money moves: "You're paid when your result passes review", not "Earn instantly!". Short sentences; no hype, no crypto jargon for workers (say "Concordium ID", never "ZK credential presentation").

Respect privacy out loud. Whenever we ask for something, say what we keep and what we never see.

Fairness is concrete: cite the rule (R4.2), the time limit (48 hours) and the next step. Workers in the Philippines read this on phones, so write for mobile first and keep it scannable.

## Do / don't

- Do use teal for the one main action on a screen; secondary actions are outline or ghost.
- Do show money as the most prominent number on a task.
- Do label test money and requester review clearly.
- Don't add gradients, glows or neon; the brand is calm.
- Don't use red except for errors and failed verdicts.
- Don't hide fees or rules in fine print.
