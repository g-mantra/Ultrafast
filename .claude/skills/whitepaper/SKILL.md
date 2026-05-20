---
name: whitepaper
description: Use when drafting, revising, or self-reviewing any section of the UltraFast whitepaper — or any other crypto L1 / derivatives whitepaper in this repo. Enforces section structure, claim hygiene, voice/style, the banned-word kill list, citation discipline, and UltraFast-specific constraints (MANTRA naming, three-layer MEV ordering, performance-claim conditions). Activate whenever the user is producing whitepaper prose or asking for a whitepaper section, abstract, or executive summary.
---

# UltraFast Whitepaper Skill

You are working on a crypto whitepaper. This document is the binding ruleset. Hard rules use **MUST**, **MUST NOT**. Soft guidance uses **SHOULD** / **AVOID**.

## 0. Source of truth

Technical content **MUST** come from project files the user designates, not from training-data memory of crypto chains.

**At the start of every whitepaper task, ask the user which files are the source of truth and their relative authority.** Do not assume. The repository contains several candidate docs (e.g. `ACTION_PLAN.md`, `YI_PROPOSAL.md`, `YI_RESEARCH.md`, `RESEARCH.md`, `CLAUDE.md`, and potentially newer files), and their relative authority changes as the project evolves — a file that was canonical last week may be stale today.

Ask in the form:

> "Before I start, which files are the source of truth for this section, and in what priority order if they disagree? I see `<list candidate files found via Glob>` — should I treat all of these as authoritative, or a subset?"

Record the answer for the current task only. **MUST NOT** persist this choice across tasks; re-ask at the start of every new whitepaper invocation.

Once the user names the source-of-truth set:
- Re-read the relevant slices of those files before drafting any section that asserts a design choice.
- If a fact in the draft contradicts a designated source-of-truth file, the draft is wrong.
- If two designated files disagree and the user did not specify priority, **stop and ask** which wins — do not guess.

## 1. Document tier — write the conceptual whitepaper, not the spec

Two artifacts exist in a mature L1 stack:

- **Conceptual whitepaper** — 15-30 pages, prose-heavy, accessible to a technically literate non-implementer. This is what you draft by default.
- **Technical specification ("yellow paper")** — 50+ pages, formal, every state transition defined as math. Out of scope until a prototype exists.

Unless the user explicitly says "spec", you are writing the conceptual whitepaper.

## 2. Section template

The default skeleton. Adjust order only with explicit user agreement; don't drop sections silently.

```
1.  Abstract                          (150-250 words, single paragraph)
2.  Introduction                      (problem, contributions list)
3.  System Model & Assumptions        (network, adversary, crypto, finality semantics)
4.  Architecture Overview             (one diagram, one paragraph per layer)
5.  Consensus                         (Threshold Simplex + Minimmit + QMDB)
6.  Execution                         (reth + Block-STM + aggregators)
7.  Matching: Frequent Batch Auctions (tick mechanics, clearing rule, order types)
8.  MEV Resistance                    (MCP + FBA + tokenized ordering, residual vectors)
9.  Products
    9.1  Perpetual Futures
    9.2  Scalar Prediction Markets
    9.3  Unified Cross-Product Margin
10. Bridge & Custody                  (validator TSS, ZK light-client to Ethereum)
11. Privacy Tiers                     (Lit → Position-private → TEE → ZK+MPC)
12. Performance                       (latency budget, throughput, conditions)
13. Economics & Validator Set         (MANTRA token role, fee flow, validator evolution)
14. Security Analysis                 (threat model recap, attack table, residual risks)
15. Related Work                      (Hyperliquid, dYdX v4, Vega, Injective, Aevo)
16. Future Work                       (privacy phase 2, MCP rollout, scalar funding research)
17. Conclusion                        (one column)
18. References                        (30-60 entries, numeric [n] style)
A.  Appendix: Notation
B.  Appendix: Pseudocode / equations as needed
```

§3 is mandatory and **MUST NOT** be omitted — its absence is the #1 tell of a low-quality whitepaper.

## 3. Required content per section (claim-hygiene checklist)

When drafting or reviewing, every section **MUST** satisfy its rules below.

**§3 System Model.** State explicitly: network synchrony assumption (partial synchrony with GST), adversary model (Byzantine fraction `f < n/3` standard, `f < n/5` for Minimmit fast path), static vs adaptive corruption, what the adversary controls, computational assumptions (random oracle, BLS pairing). No prose section after §3 may rely on unstated assumptions.

**§5 Consensus.** Specify: message complexity per round, safety and liveness arguments (sketch, not full proof), finality definition (when is a block irreversible under what assumption), fork-choice rule, recovery from view change. Cite Threshold Simplex (Chan & Pass, TCC 2023; Commonware), Minimmit (Commonware monorepo `pipeline/minimmit`), QMDB (arXiv:2501.05262).

**§6 Execution.** Specify: state model (account-based, EVM-compatible), transaction lifecycle (one figure), gas model, parallelism (Block-STM optimistic concurrency), aggregator semantics (typed commutative ops). Cite Block-STM (Aptos), aggregators (Aptos), reth (Paradigm). Distinguish what is upstream-Ethereum-stock from what is novel.

**§7 Matching.** Specify: tick interval (target 100–200 ms locked to block cadence), clearing rule (uniform clearing price, pro-rata at level), supported order types, post-only handling, carry-vs-expire policy, solver location (in-validator module, not VM precompile). Cite Budish-Cramton-Shim 2015 (FBA economic foundation), CowSwap, Penumbra ZSwap, Speedex.

**§8 MEV.** Present the layers **in this order, every time**: (i) MCP at consensus (selective-censorship-resistance + hiding), (ii) FBA at matching (intra-tick ordering eliminated), (iii) tokenized ordering for un-batched paths. State the adversary's capability, then what each layer removes. **MUST** acknowledge residual vectors: PBS-layer (n/a — no PBS), temporal MEV across batches, cross-domain MEV, oracle MEV. Cite arXiv:2509.23984, arXiv:2511.13080, Masquerade (ACM 10.1145/3730410). Encrypted mempools (Shutter / Ferveo / TrX ePrint 2025/2032) **MUST** be discussed and explicitly rejected for v1 with stated reason.

**§9 Products.** Perpetual futures and scalar prediction markets are **co-equal**. **MUST NOT** frame prediction markets as a secondary or future product. Specify per product: order types, funding mechanism (perps: standard premium-index funding; prediction markets: open — three candidates), liquidation trigger and procedure, insurance fund interaction. For unified margin: state the netting formula, the failure-isolation property, and that portfolio-margin vs additive vs SPAN is an open decision (cite ACTION_PLAN §5).

**§10 Bridge.** Specify: TSS protocol stack (FROST / ROAST for Schnorr+Ed25519, DKLs23 for ECDSA, FROST for Taproot), `2f+1` stake-weighted signing quorum, ZK light-client to Ethereum (Succinct-style prover, withdrawal dispute window). **MUST NOT** claim "trustless bridge" without naming what trust is removed (single-signer custody) and what trust remains (`2f+1` stake-weighted majority honest).

**§12 Performance.** Every number **MUST** be followed by its conditions. Use the canonical form: `<metric> <value> under <conditions>`.
  - Example: "p50 finality ≈ 200 ms under partial synchrony, Minimmit fast path (`n ≥ 5f+1`), 2-region validator topology (US-East + EU-West, one-way RTT ≈ 30 ms), 30 curated validators, no Byzantine faults."
  - Single-number marketing claims ("200 ms finality") are forbidden.
  - Report ranges or curves where possible (`p50/p95/p99`).
  - Distinguish design targets (validation pending) from measured benchmarks.

**§14 Security.** Tabulate attacks vs mitigations. Adversary, capability, mitigation, residual risk. No hand-waved entries.

**§18 References.** 30-60 entries. Cite the seminal source, not a downstream blog. HotStuff → Yin et al. 2019. PBFT → Castro-Liskov 1999. FBA → Budish-Cramton-Shim 2015. Block-STM → Gelashvili et al. (Aptos). Threshold-encryption foundations → Shoup-Gennaro 1998 + the modern construction actually used.

## 4. Voice and style (hard rules)

- **Tense**: present tense for system behaviour ("validators sign", not "will sign" / "have signed"). Past tense only for related work ("Castro and Liskov showed").
- **Person**: plural "we" or impersonal third-person. **MUST NOT** use "I" or "you".
- **Voice**: active by default. Passive only when the actor is irrelevant.
- **Paragraph length**: 3-6 sentences. No paragraph above 8.
- **Sentence length**: target ≤ 30 words. **MUST NOT** exceed 40 without restructuring.
- **Headings**: noun phrases ("Consensus"), not sentences ("How consensus works"). Max nesting depth 3 (e.g. §4.2.1).
- **Section openers**: each section opens with a one-sentence statement of what it establishes.
- **Notation**: define every symbol on first use. Use math mode for variables in prose (`$n$`, not `n`). Number any equation referenced more than once. Notation table in Appendix A if symbol count > 10.
- **Units**: SI. Durations in ms or s. Never "fast", "near-instant", "blazing".
- **Figures**: every figure has a caption that stands alone. Reference by number ("see Figure 3"). One architecture diagram in §4. No decorative figures.

## 5. Banned-word kill list

These tokens **MUST NOT** appear in whitepaper prose. Each instance is a credibility hit. Self-review every draft and strip.

**Marketing puffery (zero tolerance):**
- revolutionary, world's first, world-class, unprecedented, paradigm, paradigm-shift, game-changing, game-changer, next-generation, next-gen, cutting-edge, bleeding-edge, state-of-the-art, best-in-class
- blazing, blazing-fast, lightning, lightning-fast, ultra-fast (yes, even though it's the chain name — use "UltraFast" the noun only), seamless, frictionless, effortless
- robust (without metric), powerful (without metric), elegant
- empower, unleash, supercharge, redefine, reimagine, transform (used loosely)
- democratize, decentralize (as a verb without object)

**Imprecise filler:**
- "and more", "etc.", "various", "numerous", "a wide range of", "a variety of"
- "leverage" as a verb (use "use")
- "utilize" (use "use")
- "in order to" (use "to")
- "it is worth noting", "it should be noted"

**Vague qualifiers without quantification:**
- "high performance", "scalable", "decentralized", "trustless", "permissionless" — these MAY appear, but **MUST** be paired in the same sentence or paragraph with a quantification or with the property being removed/added.
  - Bad: "UltraFast is trustless."
  - Good: "UltraFast removes single-signer custody by requiring a `2f+1` stake-weighted TSS quorum to sign cross-chain withdrawals."
- "secure" without naming the security property (safety / liveness / integrity / confidentiality)
- "fair" / "fair ordering" without naming the adversary and the property

**Emojis:** never.

**Smart punctuation in source files:** never — write straight quotes and apostrophes. The published artifact can be typeset later.

**Em-dash overuse:** acceptable for parenthetical asides, but **MUST NOT** appear more than ~2× per paragraph; do not use to chain three independent clauses.

## 6. Claim-citation discipline

Three rules:

1. **Every non-obvious technical claim has a citation.** "BFT consensus tolerates `f < n/3` faults" needs no citation. "Block-STM reduces re-execution by 60% under contention" needs one.
2. **Every performance number has its conditions in the same sentence or footnote.** See §3 (Performance) above.
3. **Every security claim is preceded by the adversary assumption.** "Under partial synchrony with `f < n/3` Byzantine validators, the protocol is safe" — not "the protocol is safe".

Roadmap framing: use future tense and a clearly-labelled section. **MUST NOT** present-tense an unbuilt feature.
  - Bad: "UltraFast supports the Renegade-style ZK+MPC dark pool."
  - Good: "A future privacy tier (post-v2) targets the Renegade-style ZK+MPC dark pool; see §16 Future Work."

## 7. UltraFast-specific constraints

These override anything in the general crypto-whitepaper convention.

1. **Token name is MANTRA.** **MUST NOT** write "OM" anywhere — the token was renamed; the old name is wrong in new docs. If the user pastes "OM" in a draft, treat it as a typo and ask before changing.
2. **UltraFast is not a token launch.** The economics section **MUST NOT** include emission schedules, supply caps, vesting, or distribution. Those live in MANTRA's existing tokenomics doc; cross-reference, do not duplicate. Cover only: validator staking mechanics, fee flow, MANTRA's gas-token role.
3. **MEV layer order is fixed**: MCP → FBA → tokenized ordering, every time, every section that lists them. Don't reorder for variety.
4. **Performance targets** are stated as: `~200 ms p50 / ~300 ms p99 / ~400 ms pessimistic-leader floor` under stated conditions. **MUST NOT** report a single number. **MUST NOT** drop the pessimistic floor — it's an honesty marker.
5. **Hyperliquid comparison is acceptable and expected.** **MUST** be specific (what technical exposures are attacked) and **MUST NOT** be tribal ("Hyperliquid is centralized" without naming the exact property — the closed-source matching engine, the ~16-25 team-controlled validators, the unilateral force-settlement powers, the public mempool).
6. **Open design decisions** (ACTION_PLAN §5) **MUST** be presented as open in the whitepaper, not papered over. Reader trust comes from honesty about what's unresolved. Examples that are currently open:
   - FBA tick parameter (100 vs 150 vs 200 ms)
   - Scalar funding rate (oracle-anchored vs market-driven vs hybrid)
   - Leveraged prediction-market liquidation at boundaries
   - Cross-product risk model (portfolio margin vs additive vs SPAN)
   - TSS protocol selection (mixed FROST + DKLs23 vs single)
7. **Threshold-encrypted mempool is rejected for v1 with stated reason.** **MUST NOT** quietly omit — the reader expects this option to be discussed.
8. **MCP is v1.1, not v1.** State the timeline honestly. Document the residual single-proposer risk during the v1 window.
9. **Prediction markets are co-equal with perps.** Never "perps and also prediction markets". Always "perps and prediction markets" with equal section weight.
10. **The chain is called UltraFast.** First mention per section spells it out; subsequent mentions in the same section MAY use "the chain" or "the network".

## 8. Diagram conventions

When generating ASCII or Mermaid diagrams:
- One architecture diagram per major component max
- Label every node
- Caption that stands alone
- Mermaid preferred over ASCII for anything non-trivial
- Time flows left-to-right or top-to-bottom — pick one per diagram and stick to it
- No colour-dependent semantics (whitepaper may be printed mono)

## 9. Drafting workflow

When asked to draft a section:

1. **Ask the user which files are the source of truth for this task** (see §0). Do not skip this step on the assumption you remember from a prior task.
2. **Re-read the relevant slices of the designated source-of-truth files.** Don't draft from memory.
3. **Sketch the section in 3-7 bullet points first.** Show this to the user before prose unless they explicitly say "just write it".
4. **Write the prose**, obeying §2–§7.
5. **Self-review pass before declaring done** — run the checklist in §10 below.
6. **Report what you skipped or hand-waved**, so the user can decide whether to chase it.

## 10. Self-review checklist (run before declaring a section done)

Every drafted section **MUST** pass:

- [ ] No banned words (§5)
- [ ] Every performance number has its conditions in the same sentence
- [ ] Every security claim has its adversary assumption stated
- [ ] Every non-obvious technical claim has a citation
- [ ] Tense is present for system behaviour, past only for related work
- [ ] Voice is "we" or impersonal third-person (no "I", no "you")
- [ ] No paragraph > 8 sentences; no sentence > 40 words
- [ ] Notation defined on first use
- [ ] Roadmap items in future tense and labelled as future work
- [ ] No "OM" — token is "MANTRA"
- [ ] MEV layers presented MCP → FBA → tokenized ordering
- [ ] Prediction markets framed as co-equal with perps
- [ ] Open design decisions flagged where applicable

Run the checklist line by line. Report which items pass and which the section deliberately violates with reason.

## 11. Reviewing existing drafts

When asked to review an existing draft (rather than write new prose), produce a structured report:

1. **Structural completeness** — which template sections (§2) are missing or thin
2. **Claim hygiene** — list every claim that lacks a citation, adversary assumption, or condition
3. **Kill-list hits** — banned words found, with line numbers
4. **Voice & style violations** — by category
5. **Factual disagreements with designated source-of-truth files** — flag with both sources cited (after confirming with the user which files are authoritative for this review)
6. **UltraFast-specific constraint violations** (§7)
7. **Honesty gaps** — places where roadmap is present-tensed, single performance numbers, vague trust claims

Be specific. "Section 4 has marketing language" is useless. "Line 47: 'revolutionary scaling' → strike 'revolutionary', restate the scaling claim with the conditions from ACTION_PLAN §2" is useful.

## 12. What to ask the user before drafting

When the user asks for whitepaper work, clarify if unstated:

- **Source of truth** — which project files are authoritative for this task, and priority order if they disagree (see §0). Always ask; never assume.
- **Which document tier** — conceptual whitepaper (default) or technical spec?
- **Which section(s)** — full document, single section, abstract only, executive summary?
- **Length target** — page count or word count?
- **Audience** — technical reader (default), institutional investor, regulator?
- **Stage** — first draft, revision, polish pass, peer-review-style critique?

For an institutional-investor audience, soften math; do not soften honesty. For a regulator audience, foreground threat model, custody arrangement, and dispute mechanisms.
