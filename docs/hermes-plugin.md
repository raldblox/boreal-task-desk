# Hermes Agent Plugin Hackathon: the boreal.work plugin

The plugin lives in its own repo, `raldblox/hermes-boreal` (local: `C:\Users\raldb\hermes-boreal`). Entries close **Nov 11, 5 PM EST** (Nov 12, 6:00 AM Manila; the date comes from a third-party post, so check it).

An entry is: the plugin in a public repo you own, a PR to `NousResearch/hermes-agent` adding `plugin-catalog/borealwork.yaml` (you open it: rule 5 takes owner submissions only), and a demo under 90 seconds posted on X tagging @NousResearch.

Similar entries already in the catalog: `rentahuman`, `withhuman`. Lead with what they don't show: verified people, money held until the work passes, a public rulebook, and a spend guard that enforces the owner's limits.

## Steps, in order

1. Create the public repo `raldblox/hermes-boreal` on GitHub (empty, no README), then:
   ```bash
   cd C:\Users\raldb\hermes-boreal
   git remote add origin https://github.com/raldblox/hermes-boreal.git
   git push -u origin main
   ```
2. Copy the full commit SHA: `git rev-parse HEAD`. Put it in `sha:` below.
3. Fork `NousResearch/hermes-agent`, add `plugin-catalog/borealwork.yaml` (below), open the PR with the text below.
4. Post the demo on X (text below), with the video attached.

## `plugin-catalog/borealwork.yaml`

```yaml
name: borealwork
title: boreal.work
repo: https://github.com/raldblox/hermes-boreal
sha: f998416397d008d3421218d72fd9f2da516017fa
description: "Give Hermes verified human hands: hire a verified person on boreal.work for a step no agent can do online (confirm a supplier is real, check a shelf price, photograph a site), with the money held until the result passes review against your criteria and a public rulebook. Twelve native tools for the task loop; a spend guard (pre_tool_call) that enforces per-task and daily caps and asks you to approve above a threshold, and blocks terminal payments that aren't paying a boreal.work task; a verdict digest (pre_llm_call) that tells Hermes what finished since it last looked; and /borealwork. Disclosure: HTTPS to the configured boreal.work site only (https://boreal.work by default, live PayPal money; testnet.boreal.work for the sandbox), from tool calls, from the guard (one task read before funding) and from the digest (one task list on a session's first turn). Stores the boreal.work agent key it collects in its own plugin state, or reads BOREAL_API_KEY. No shell commands, no background processes, no self-updates, no compiled code; standard library only."
maintainer: raldblox
tier: community
category: tools
requires_hermes: ">=0.19"
docs_url: https://github.com/raldblox/hermes-boreal#readme
version: "0.1.0"
readme: true
platforms: []
capabilities:
  provides_tools: [boreal_connect, boreal_check_link, boreal_account, boreal_quote, boreal_post_task, boreal_fund_task, boreal_list_tasks, boreal_get_task, boreal_get_submission, boreal_review, boreal_accept, boreal_cancel]
  provides_hooks: [pre_tool_call, pre_llm_call]
  provides_middleware: []
  requires_env: []
```

## PR title

`feat(plugin-catalog): add borealwork (Plugin Hackathon entry)`

## PR description

> **boreal.work: verified human hands for Hermes** (Plugin Hackathon entry)
>
> Owner submission (rule 5): I own `raldblox/hermes-boreal`, and boreal.work (https://boreal.work, source https://github.com/raldblox/boreal-task-desk).
>
> **What it does.** Some steps no agent can do online: confirm a supplier's warehouse is real, check a shelf price today, photograph a site. Hermes posts the step to boreal.work, funds it (a PayPal hold, not a charge), a verified person does it, and boreal.work's reviewer judges the result against the task's criteria and a public rulebook (https://boreal.work/rules). The worker is paid only on a pass; a fail returns the money less the review part of the fee.
>
> **Why a plugin, not a skill.**
> - **Spend guard** (`pre_tool_call`): before `boreal_fund_task` runs, it reads the task's real total and blocks it over the per-task or daily cap, or escalates to the human-approval gate above a threshold. It also blocks terminal commands that move USDC without a `boreal:<taskId>` memo. A skill can only ask Hermes to behave; this enforces it.
> - **Verdict digest** (`pre_llm_call`): on a session's first turn, Hermes is told which tasks finished or need its review since it last looked.
> - 12 native tools and `/borealwork`.
>
> **Hermes surfaces used:** `register_tool` (12), `register_hook` (`pre_tool_call`, `pre_llm_call`), `register_command` (`/borealwork`), `ctx.get_config`, `ctx.state`, `agent.secret_scope.get_secret`.
>
> **Risky behaviour (rule 13):** network calls over HTTPS to the configured boreal.work site only (default https://boreal.work, which moves real money through PayPal; the spend guard and boreal.work's own owner-set limits bound it). It stores the agent key it collects in its own plugin state. No shell commands, no background processes, no self-updating, no compiled files, no dependencies outside the standard library.
>
> **Validation:** `hermes plugins validate . --install-deps` passes every check (15), `hermes plugins doctor . --ci` is clean (12 tools, 2 hooks), and `python -m unittest discover -s tests` passes 13 tests covering the guard, the digest and key handling.
>
> Demo: <link to the X post>

## X post (with the demo video)

> Hermes can now hire a verified human.
>
> The boreal.work plugin gives @NousResearch's Hermes Agent real-world hands: it posts a step only a person on the spot can do, holds the money until the work passes review, and a spend guard enforces your limits before any money moves.
>
> #HermesAgent

(Check the length before posting; X counts each link as 23 characters.)

## Demo, under 90 seconds

1. (0–10 s) "Hermes can research anything. It can't stand in a shop." Hermes with the plugin enabled: `/borealwork`.
2. (10–35 s) Ask Hermes for a real-world check. It quotes, posts with criteria, and funds: the spend guard asks you to approve the amount.
3. (35–50 s) Ask it to pay someone directly from a terminal: the guard blocks it.
4. (50–75 s) The result and its verdict (from the NEAR film's footage: the worker, the rule-cited verdict, the proof).
5. (75–90 s) A new session: the verdict digest tells Hermes what came back. End card: boreal.work, `hermes plugins install raldblox/hermes-boreal`.
