# Speculative Execution

## Part 1: How UltraFast uses speculative execution and why

Speculative execution is the third lever in UltraFast's latency budget, sitting alongside Minimmit's single-round fast path (§5.2) and the two-region launch topology (§12.1). The mechanism is narrow and specific: reth begins executing the proposal on `engine_newPayload` before the threshold-signature certificate for that view arrives. The QMDB state-root commit gates on finality. If Threshold Simplex skips the view, the speculative state is discarded deterministically before the next proposal is admitted. §6.4 of the whitepaper states this in exactly those terms.

The "why" is a latency-budget arithmetic argument. §12.1 fixes the p50 finality target at ~200 ms on the Minimmit happy path under 30 curated validators with US-East + EU-West topology and ~30 ms one-way RTT. Without speculative execution — even with Minimmit's single-round commit and the two-region layout in place — the whitepaper notes p50 finality lands in the 280–320 ms range, because consensus finalisation and execution run sequentially: certificate arrives, then reth executes, then state root commits. Overlapping execution with the remaining consensus rounds shaves ~80–120 ms off the user-perceived fill latency and brings the budget into the structural-fairness band against Hyperliquid's reported ~70 ms (§12.3). This is the only lever in the budget that does not require either a faster network or a faster consensus protocol — it exploits the work the executor would otherwise idle through.

The Phase 0 walking-skeleton (§16.1) carries the validation burden. Two of its four highest-risk integrations — "Threshold Simplex consensus driving reth via the Engine API" and the end-to-end latency exit criteria of §12.2 — depend on the speculative-commit and rollback paths being deterministic. Specifically: no observable state mutation under speculation may escape to the user before finality lands, and on view-skip the rollback must produce the same post-state as if the view had never been proposed. Failure on either property bricks the latency target before any product code is committed.

The threat is named in §14: an adversary inducing view-skip to weaponise speculative state. The mitigation has two components. First, a deterministic rollback contract — speculative state is materialised in a transactional shadow that QMDB never commits until the finality certificate arrives, and on view-skip the shadow is discarded before the next proposal is admitted. Second, a TLA+ specification covering the invariant — listed in §16 as part of the Phase 0 deliverables. The residual risk stated in the security table is wallet-side: user-facing fill-confirmation UX must distinguish optimistic display from finalised state. The chain provides the finality signal; the wallet and SDK are responsible for not racing ahead of it.

## Part 2: Deep research on speculative execution in BFT consensus

### The pattern and its names

The technique UltraFast uses goes by several names in the literature, all describing variants of the same insight: in a BFT chain, the latency from order-determination to state-finalisation is dominated by the consensus round-trips, and the executor sits idle through most of them. Overlapping execution with the consensus rounds closes that gap.

In the BFT-systems literature the canonical names are:

- **Speculative execution** — used by Zyzzyva (Kotla et al., SOSP 2007) and HotStuff-1 (Kang, Gupta, Malkhi, Sadoghi, 2024) to describe responding to clients with execution results before the full commit certificate is available. The original Zyzzyva paper introduces the term in a state-machine-replication context.
- **Pipelined execution** or **decoupled execution** — used by Aptos (Diem heritage), Monad, and Sei. Emphasises stage-parallelism: consensus on block $N+1$ overlaps with execution of block $N$.
- **Optimistic head** / **optimistic sync** — used in the Ethereum execution-layer / consensus-layer split via the Engine API. The consensus layer continues forward with descendant beacon blocks while the execution layer is still processing — same overlapping principle, applied to the EL/CL boundary rather than to consensus rounds within a single layer.

UltraFast's variant is closest to Zaptos (Aptos Labs, January 2025) in mechanism: execute on proposal arrival, gate the commit on finality, roll back on view-skip. It differs from HotStuff-1's variant in that it does not send execution responses to clients before finality — the responsibility for distinguishing optimistic from finalised state is pushed to the wallet and SDK rather than handled by replicas at the protocol level. This is a deliberate choice: it preserves the property that no observable state mutation escapes the chain pre-finality, which simplifies the rollback invariant.

### Production implementations

**Aptos (Quorum Store, Raptr, Zaptos).** Aptos's consensus-execution decoupling has progressed through three generations. Quorum Store (2023) decoupled data dissemination from consensus, removing the leader as the throughput bottleneck and reportedly increasing consensus-only throughput 12× and end-to-end throughput 3×. Raptr (introduced September 2024) implements "prefix consensus" — validators optimistically propose batches before getting proofs of availability and can vote on prefixes of received batches, reported at 260,000 TPS with sub-800 ms latency. Zaptos (Aptos Labs, January 2025, arXiv:2501.10612) is the speculative-execution layer on top: validators optimistically execute blocks on proposal receipt; if a block fails to achieve consensus ordering, the opt-committed state is reverted from storage. Claimed result: sub-second end-to-end latency at 20,000 TPS on a 100-validator geo-distributed testbed, with 160 ms latency reduction under light load and >500 ms reduction under heavy load versus the Aptos baseline. Consensus Observer (AIP-93, December 2024) further decouples block propagation from execution and commitment, dropping block-close time to ~250 ms.

**Solana (Banking Stage / TPU pipeline).** Solana's Transaction Processing Unit is the canonical multi-stage pipeline reference. The stages run as overlapping processes: Fetch (QUIC ingress) → SigVerify (signature check and dedup) → Banking (schedule, execute, record) → PoH (hash into the cryptographic clock) → Broadcast (Turbine shred streaming). The Banking Stage itself runs a single scheduling thread (Prio-Graph algorithm) that dispatches non-conflicting transactions to worker threads in parallel. This is not "speculative against consensus proposals" in the BFT sense — Solana's leader-rotation model differs from Threshold Simplex — but it is the most aggressive production deployment of stage-parallelism in any L1, and is the architectural reference for the pipelining principle.

**Sui (Mysticeti and the checkpoint pipeline).** Sui's Mysticeti consensus protocol (deployed on mainnet July 2024) is an uncertified-DAG protocol that eliminates the separate post-consensus checkpointing mechanism — consensus commits themselves serve as checkpoints. The reported result is 80 % latency reduction versus Bullshark on the same mainnet, from ~1.9 s to ~390 ms p50 consensus latency, end-to-end client latency under 1 s p50 across 106 geo-distributed validators (decentralizedthoughts.github.io, March 2026). The pipelining is at the DAG-block level rather than the execution-against-proposal level, but the overlap principle is identical.

**Monad (superscalar pipelining).** Monad's architecture divides transaction processing into stages — signature verification, state access, execution — and runs them in parallel across the CPU's cores, the same pattern modern superscalar CPUs use. MonadBFT (custom pipelined BFT) decouples consensus and execution so that while block $N$ executes, block $N+1$ is already reaching consensus. Claimed throughput: up to 10,000 TPS. Mainnet status as of May 2026: launched.

**Sei (Twin Turbo consensus).** Sei's Twin Turbo is a heavily tuned Tendermint variant with consensus-execution overlap built into the validator state machine. When a validator receives a block proposal for height $H$, it does not wait for prevote/precommit rounds to complete before starting execution — transactions are dispatched to the parallel execution engine concurrently with the BFT voting rounds. Final commit to SeiDB occurs rapidly after consensus is achieved, enabled by the preceding concurrent work. Result: Tendermint's 6 s block times reduced to <400 ms with single-slot finality.

**Ethereum (Engine API optimistic sync).** The CL/EL split via the Engine API has a structurally similar optimistic-head pattern. When the Execution Layer responds with `SYNCING` to `engine_newPayload`, the Consensus Layer continues forward with subsequent descendant beacon blocks, triggering `engine_executePayload` and `engine_forkchoiceUpdated` optimistically. The optimistic-sync specification (ethereum.github.io/consensus-specs) names this explicitly. UltraFast inherits this same Engine-API surface from reth and applies the same optimistic-head principle, but with a much tighter integration: the consensus layer is in-process with the execution driver rather than a separate beacon client, which keeps the rollback signal latency below the consensus round-trip.

### Theory and the prefix-speculation dilemma

The most rigorous recent treatment is HotStuff-1 (Kang, Gupta, Malkhi, Sadoghi; arXiv:2408.04728, August 2024). The paper introduces a fault-tolerant speculative-execution regime that achieves a two-network-hop reduction versus chained HotStuff by sending clients execution responses speculatively after one QC is formed instead of two.

The key theoretical contribution is naming the **prefix speculation dilemma**. In a chain-based BFT architecture, speculatively executing transaction $T_s$ at position $s$ requires executing all preceding transactions. But responding to clients about earlier transactions creates a safety risk: different validator groups might receive conflicting QCs for transactions at position $s$, while the parent transaction at position $s{-}1$ could be aborted. If validators respond on $T_{s-1}$, clients might incorrectly conclude it committed — yet the entire branch containing $T_{s-1}$ could be rejected.

HotStuff-1 offers two resolutions:

- **Conservative rule:** speculate only when the parent transaction has already committed. Safe, simple, but reduces the latency benefit during view gaps.
- **Permissive rule:** allow speculation but withhold responses for parent transactions. Maintains the latency improvement but sends results out-of-order to clients.

UltraFast sidesteps this dilemma at the architectural level by not sending execution responses to clients before finality at all — the chain emits the finality signal, and the wallet / SDK is responsible for the optimistic display. This is a stronger invariant than HotStuff-1's permissive rule, but it is purchased at the cost of additional client-side complexity. The trade-off is named explicitly in §14's residual-risk column.

### Determinism and rollback semantics

Across the production implementations, the rollback contract has three components:

1. **Shadow state.** Speculative writes accumulate in a transactional shadow that the committed state-DB never sees. Zaptos uses storage-level rollback; QMDB's append-only twig structure makes this particularly natural — speculative twigs are simply not promoted to the committed Merkleisation set. Block-STM's MVCC layer provides a similar shadow for parallel-execution conflict resolution.

2. **Finality gate.** The shadow is promoted only when the threshold-signature certificate (or equivalent commit-quorum proof) arrives. In UltraFast, this is the Threshold Simplex certificate; in Aptos, the Raptr quorum certificate; in Sei, the Tendermint precommit-quorum threshold.

3. **Deterministic discard on view-skip.** When the view is skipped — equivocating leader, timeout, network partition — the shadow is discarded in a way that produces the same post-state on every validator. Determinism here is critical: if validators disagreed on the post-rollback state, the next view's proposal would build on inconsistent pre-states and the chain would fork. The TLA+ specification UltraFast lists in §16 covers exactly this invariant.

The class of bugs the literature has surfaced around this — Zyzzyva's view-change complexity (Abraham et al. found subtle safety bugs in the original specification), the Cosmos-EVM advisory GHSA-mjfq-3qr2-6g84 around partial-state-write claims — sits in the same neighbourhood as the speculative-execution rollback class. The mitigation pattern is consistent across all the modern protocols: keep the shadow strictly transactional, make the discard a single atomic operation, formalise the invariant in TLA+ or a similar specification language.

### Latency wins observed in production

The reported latency reductions from overlapping execution against consensus, across the available data:

- Zaptos (Aptos, 2025): 160 ms light-load reduction, >500 ms heavy-load reduction versus Aptos baseline.
- Sui Mysticeti (2024): ~1.5 s reduction (1.9 s → 390 ms) versus Bullshark — though this is a DAG-protocol switch rather than pure speculative execution.
- Sei Twin Turbo: ~5.6 s reduction (6 s → 400 ms) versus stock Tendermint — combined consensus tuning plus execution overlap.
- Ethereum optimistic sync: not a latency metric per se, but the design rationale in the consensus-specs explicitly cites the need to "see the head of the L2 chain faster than the L1 may confirm" as the motivation.

The pattern in the data: speculative-execution against consensus proposals consistently produces 30–50 % latency reductions versus sequential execute-after-finality, with the higher end of that range reached when the underlying consensus protocol already has a tight commit pipeline (so the executor's idle time is the dominant remaining gap). UltraFast's claimed ~80–120 ms reduction (320 ms → 200 ms p50) sits at approximately 35 %, in the middle of that observed band — which is the reason the whitepaper marks the target as plausible rather than aggressive.

### Status summary

| System | Consensus protocol | Speculative-execution mechanism | Production status (May 2026) |
|---|---|---|---|
| Aptos (Zaptos) | Raptr (prefix consensus) | Optimistic execute on proposal; storage-level rollback on consensus failure | Production |
| Solana | TowerBFT + PoH | Banking Stage pipeline; not "against consensus proposals" in BFT sense | Production |
| Sui | Mysticeti (uncertified DAG) | Consensus commits = checkpoints; no separate checkpoint phase | Production |
| Monad | MonadBFT (pipelined) | Superscalar pipelining; block N executes while N+1 reaches consensus | Mainnet launched |
| Sei | Twin Turbo Tendermint | Execute on proposal receipt, concurrent with prevote/precommit | Production |
| Ethereum | Gasper (LMD-GHOST + Casper FFG) | Engine API optimistic sync between CL and EL | Production |
| HotStuff-1 | HotStuff variant | One-QC speculative response with prefix-dilemma resolution rules | Academic |
| UltraFast | Threshold Simplex + Minimmit | Execute on `engine_newPayload`; QMDB commit gates on certificate; deterministic rollback on view-skip | Pre-implementation; Phase 0 walking-skeleton validates the integration |

### References (web-sourced material)

- HotStuff-1: Linear Consensus with One-Phase Speculation. Kang, Gupta, Malkhi, Sadoghi. arXiv:2408.04728, August 2024.
- Zaptos: Towards Optimal Blockchain Latency. Aptos Labs. arXiv:2501.10612, January 2025.
- Raptr: Prefix Consensus for Robust High-Performance BFT. Tonkikh et al. arXiv:2504.18649, 2025.
- Mysticeti: Reaching the Latency Limits with Uncertified DAGs. arXiv:2310.14821.
- Zyzzyva: Speculative Byzantine Fault Tolerance. Kotla, Alvisi, Dahlin, Clement, Wong. SOSP 2007.
- Quorum Store: How Consensus Horizontally Scales on the Aptos Blockchain. Aptos Labs, Medium, 2023.
- Twin Turbo Consensus: Sei's High-Speed Blockchain Consensus. Sei Labs documentation and blog, 2024.
- Pipelining in Solana: The Transaction Processing Unit. solana.com/news, ongoing.
- Engine API specification and Optimistic Sync. ethereum/execution-apis and ethereum.github.io/consensus-specs.
- Solana Banking Stage and Scheduler. apfitzge.github.io/posts/solana-scheduler/.
- The Prefix Speculation Dilemma in BFT Consensus. decentralizedthoughts.github.io, August 2024.
- Monad architecture overview. docs.monad.xyz and chorus.one technical analysis.
- Sui Mysticeti deployment report. decentralizedthoughts.github.io, March 2026; blog.sui.io, 2024.
