---
name: whitepaper-subagent
description: Use when the user wants a whitepaper section drafted, revised, or reviewed and wants it done by the dedicated whitepaper-author subagent (own context window, isolated from the main thread). This skill orchestrates the handoff — confirms source-of-truth files with the user once, then spawns one or more whitepaper-author subagents with that context. Trigger on /whitepaper-subagent, on phrases like "draft section X using the whitepaper agent", or whenever the work is heavy enough (full section, multi-section parallel, full-document review) that it belongs in a subagent rather than the main thread.
---

# Whitepaper Subagent Skill (orchestrator)

This skill's job is to invoke the `whitepaper-author` subagent correctly. The subagent is defined in `.claude/agents/whitepaper-author.md`; its rules live in `.claude/skills/whitepaper/SKILL.md`.

You (the main agent) do not draft prose under this skill. You orchestrate.

## Workflow

1. **Parse the user's request.** Identify:
   - Task shape: draft / revise / review
   - Target: which section(s), or "full document", or a specific file to review
   - Length / audience / stage if the user supplied them; otherwise leave to the subagent's own clarification

2. **Confirm source-of-truth files with the user — once, in this thread, before spawning anything.**
   - Use `Glob` to enumerate candidate docs in the repo root (`*.md`).
   - Present the list and ask which are authoritative and in what priority order if they disagree.
   - **MUST NOT** guess or default. The subagent's rules forbid drafting from unconfirmed sources, and asking once here saves N×re-asks if you fan out to parallel subagents.
   - Use the `AskUserQuestion` tool for this — it gives a clean multi-select interface.

3. **Decide single vs parallel invocation.**
   - One section, one subagent → single `Agent` call.
   - Multiple independent sections → multiple `Agent` calls in the same message, so they run in parallel.
   - A review pass over an existing draft → single `Agent` call with task shape "review".

4. **Spawn the subagent(s)** via the `Agent` tool with `subagent_type: whitepaper-author`. Each prompt **MUST** include:
   - The task shape (draft / revise / review)
   - The target section / file
   - The source-of-truth file list with priority order, exactly as the user confirmed in step 2
   - Any length / audience / stage parameters the user supplied
   - A reminder that the subagent should read `.claude/skills/whitepaper/SKILL.md` first

   Template prompt for the subagent:

   ```
   Task: <draft | revise | review> <target>

   Source of truth (already confirmed with the user — do not re-ask):
   - <file1> (highest priority)
   - <file2>
   - <file3>

   Length: <target words/pages, or "subagent default">
   Audience: <technical / institutional / regulator, or "default technical">
   Stage: <first draft / revision / polish / critique>
   Additional context: <anything the user mentioned>

   Read .claude/skills/whitepaper/SKILL.md first, then proceed per its §9 workflow. Return draft + self-review report per its §10 checklist.
   ```

5. **Surface the subagent results** to the user. Do not paraphrase the draft — return it as-is so the user can read it. Summarise only the gaps / TODOs / self-review violations the subagent reported, so the user can decide what to chase next.

6. **Offer follow-ups** if appropriate: "Next: revise §5 based on these gaps?" / "Spawn parallel drafts for §6 and §7 with the same source-of-truth list?" Keep it terse.

## Args handling

If the skill is invoked with arguments (e.g. `/whitepaper-subagent abstract` or `/whitepaper-subagent §5 consensus, 1200 words`), parse them as the initial task description. If invoked bare (`/whitepaper-subagent`), ask the user what to draft.

## What this skill does NOT do

- It does not draft prose itself. If the user actually wants in-thread drafting, point them to the `/whitepaper` skill (rules-only) and let the main agent write.
- It does not bypass the source-of-truth confirmation. Even if a prior turn in the same thread named the source-of-truth files, re-confirm at the start of every `/whitepaper-subagent` invocation. Project docs change; assumptions go stale.
- It does not coordinate state across parallel subagents. Each gets a self-contained prompt and returns a self-contained result.
