# Threshold Simplex

Research notes on Threshold Simplex consensus, the base BFT protocol referenced in the UltraFast whitepaper (§5.1, §5.3, §5.5). Compiled for internal use during the pre-implementation research phase.

---

## Part 1: How UltraFast uses Threshold Simplex and why

### Role in the architecture

Threshold Simplex is the base consensus protocol of UltraFast. It sits between the block-assembly layer (single proposer at v1; MCP at v1.1 per §3, Figure 1) and the execution layer (reth via the Engine API, §6.1). It provides total order over blocks under partial synchrony, with the safety and liveness assumptions stated in §2. Minimmit (§5.2) sits on top as a single-round fast path. When the validator set satisfies $f < n/5$ (i.e. $n \geq 5f+1$), finalisation completes in one round. Otherwise the protocol falls back automatically to two-round standard Threshold Simplex at $n \geq 3f+1$. The chain does not halt on fallback; it degrades to the §12.1 pessimistic-floor latency of ~400 ms instead of the ~200 ms p50 happy-path target.

A block is final once the Threshold Simplex threshold-signature certificate for that view is produced (§2, finality semantics). State produced under speculative execution (§6.4) is not durable until that certificate lands; deterministic rollback applies on view skip. Every downstream subsystem - FBA matching at the tick boundary, QMDB state commitment, TSS bridge attestation, the ZK light-client to Ethereum - is anchored on Threshold Simplex finality.

### Why UltraFast chose it

§5.5 names three rejections. Standard HotStuff variants pay roughly 6× the pessimistic-leader latency of Simplex on the same network, per the comparison published with the original Simplex paper. CometBFT's `ProcessProposal` lifecycle binds tx-processing into the consensus tick in a way that fights FBA's tick-boundary semantics and the MCP pslice assembly. DAG protocols (Narwhal/Bullshark/Mysticeti) buy throughput at a 3-6× latency cost UltraFast does not need at v1 scale. They also forfeit deterministic intra-block ordering, which disqualifies them for a CLOB. Threshold Simplex retains a leader-based, view-by-view ordering that matches the FBA tick model while pushing pessimistic latency to ~3δ rather than HotStuff's ~7δ.

### How UltraFast's usage differs from typical usage

Two deliberate v1 simplifications:

1. **Count-quorum, not stake-quorum (§5.3).** Commonware's threshold aggregation treats each of the $2f+1$ partials equally, regardless of the bonded stake the signer holds. UltraFast accepts this and lifts stake-weighting into a separate accountability layer (§13). That layer converts equivocation and protocol-deviation evidence into stake-scaled slashing. Weighted DKG and Aptos-style stake normalisation were considered and rejected for v1 on implementation-cost grounds. The v1 launch set of $n = 30$ is foundation-curated with equal voting weight, which makes the simplification benign at launch (§2, §13.3).
2. **Minimmit as the default path.** The whitepaper treats Threshold Simplex as the safety floor, not the operating point. At the curated $n = 30$ with no expected Byzantine validators, the $5f+1$ quorum is satisfied by construction and Minimmit runs the happy path; pure Threshold Simplex only takes over under partition or attack.

### What is implemented vs. not

Nothing is shipped. UltraFast is pre-implementation. The Phase 0 walking-skeleton (§16.1) is the validation gate: a single BTC-collateralised inverse perp on a four-validator testnet. It exercises Threshold Simplex driving reth via the Engine API alongside FROST TSS, FBA-as-system-contract, and QMDB-backed reth. The §12.2 exit criteria are end-to-end fill p95 < 300 ms on a two-region skeleton and < 600 ms on a four-jurisdiction soak. The equal-weight quorum versus stake-weighted accountability split is flagged as a deliberate v1 design choice in §5.3, with weighted-DKG migration left open for later versions.

---

## Part 2: Deep research on Threshold Simplex

### How it works

Threshold Simplex is the Commonware refinement of the Simplex protocol introduced by Benjamin Y. Chan and Rafael Pass at TCC 2023 ("Simplex Consensus: A Simple and Fast Consensus Protocol", IACR ePrint 2023/463). The base Simplex protocol is a partially-synchronous BFT protocol tolerating $f < n/3$ static Byzantine faults. It achieves optimistic finality of 3δ and pessimistic worst-case view latency of $3\Delta + \delta$ in silent-leader views. The latter is the result UltraFast §5.5 leans on against HotStuff's ~7δ.

The Commonware "threshold" variant embeds BLS12-381 threshold signatures directly into agreement:

- **Setup.** Validators run a one-time distributed key generation (DKG) producing a shared threshold secret. Each validator holds a share; the group has a static public key that survives validator-set churn through resharing (see Commonware's "Once a Validator, Not Always a Validator" post).
- **Voting.** Each consensus message is a partial BLS12-381 signature on the view's proposal. There is no separate vote-bookkeeping protocol; the partial signature is the vote.
- **Aggregation.** Once any party collects $2f+1$ partials, it recovers a single threshold signature. The recovered signature is packaged into a certificate of approximately 240 bytes - Commonware notes this is "roughly the size of an average transaction" - and broadcast as the canonical finality artefact for that view.
- **Verification.** A single BLS pairing check verifies the certificate against the static group public key. Cost is $O(1)$ in $n$. This is the property that lets a light client, a sibling chain, or a bridge contract verify finality without reconstructing the validator set.
- **Leader rotation.** Views rotate leaders on a known schedule. The threshold-simplex variant additionally uses the threshold scheme as a bias-resistant beacon: the leader of view $v+1$ is known only at the conclusion of view $v$, which gives post-facto randomness for both leader election and downstream execution randomness.
- **Message complexity.** Per round, $O(n)$ partial signatures are produced and broadcast over an $O(n)$ communication pattern, but only one $O(1)$ certificate persists. Commonware reports "zero message overhead" relative to the non-threshold `consensus::simplex` dialect, because the threshold signature replaces the explicit vote-set that would otherwise be stored.
- **Lazy verification.** Threshold Simplex does not verify every incoming partial on receipt. Verification is deferred until $2f+1$ partials are collected, at which point a failed aggregation surfaces the dishonest signer for accountability.

### Available implementations

- **Commonware monorepo** (`github.com/commonwarexyz/monorepo`), Rust. Modules `commonware-consensus::simplex` and `commonware-consensus::threshold_simplex`. Active development; `commonware-consensus` crate version `2026.3.0` was the latest at time of research. Patrick O'Grady is the lead author; the Commonware "Many-to-Many Interoperability with Threshold Simplex" blog post (16 January 2025) is the primary design document for the threshold variant. A minimal benchmarking chain `alto` is shipped alongside.
- **Ava Labs `ava-labs/Simplex`**, Go. A separate implementation of base Simplex (not the threshold variant) targeted at Subnet-only Validators. Avalanche's rationale is that Simplex's lack of a view-change sub-protocol simplifies the implementation surface, and recent `avalanchego` releases ship a Simplex engine in experimental form.
- **Reference paper.** Chan and Pass, TCC 2023 / IACR ePrint 2023/463. Slides at `cs.cornell.edu/~byc/talks/simplexconsensus-cornell23.pdf`. The `simplex.blog` site is a living index by the original authors.

### Current status

The protocol is past the research-paper stage and into the early-deployment stage:

- **Tempo** (Stripe + Paradigm, payments-first L1) uses Commonware `threshold_simplex` for consensus, with reth on the execution side. Mainnet launched 18 March 2026 per public announcements; Tempo led a $25M strategic investment into Commonware in November 2025 and is now both a user and an active contributor. Tempo reports ~500 ms deterministic finality with no reorgs, and Commonware's benchmarking has driven a ~20% block-time reduction (to ~200 ms), ~20% finality reduction (to ~300 ms), and ~65% CPU reduction in the consensus loop.
- **Solana Alpenglow** (SIMD-0326, approved September 2025 with 98.27% validator support) replaces Tower BFT with `Votor`, which is explicitly Simplex-derived (with Solana-specific protocol modifications, not the Commonware threshold variant verbatim). Votor commits in one round at 80% participation (~100 ms) and two rounds at 60% (~150 ms). Path to mainnet runs through Agave 4.1 in Q3 2026 with mainnet activation targeted late 2026.
- **Avalanche** ships base Simplex experimentally in `avalanchego` and exposes it to Subnet-only Validators.
- **UltraFast** is pre-implementation (this whitepaper).

So as of mid-2026: one production chain in Threshold-Simplex form (Tempo), one in approved-but-not-yet-mainnet base-Simplex form with Solana-specific tweaks (Alpenglow/Votor), one experimental ship (Avalanche), and one pre-implementation adoption (UltraFast).

### Variants and follow-up work

The Simplex line has spawned latency-reduction variants. The Decentralized Thoughts post "Variants of Simplex with Reduced Bad-case Latency: C-Simplex and Kuplex" (24 September 2025) describes C-Simplex (a Commonware-flavoured production variant) and Kuplex (a further bad-case-latency optimisation). Minimmit (arXiv:2508.10862, "Minimmit: Fast Finality with Even Faster Blocks") is the Commonware single-round fast-path that UltraFast layers on top per §5.2. From the Tendermint side, the Decentralized Thoughts post "From Tendermint to Simplex" (18 June 2025) argues Simplex is the natural successor: it eliminates Tendermint's mandatory $2\Delta$ leader wait by treating $n - f$ view-change messages as a no-decision proof, which compresses the view-change timeout from $6\Delta$ to $3\Delta$.

### Comparison to alternatives

- **HotStuff / HotStuff-2 / HotStuff-1.** Three-phase chained pipeline gives linear authenticator complexity but pays heavy view-change cost. Chan and Pass measure rotating-leader HotStuff at ~7δ minimum commit versus Simplex's 3δ - the ~6× pessimistic-leader latency UltraFast §5.5 cites. HotStuff's strength is uniform leader-replacement cost, which Simplex matches via threshold-aggregated view-change.
- **Tendermint / CometBFT.** Two-phase precommit/commit. Mandatory $2\Delta$ leader-wait per view makes the view-change timeout $6\Delta$; Simplex compresses this to $3\Delta$. CometBFT's ABCI++ `ProcessProposal` lifecycle further binds tx-execution into the consensus tick. That is acceptable for general-purpose chains but fights FBA's tick boundary and MCP's parallel pslice assembly - the explicit §5.5 rejection.
- **DAG protocols: Narwhal/Bullshark/Mysticeti.** Decouple data availability (DAG) from ordering (consensus on DAG vertices) to maximise throughput. Latency cost is 3-6× a leader-based round-trip per the Sui/Aptos public benchmarks, and intra-block ordering is non-deterministic at the application layer - disqualifying for a CLOB whose semantics depend on tick-boundary determinism.
- **Threshold Simplex specifically.** Adds two properties on top of base Simplex that the alternatives lack natively: a ~240-byte $O(1)$-verifiable certificate (useful for light clients and bridges) and an embedded bias-resistant VRF for leader election and post-facto randomness (useful for downstream execution).

### Maturity and security caveats

- **Paper-level security.** The Chan-Pass paper is peer-reviewed (TCC 2023) and the proof is among the simpler BFT proofs in the literature. Standard partial-synchrony + static-corruption assumptions; safety under $f < n/3$.
- **Implementation-level security.** No publicly published third-party audit report on `commonware-consensus::threshold_simplex` was located during this research. Production exposure is currently dominated by Tempo (~2 months on mainnet as of May 2026) and any audit work commissioned by Tempo, Paradigm, or Commonware has not surfaced publicly through standard channels. UltraFast should not assume an existing audit covers its v1 deployment; budgeting an independent audit of the consensus crate at the version actually deployed is appropriate.
- **Threshold-cryptography failure modes.** BLS12-381 partial-signature schemes assume DKG integrity. A malicious DKG run can produce a shared secret known to a coalition; identifiable-abort DKGs (the standard family for production use) mitigate but do not eliminate this risk. Resharing introduces the same risk on every validator-set rotation. UltraFast's TSS section (§10) treats this carefully for the bridge layer; the consensus layer inherits the same family of considerations.
- **Count-quorum trap.** As §5.3 acknowledges, the threshold scheme is blind to stake. A consensus-layer attacker who acquires control of $f+1$ validator nodes by any means - operational compromise, social engineering, infrastructure provider failure - can halt liveness regardless of how little stake those nodes nominally hold. UltraFast's curated v1 set bounds this risk; M2/M3 expansion to permissionless admission (§13.3) makes the separation between consensus weight and economic weight a structural property to monitor.
- **Lazy verification.** The "lazy verification" optimisation means a malformed-partial flood is cheap to send and only diagnosed at aggregation time. Production deployments should rate-limit at the networking layer; this is implementation-level rather than protocol-level, but worth flagging.

### Bottom line for UltraFast

Threshold Simplex is the right base-layer choice on paper: simple proof, small certificate, fast pessimistic path, $O(1)$ verification, native randomness, and an active maintainer (Commonware) with a flagship production user (Tempo) driving optimisation. The v1 simplifications (count-quorum, curated set) are honest about what they trade away and where the trade resolves (§13.3, §5.3). The work that remains is engineering. Phase 0 must demonstrate that this protocol, plus Minimmit, plus reth-via-Engine-API, plus QMDB, hits the §12.1 latency budget at $n = 30$ on a two-region topology. The entire UltraFast latency thesis lives or dies on that measurement.

---

### Primary sources

- Chan, B. Y., and Pass, R. "Simplex Consensus: A Simple and Fast Consensus Protocol." TCC 2023. IACR ePrint 2023/463. https://eprint.iacr.org/2023/463
- Commonware. "Many-to-Many Interoperability with Threshold Simplex." 16 January 2025. https://commonware.xyz/blogs/threshold-simplex
- Commonware. "Once a Validator, Not Always a Validator" (resharing). https://commonware.xyz/blogs/reshare
- `commonwarexyz/monorepo`, `commonware-consensus` crate (v2026.3.0 at time of research).
- `ava-labs/Simplex` (Go reference implementation of base Simplex).
- Decentralized Thoughts. "From Tendermint to Simplex." 18 June 2025. https://decentralizedthoughts.github.io/2025-06-18-simplex/
- Decentralized Thoughts. "Variants of Simplex with Reduced Bad-case Latency: C-Simplex and Kuplex." 24 September 2025.
- Minimmit. arXiv:2508.10862.
- Tempo / Paradigm announcement (Tempo as production Threshold Simplex user, $25M Commonware investment, November 2025; mainnet 18 March 2026).
- Solana Alpenglow / SIMD-0326 (Votor as Simplex-derived consensus; approved September 2025; mainnet target late 2026).
