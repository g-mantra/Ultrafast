# UltraFast: 30-Day Research Plan

> **Start:** 2026-03-25
> **End:** 2026-04-24
> **Goal:** Resolve open design decisions and produce working prototypes for core components.

---

## Consensus & Execution Foundations

| # | Task | Deliverable | Owner |
|---|------|-------------|-------|
| 1.1 | Evaluate Rust BFT frameworks (`aptos-core`, `hotstuff-rs`, `tendermint-rs`) | Decision doc: build-on vs build-from-scratch |  |
| 1.2 | Read Groundhog paper + codebase (`scslab/smart-contract-scalability`) | Written assessment: Rust port effort vs C++ FFI | |
| 1.3 | Read TrX paper (ePrint 2025/2032) + Aptos encrypted mempool code | Feasibility memo: threshold encryption integration points | |
| 1.4 | Study MonadBFT paper (arXiv:2502.20692) | Spec: tail-forking resistance additions to HotStuff-2 | |

**Exit criteria:** Framework chosen. Groundhog integration strategy decided. Threshold encryption feasibility confirmed.

---

## Matching Engine & Product Design

| # | Task | Deliverable | Owner |
|---|------|-------------|-------|
| 2.1 | Prototype FBA matching engine (single market, Rust) | Working prototype: uniform clearing price + pro-rata fills | |
| 2.2 | Simulate FBA vs continuous matching with synthetic order flow | Comparison report: latency, fill quality, MEV exposure | |
| 2.3 | Design scalar prediction market settlement mechanics | Spec: range parameters, boundary behavior, expiration handling | |
| 2.4 | Research prediction market funding rate approaches | Memo: options for anchoring scalar market prices without a spot reference | |

**Exit criteria:** FBA vs continuous decision made. Scalar market spec drafted.

---

## Unified Margin & Risk Model

| # | Task | Deliverable | Owner |
|---|------|-------------|-------|
| 3.1 | Design cross-product margin model (perps + scalar outcomes) | Spec: risk offsetting rules, margin release logic | |
| 3.2 | Design liquidation mechanics for leveraged scalar markets | Spec: boundary approach handling, circuit breakers, gradual de-leverage | |
| 3.3 | Study Renegade codebase (`renegade-fi/renegade`, `mpc-jellyfish`) | Assessment: extensibility to perps (margin circuits, liquidation, funding) | |
| 3.4 | Design event resolution oracle (dispute mechanism) | Spec: oracle committee, bonds, escalation path, UMA comparison | |

**Exit criteria:** Margin model specified. Liquidation approach chosen. Oracle architecture drafted.

---

## Integration Prototype & Decision Lock

| # | Task | Deliverable | Owner |
|---|------|-------------|-------|
| 4.1 | End-to-end prototype: consensus → threshold decrypt → FBA match | Working demo on local testnet (single market, no privacy) | |
| 4.2 | Benchmark prototype: measure ops/sec and finality latency | Benchmark report against 200K ops/sec / 200ms targets | |
| 4.3 | Prototype ZK order validity proof (Groth16 via ICICLE-Snark) | Working proof: margin check in <200ms on GPU | |
| 4.4 | Lock all open design decisions | Decision log with rationale for each of the 9 open items | |
| 4.5 | Draft full implementation roadmap (post-research) | Phased build plan with milestones, team requirements, timelines | |

**Exit criteria:** All design decisions locked. Implementation roadmap approved.

