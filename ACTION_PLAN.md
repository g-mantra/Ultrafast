# UltraFast: Action Plan

> **Date:** 2026-05-07
> **Status:** Architecture Firming (post-YI_PROPOSAL rework)
> **Companions:**
> - `YI_PROPOSAL.md` — recommended-stack rationale (Yi Huang + G, May 2026); the architectural decisions in §2 derive from §3–§7 of that proposal.
> - `YI_RESEARCH.md` — workstream-organised spec brief (W01–W17) with deliverables and acceptance criteria.
> - `RESEARCH.md` — broader research backing (privacy, ZK, prediction markets, competitor landscape).

---

## 1. Vision & Goals

UltraFast is a **unified on-chain derivatives platform** built on a custom Layer 1 blockchain. It combines perpetual futures (HIP-3 style) and scalar prediction markets (HIP-4 style) under a single matching engine and margin system, sharing liquidity across both product types for maximum capital efficiency.

### Hard Requirements

| # | Requirement | Why It Matters |
|---|-------------|----------------|
| 1 | **CEX-competitive speed** — **~200 ms p50 finality** on the Minimmit happy path, ~300 ms p99, ~400 ms pessimistic-leader floor; 100K+ orders/sec headroom | Traders will not move from Hyperliquid to a system that *feels* slower. The 200 ms target closes most of the gap to Hyperliquid's ~70 ms BFT finality while preserving structural-fairness guarantees Hyperliquid doesn't offer. Achieved via three composed levers (Minimmit from launch + 2-region validator topology + speculative execution against the proposal) — see §2 Consensus. |
| 2 | **Sealed-bid batch settlement** — in-protocol FBA at a 100–250 ms tick, uniform clearing price per market | Eliminates intra-tick ordering MEV (sandwich, classic front-run) by construction. All orders within a tick get the same price; reordering is semantically meaningless. |
| 3 | **Censorship-resistant block production** — multi-concurrent-proposer (MCP) layer underneath consensus | Threshold-encrypted mempools are too slow for a sub-second perp (committee halt risk + minutes-scale latency on Gnosis production). FBA needs **selective-censorship-resistance** and **hiding** from the consensus layer to be sound, and a single proposer cannot provide either. MCP is the protocol-level prerequisite, not validator honesty. |
| 4 | **Shared liquidity** — perps and prediction markets in one margin system | Capital locked in a prediction market position should offset risk on a perp position. Cross-product margining unlocks capital efficiency no competitor offers. |

### Key Differentiators vs Hyperliquid

- **MEV-resistant by construction, not by promise**: FBA + MCP give protocol-level fair ordering. Hyperliquid's defense is "21 honest validators"; ours is a property the protocol enforces.
- **Single-VM CLOB as a system contract**: synchronous, atomic reads of book state from user contracts. Eliminates Hyperliquid's HyperCore↔HyperEVM async seam.
- **Prediction markets**: native scalar outcome trading with shared margin (Hyperliquid treats these as separate products if at all).
- **RWA perpetuals**: gold, equities, FX, treasury yields via MANTRA ecosystem integration.
- **Opt-in TEE dark pool** for institutional flow (post-MVP) — addresses the privacy use case Hyperliquid leaks to CEXes, without bolting an encrypted mempool onto the retail path.
- **Open validator set and open-source matching engine** (vs Hyperliquid's closed-source, team-controlled validators).

---

## 2. Validated Architecture

Research has converged on the following technical stack. Each component is backed by production evidence or peer-reviewed work (see RESEARCH.md for citations).

### Consensus: Threshold Simplex + Minimmit (Commonware)

- **Threshold Simplex** (Chan & Pass / Commonware refinement of Simplex). Validators run a one-time DKG to produce a shared BLS12-381 threshold secret; every consensus message is a partial signature; once 2f+1 partials arrive, a single ~240-byte threshold-signature certificate is produced per view, verifiable against a static public key that survives validator-set churn via resharing.
- **Latency budget**: **~200 ms p50, ~300 ms p99, ~400 ms pessimistic floor.** The often-quoted "400 ms Simplex" number is the *pessimistic-leader / 80 ms WAN* case from the published comparison (400 ms Simplex vs 2480 ms HotStuff vs 2880 ms Streamlet — Simplex matches PBFT-style stable-leader latency while keeping Streamlet's simplicity). Three composed levers bring the *expected* case to ~200 ms:
  1. **Minimmit from launch** (not M1) — single-round finality when ≥4f+1 honest, which at a 30-validator curated equal-weight v1 set is the common case. One round at ~30 ms one-way RTT ≈ 90–120 ms commit before execution.
  2. **2-region validator topology** — v1 set constrained to two low-latency regions (e.g. US-East + EU-West, ~30 ms one-way) instead of 4+ jurisdictions. Cuts every consensus round proportionally. The "≥4 jurisdictions" gate moves to M1 (see §4 milestones), accepted as v1's jurisdiction-diversity debt.
  3. **Speculative execution against the proposal** — reth executes on `engine_newPayload` *before* the threshold-cert arrives; QMDB root commit waits for finality. Submit-to-fill perceived latency tracks the optimistic path with a deterministic rollback if Simplex skips the view.
- **Fallback floor (~400 ms)**: pessimistic-leader / cross-region partition / Minimmit fallback to standard Simplex (`n ≥ 3f+1`) if >f+1 validators are slow. The system degrades gracefully to the original 400 ms number rather than halting.
- **Minimmit fast path** — Commonware's `n ≥ 5f+1` (i.e. <20 % Byzantine) variant. Honest leaders finalise after a *single round* on the happy path. **Enabled from v1 launch** with the curated 30-validator set; standard Threshold Simplex (`n ≥ 3f+1`) remains as the automatic fallback when the 5f+1 quorum is unmet.
- **Stake-weighting (Yi Huang's correction)**. Commonware's threshold aggregation is *count-quorum*, not stake-quorum. We work around with **equal-weight curated bonded validators + a separate stake-weighted accountability layer** for slashing (see §4). This is the lowest-friction option for a 30–100 validator set; alternatives (virtual-share / weighted DKG, Aptos-style normalisation) considered and rejected for v1 implementation cost.
- **Why not HotStuff / CometBFT / DAG?** HotStuff's pessimistic-leader latency is 6× worse than Simplex on the same network; CometBFT's `ProcessProposal` lifecycle obstructs FBA + MCP; DAG protocols (Narwhal/Bullshark/Mysticeti) trade 3–6× latency for throughput we don't need yet, and lose deterministic ordering — disqualifying for a CLOB.
- **Why not Sei Autobahn?** Inherits Cosmos SDK substrate (which §2 of YI_PROPOSAL closes off) and is one step behind a project we don't control.
- **Reference**: `commonwarexyz/monorepo` (Rust); Threshold Simplex spec at `https://commonware.xyz/blogs/threshold-simplex`; Minimmit at `monorepo/pipeline/minimmit/minimmit.md`.

### Execution: EVM via reth + Engine API + Block-STM with Aggregators

- **Stock reth driven via Engine API** (`engine_newPayloadV*`, `engine_forkchoiceUpdatedV*`, `engine_getPayloadV*`). Same architectural shape Tempo (Stripe/Paradigm) and Monad converged on. Inherits Foundry / Hardhat / Etherscan / every wallet for free; lowest audit risk; lowest build cost.
- **Why not Cosmos-EVM?** Recurring gas-refund / precompile-atomicity bug class (GHSA-mjfq-3qr2-6g84, May 2025, CVSS 8.3 — `Run` methods not atomic, deferred `HandleGasError` failed to revert StateDB on out-of-gas, allowing partial-state-write claims). Same bug class that plagued Evmos. Cosmos Labs explicitly will not tag stable v1 until audit + benchmarking complete. Unacceptable substrate for leveraged perps.
- **Why not Groundhog / custom commutative VM?** Considered and rejected: highest build cost, highest audit risk, no production deployments, requires non-EVM VM (EVM has no semantic handle on "this op is `Incr`"). Adopted *concept* (commutative ops at hot keys) via Aptos-style aggregator primitives layered on Block-STM instead — production-tested, EVM-compatible, free wins.
- **Why not Stylus / RISC-V?** Stylus (WASM alongside EVM) and RISC-V (Vitalik direction, Vyper Venom IR) are real future paths but greenfield risk for v1. Defer to post-launch.
- **Parallelism — Block-STM with aggregator primitives** (Aptos-style typed effects). Vanilla Block-STM degrades toward sequential under hot-key contention — exactly the CLOB / funding-accumulator workload. Aggregators lift `SLOAD; ADD; SSTORE` patterns to typed `Incr(key, delta)` ops the runtime knows are commutative; two `Incr`s on the same key don't trigger an abort. Helps for fees, funding, balances, vault share supply, insurance fund.
- **Matching engine itself runs single-threaded per market**. The FBA tick collapses what would have been hot-key contention into a single batched solve — there's nothing to parallelise inside one market's clearing computation.
- **CLOB as a system contract on the EVM lane** (no HyperCore↔HyperEVM seam). User contracts read book state synchronously in the same call frame they trade in; tick-deferred writes return synchronously with `queued for tick T+1` status and settle at tick close.
- **Hard-fork policy**: track Ethereum upstream (Cancun parity for Foundry / standard Solidity); custom precompiles only for matching-engine reads, oracle reads, aggregator surface — never for state mutation, to avoid the Cosmos-EVM bug class.
- **Defer**: revmc JIT (compute-bound speedup, not state-bound; perp DEX is state-bound), Stylus, RISC-V to v2+.

### State Storage: QMDB (Commonware)

Vanilla reth uses MDBX with a hexary Merkle Patricia Trie — competent but I/O-bound at 200k TPS (the trie + RocksDB combination hits a wall on writes per state access). We replace the state backend with **QMDB** (Quick Merkle Database, LayerZero Labs, arXiv:2501.05262), bundled in the Commonware monorepo: append-only KV + Merkle store as immutable subtrees ("twigs"), **one SSD read per state access, O(1) IOs for updates, in-memory Merkleisation at ~2.3 bytes/entry**. Free win regardless of consensus / VM choices, optimised for the perp churn pattern (heavy writes on a few hot markets).

- **State commitment**: every block exposes a Merkle root over post-execution state. The ZK light-client bridge prover circuit operates against QMDB's native commitment; **Ethereum-MPT-root compatibility is not a v1 requirement** — Foundry / standard wallets don't depend on the root format, only on EVM execution semantics.
- **reth integration**: replace reth's MDBX-backed state DB with a QMDB shim implementing reth's state-DB trait surface. Translation layer exists between EVM's hexary-trie *semantics* (which we expose to user contracts via the standard `eth_getProof`-style RPCs) and QMDB's twig storage *underneath*.
- **Sync model**: snapshot-based fast-sync from a recent commitment + tail of blocks. Cold-start to live-tip in minutes on consumer SSD.
- **Pruning**: full-archive for indexers, pruned at configurable depth for default validators. Disk-cost curve sized at projected 12-month chain weight before mainnet.
- **Reference**: QMDB paper arXiv:2501.05262; Commonware monorepo `storage/` crate.

### Matching: Frequent Batch Auctions (FBA)

- All orders within a block matched at a **uniform clearing price** per market
- Same-price orders filled **pro-rata** (not time-priority) — no speed advantage
- Cancels processed before matching in each block (zero-cost within batch)
- Serves **both** perps and prediction markets through the same engine
- **MEV implication**: no front-running (all get same price), no sandwiching (no sequential price differences)

**Specs (some open in §5).** Tick parameter: target 100–200 ms locked to block cadence. Clearing rule: uniform clearing price per market (CowSwap-style), pro-rata at level — **normative**. Order-types language: limit, market, IOC, FOK, reduce-only as native; **post-only** is awkward in pure batch semantics (no continuous book to "post" against) and is deferred to §5. Solver location: **in-validator native module** (Speedex precedent), not an in-VM precompile, since FBA runs at block level not transaction level. Unfilled-order policy: limit orders carry to next tick; auction-style (IOC/FOK/market) expire at tick close. Reference: YI_RESEARCH W06.

### MEV Elimination Stack (Two Layers + Bolt-on)

```
Layer 1: Multi-Concurrent-Proposer (MCP) consensus
         16 stake-weighted Proposers accept txs in 50 ms cycles, assemble pslices,
         erasure-code into 256 pshreds, Attesters sign attestations.
         Leader is FORCED to include any pslice with ≥40% attester support;
         block valid only if total attestation ≥60%.
         → Selective censorship is structurally invalid, not just slashable
         → Provides the hiding + censorship-resistance prerequisite that any
           application-layer MEV defense (FBA, intent solvers, RFQ) requires
           per arXiv:2509.23984 / 2511.13080

Layer 2: In-protocol Frequent Batch Auctions
         Uniform clearing price per market per 100–250 ms tick, pro-rata at level
         → Reordering within a tick is semantically meaningless
         → Eliminates intra-tick sandwich, classic front-run, time-boost MEV

Bolt-on: Tokenized ordering (Masquerade pattern, ACM 10.1145/3730410)
         Strictly-increasing serial-numbered tokens for un-batched paths
         (admin txs, governance, cross-chain message handlers)
         → Deterministic ordering for the few paths that bypass FBA
```

**Combined result**: ordering MEV (sandwich, classic front-run, hard censorship) is structurally eliminated. Residual MEV vectors per arXiv:2511.13080: PBS-layer extraction (we run no PBS), temporal MEV (proposal→execution gap, mitigated by sub-second tick), cross-domain MEV (information edges across chains — a feature of efficient markets, not an exploit). **Threshold-encrypted mempools (Shutter, Ferveo, EIP-8184/8209) considered and rejected for v1**: production tx-to-inclusion latency on Gnosis is ~3 minutes, EIP-8184/8209 add ≥1 slot of latency, and committee halt-risk is incompatible with a sub-second perp. Revisit at v2 if committee-liveness reaches sub-100 ms.

### Multi-Concurrent-Proposer (MCP) Layer

MCP is the consensus-layer prerequisite for FBA — and for any application-layer MEV defence. The relevant theorem (arXiv:2509.23984): any auction-based mitigation (FBA, intent solvers, OFAs, RFQ, encrypted mempools) requires the underlying consensus to provide **selective-censorship resistance** and **hiding**, both of which a single proposer trivially fails. Without MCP underneath, FBA's fairness guarantee reduces to "trust the leader" — exactly the property we're trying to eliminate.

- **Reference design**: Solana Constellation pattern — ~16 stake-weighted Proposers, 256 Attesters, 50 ms cycles. Proposers accept txs and assemble *pslices*, erasure-coded into 256 *pshreds* (one per Attester); Attesters sign attestations. The leader is **forced** to include any pslice that crossed 40 % attester support; a block is *structurally invalid* if total attestation < 60 %. Censoring an attested pslice produces an invalid block — enforcement is architectural, not slashing-based.
- **What MCP solves**: hard selective censorship (by IP, fee, deposit pattern). What it does *not* solve: content visibility (Proposers see plaintext post-deadline; redundant submission widens exposure), timing/late-message attacks. The complement is the FBA tick, which makes whatever the Proposers see semantically un-front-runnable.
- **Composition with FBA**: MCP delivers censorship-resistant *commit* of order txs into the FBA tick boundary; FBA reveals at tick close and clears at uniform price. The MCP cycle nests inside the block cadence — pslice deadline aligns with block proposal.
- **Slashing**: equivocating Proposers / Attesters detected by the commit phase → the staking module (§4) hard-slashes per the standard equivocation evidence path.
- **Bandwidth budget**: at projected throughput, < 50 Mbps per validator — measured target for Phase A acceptance.
- **Rollout**: v1 ships with **single-proposer Threshold Simplex** and an explicit accepted-residual-risk note on selective censorship; **MCP lands in v1.1** once Constellation (or equivalent) ships and we've validated latency on testnet. The §6 phase plan reflects this.
- **Reference**: arXiv:2509.23984 (MCP why and how), arXiv:2511.13080 (residual MEV taxonomy), `https://constellation.anza.xyz/`, `https://www.helius.dev/blog/constellation`.

### Typed-Effect / Aggregator Primitives

Block-STM degrades toward sequential under hot-key contention — the canonical perp-DEX pathology (one funding accumulator per market, one fee accumulator, one insurance fund). Aggregator primitives (Aptos pattern) lift `SLOAD; ADD; SSTORE` patterns to typed `Incr(key, delta)` ops the runtime knows are commutative, so two `Incr`s on the same key don't trigger a Block-STM abort.

- **Surface for system contracts** day-1 (CLOB fee accumulator, funding accumulator, insurance fund, vault share supply, builder-code accumulator).
- **Surface for general user contracts** via a custom precompile + Solidity library — `Aggregator.add(50)` compiles to the precompile call. Reserved storage-slot pattern for executor detection considered and rejected (too magical / hard for tooling to reason about).
- **Operations**: `add`, `sub`, `read`, `read_with_overflow_check`. Reads materialise the current value and force a serialisation point — acceptable at tick boundaries, rare in mid-tick paths.
- **Overflow / underflow policy**: hard cap at u128; over-cap aborts the contributing op rather than silently saturating.
- **Why a precompile, not a syscall convention**: a precompile is auditable surface that Foundry / Hardhat / wallets can introspect; a syscall convention requires custom tooling.
- **Reference**: Aptos `aggregator_v2` (`https://medium.com/aptoslabs/aggregators-how-sequential-workloads-are-executed-in-parallel-on-the-aptos-blockchain-e7992c70cefb`).

### Privacy Tiers

The MEV stack (FBA + MCP) gives every trader the same *protection from front-running and reordering* without needing to encrypt orders. Privacy beyond that — hiding *content* from validators / observers — is an opt-in tier, not a baseline.

| Tier | Technology | What's Hidden | Overhead | Availability | Target User |
|------|-----------|---------------|----------|--------------|-------------|
| **Lit (default)** | FBA + MCP only | Nothing — orders, fills, positions all visible on-chain | None beyond consensus | v1 | All retail and most pro flow |
| **Position-private** | ZK state proofs — Pedersen commitments + range proofs over positions | Position sizes, margin ratios, liquidation levels | Modest (client-side prove on commitment update) | v2 | Active traders who don't want their book read by competitors |
| **Dark pool (TEE)** | TEE-attested matching engine (Intel TDX or AMD SEV-SNP, attested on-chain) | Full pre-trade and post-trade order details; on-chain settlement events leak only size + price | Sub-ms enclave matching; replication across N TEEs for liveness | v1.5 / post-MVP | Institutions, $100K+ size |
| **Dark pool (ZK + MPC, Renegade-style)** | Collaborative PLONK matching | Same as TEE tier, no enclave-vendor trust | Tens to hundreds of ms proving | v2+ migration path | Privacy-maximalist institutions |

**Why TEE before ZK + MPC.** Renegade-style ZK + MPC is the strongest privacy guarantee but adds tens-to-hundreds of ms of proving overhead — too expensive to bootstrap a venue against. TEEs ship matching at sub-ms with vendor-attestation as the trust assumption; once flow is bootstrapped, the same volume can migrate to ZK + MPC without reopening venue economics.

### Order Lifecycle

```
1. Trader signs order tx (EVM, EIP-712); submits to a Proposer's RPC endpoint
2. MCP layer:
   - 16 Proposers each accept incoming txs in 50 ms cycles
   - Each Proposer assembles a pslice and erasure-codes into 256 pshreds
   - 256 Attesters sign attestations on pshreds they receive
3. Leader (rotated per Threshold Simplex view) assembles a block
   from pslices that crossed ≥40% attester support; block is invalid
   if total attestation <60% (architectural censorship-resistance)
4. Threshold Simplex consensus on the assembled block
   - Validators emit BLS partial signatures
   - 2f+1 partials → single ~240-byte threshold-sig certificate per view
   - **Minimmit fast-path enabled from launch** (n≥5f+1 happy path):
     finalised after 1 round when ≥4f+1 honest; automatic fallback to
     standard Simplex (`n ≥ 3f+1`) if the 5f+1 quorum is unmet
5. reth executes the block via Engine API
   - **Speculative execution**: reth begins `engine_newPayload` on the
     proposal before the threshold-cert arrives; QMDB root commit gates
     on finality. Deterministic rollback if Simplex skips the view.
   - Block-STM speculative parallel execution within the block
   - Aggregator primitives keep funding/fees/balances commutative
6. FBA system contract clears each market at tick boundary:
   - Uniform clearing price per market
   - Pro-rata at level
   - Tick-deferred order writes settle here; sync reads remain available mid-tick
7. State committed via QMDB Merkle root — finality
8. (Bridge path, async) ZK light-client proof posted to Ethereum
```

**Total finality**: **~200 ms p50, ~300 ms p99** on the Minimmit happy path with 2-region validator topology and speculative execution; **~400 ms pessimistic-leader floor** under Minimmit→Simplex fallback. **Bridge withdrawal finality**: ZK-light-client cycle (target minutes; see §2 cross-chain).

### Composability Surface — CLOB as System Contract

The matching engine is exposed to other on-chain code via a fixed system-contract ABI on the EVM lane — not walled off as a private validator subsystem. This is the deliberate architectural win over Hyperliquid's HyperCore ↔ HyperEVM seam (which forces async marshalling between an off-VM matching module and an on-VM contract surface, and which Hyperliquid users complain about).

- **Synchronous reads** for contract callers in the same call frame: best bid/ask, depth at level, mark price, last clearing price, funding rate snapshot. Vaults, lending markets, liquidators, and structured-product contracts read book state in the same EVM tx that triggers their downstream logic.
- **Asynchronous (tick-deferred) writes**: `placeOrder`, `cancelOrder`, `modifyOrder`, `batchCancel` return synchronously with status `queued for tick T+1`; settlement events fire when the tick clears.
- **Events**: `OrderPlaced`, `OrderFilled`, `OrderCanceled`, `TickCleared(tick_id, market_id, clearing_price, volume)` — indexed for cheap indexer reconstruction.
- **Failure semantics**: if the FBA solver fails within tick budget, all queued orders revert atomically; no FIFO fallback (would re-introduce ordering MEV).
- **Solver location**: in-validator native module (Speedex precedent), called by the system contract at tick-boundary; not an in-VM precompile, since FBA runs at block-level not transaction-level.
- **EVM compatibility level**: full Cancun parity so Foundry / standard Solidity work unchanged. Custom precompiles only for matching-engine reads, oracle reads, and the aggregator surface — never for state mutation, to avoid the Cosmos-EVM bug class.

### Cross-Chain Asset Custody (Validator-Operated TSS Vaults)

UltraFast accepts native deposits from external chains — Bitcoin, Ethereum and all EVM L2s, Solana, Cosmos, etc. — without wrapped-token intermediaries. The validator set jointly controls a vault address on each foreign chain via a threshold signature scheme (TSS): no single validator (or minority subset) holds a key, and signing requires a 2/3 stake-weighted quorum that matches the consensus safety bound.

Deposited assets become spendable balances on UltraFast and serve as collateral for perps margin, prediction market positions, and unified cross-product margin. Withdrawals trigger a TSS signing round that produces a single native signature on the destination chain — verification cost is identical to a regular user transaction (no per-validator on-chain footprint).

**TSS protocol per cryptographic regime:**

| Foreign Chains | Curve / Scheme | TSS Protocol | Reference Implementation |
|---|---|---|---|
| Bitcoin Taproot, Solana, Cosmos ed25519 | Schnorr / EdDSA | **FROST (RFC 9591) wrapped in ROAST** for robust liveness under aborters | `ZcashFoundation/frost` (Rust) |
| Bitcoin legacy/SegWit, Ethereum, all EVM | ECDSA secp256k1 | **DKLs23/24** (3-round, Paillier-free) | `silence-laboratories/dkls23` (Rust) |
| ECDSA fallback | ECDSA secp256k1 | **CGGMP21** (audited 2024–25, identifiable abort) | `LFDT-Lockness/cggmp21` (Rust) |

All three are post-TSSHOCK and support **identifiable abort** — protocol deviation is publicly attributable to a specific validator, enabling automated on-chain slashing. GG18/GG20 (THORChain, original Multichain) is explicitly **excluded**: the TSSHOCK class of attacks against `tss-lib` derivatives makes it unsafe for new deployments.

**Distributed Key Generation:** every chain's vault key is generated by the validator set via the protocol's native DKG (Pedersen DKG with VSS for FROST; protocol-specific for DKLs23/CGGMP21). No trusted dealer; no operator-held shards.

**Validator-set rotation — fresh wallet model (tBTC v2 pattern):** rather than reshare existing keys via dynamic proactive secret sharing (CHURP / D-FROST), UltraFast generates a *new* TSS wallet on each foreign chain at every epoch boundary (e.g., monthly, or when validator-set churn exceeds a threshold). New deposits route to the new address; old wallets sweep into the new one over a bounded window, then retire. This sidesteps DPSS complexity and gives stale wallets both a finite lifespan and a finite custodied value.

**Bonded-stake-to-custodied-value ratio:** total bonded UFAST stake ≥ **2× total custodied value globally**, enforced by an on-chain deposit cap that throttles new inflows when bonded security is insufficient. This is THORChain's "Incentive Pendulum" applied to a multi-asset vault: a 2/3-stake collusion to steal foreign-chain assets is never profitable because the slashable bond exceeds the loot.

**Foreign-chain bridge contracts:** EVM/Solana-side smart contracts (deposit detection, withdrawal verification) are audited separately from the TSS layer. Withdrawals are subject to a **dispute window with finalizer kill-switch** (Hyperliquid bridge pattern) — a designated emergency multisig can pause the bridge during the window if a malicious withdrawal is detected, escalating to governance.

**Closest production analog:** **Chainflip** — 150 PoS validators, FROST across BTC/ETH/SOL/Polkadot/Arbitrum vaults — is the architectural reference. THORChain (GG20-based) and the Hyperliquid bridge (plain stake-weighted ECDSA multisig, not TSS) demonstrate the validator-controlled-vault model in production but are weaker designs we deliberately do not replicate.

### Ethereum-Corridor ZK Light-Client Bridge (Complement to TSS)

For the **Ethereum L1 corridor specifically** — the highest-volume USDC inflow path — a **Succinct-style ZK light-client bridge** runs alongside the TSS vault. The light-client proves UltraFast's STF on Ethereum and proves Ethereum's sync-committee state on UltraFast, replacing stake-bonded trust-minimisation with cryptographic finality on the corridor that carries the largest custodied value.

- **Trust gained vs TSS-only**: Ethereum-side cryptographic certainty that whatever validators committed to, the STF was applied correctly. A 13-of-21 validator collusion still censors and front-runs at will (the ZK proves *they didn't deviate from the rules they ran*, not that the rules or set are decentralised) — so the ZK bridge complements the bonded-stake-to-custodied-value cap, it doesn't replace it. **This nuance must not collapse in marketing copy** — the ZK bridge is a *bridge-level* property, not a chain-level one.
- **Why Ethereum first / only (in v1)**: Ethereum is the largest USDC corridor; collusion attack surface is highest there. Other corridors (BTC/SOL/Cosmos/EVM-L2) stay TSS-only; some EVM-L2s already proof-bridge to L1, so the UltraFast↔Ethereum ZK path inherits their security transitively.
- **Why not IBC Eureka**: IBC Eureka would have been the day-1 bridge if we were on Cosmos SDK — but per the architecture (greenfield Rust on Commonware, not Cosmos), it's closed. Succinct's hosted Ethereum ZK light client (used in production by Gnosis Omnibridge) gives the same trust model without Cosmos.
- **Hosted vs self-hosted prover**: §5 decision; Succinct hosted (fee-revenue split) for v1 is the lowest-ops path; self-hosted considered at v2+ once volume justifies the capex.
- **State-root format**: bridge prover circuit operates against QMDB's native commitment; no MPT translation required.
- **Force-withdrawal escape hatch**: if validators stall, users can force-withdraw from the L1 bridge contract after a documented timeout — the same Hyperliquid-style dispute window with finaliser kill-switch policy applies (see TSS section above).
- **Reference**: Succinct Telepathy (`https://docs.succinct.xyz/`), Gnosis Omnibridge integration.

---

## 3. Product Architecture

### Perpetual Futures (HIP-3 Style)

Standard continuous-price derivatives with no expiration:
- **Assets**: crypto (BTC, ETH, SOL, MANTRA) + RWA (gold, equities, FX, treasury yields)
- **Leverage**: up to 50x (crypto), 20x (RWA)
- **Funding rate**: periodic payments between longs and shorts to anchor contract price to spot
- **Liquidation**: gradual liquidation engine with insurance fund backstop
- **Collateral**: USDC (primary), MANTRA, **native BTC / ETH / SOL** (held in validator-operated TSS vaults — see §2), yield-bearing assets (stATOM, stETH), MANTRA RWA tokens

### Scalar Prediction Markets (HIP-4 Style, Launch First)

Range-based event contracts that settle proportionally within a [min, max] bound:
- **Payout formula**: `(Result - Min) / (Max - Min)`, capped at 0 and 1
- **Why scalar first**: smoother price paths than binary (Yes/No) → enables leverage (5-10x) without catastrophic chain liquidations from binary gaps
- **Expiration**: fixed, tied to event resolution
- **Deployment**: permissionless (stake-gated market creation)
- **Binary markets**: added later once liquidation mechanics are battle-tested with scalar

**Scalar solves the binary gap problem**: a CPI print moving from 3.5% to 4.0% in a [2%, 6%] range only moves the price from 0.375 to 0.50 — a manageable shift for leveraged positions, unlike a binary flip from 0 to 1.

### Unified Margin System

The core capital efficiency innovation — a single account holds both perps and prediction market positions:

- **Cross-margin**: all positions share one collateral pool
- **Risk offsetting**: if a long ETH perp is paired with a "ETH below $X" outcome contract, the system recognizes the hedge and reduces total margin requirement
- **Excess margin release**: freed capital from offsets can be deployed to new positions
- **Settlement asset**: single stablecoin denomination across all products

### Shared Matching Engine

One FBA-based CLOB serves both product types:
- Perps orders and prediction market orders processed in the same block-level batch auction
- Uniform clearing price computed independently per market
- Same MEV protections (FBA + MCP) apply to all order types

### Listing Primitives (HIP-1 / HIP-2 / HIP-3 Equivalents)

Hyperliquid's three listing modules each address a distinct phase of bringing a new market on-chain. UltraFast specifies functional equivalents — three system contracts on the EVM lane, governed by the same staking and slashing infrastructure:

- **Token issuance (HIP-1 equivalent).** Permissionless deployment of a new asset via a Dutch auction whose proceeds pay deploy gas. Auction proceeds either burned (Hyperliquid pattern) or routed to treasury — open in §5. Minimum bond and rate-limit per deployer to throttle spam.
- **Native MM seeder (HIP-2 equivalent).** On-chain bootstrap-MM contract per market, posting a fixed two-sided spread that refreshes every few seconds against an oracle mark (Hyperliquid HIP-2 uses 0.3 % spread, 3-second refresh). Removable by governance once organic depth crosses a configurable threshold. Lets new markets achieve a tradable book before external MM onboards.
- **Builder-deployed perps (HIP-3 equivalent).** Third-party deployers of new perp markets post a UFAST stake bond; bond is slashable for oracle manipulation, malformed funding, or failed-liquidation cascades attributable to market-config errors. Deployer earns a configurable share of fees from their market (capped per §4 builder-code policy).

**Curation**: governance-gated per asset *class* — crypto perps permissionless once §6 audit milestones met; RWA perps gated on compliance clearance. Risk-management implications (a meme-coin perp at 50× kills the insurance fund) handled by per-class leverage caps and liquidation-tier bands.

### Community Vault — Multi-Strategy

UltraFast's HLP-equivalent is **multi-strategy from day one**, not a single monolithic engine. Hyperliquid's HLP is monolithic and capacity-bound at ~$500M; segmenting strategies lets us scale TVL without diluting Sharpe and isolates drawdown per strategy. Differentiation lever vs Hyperliquid (per YI_PROPOSAL §7.1).

- **Strategy interface**: each strategy is a contract implementing `deposit / withdraw / reportPnL`. Risk-isolated capital pools — one strategy's drawdown cannot cascade into another's.
- **Initial strategies**: vol-targeted MM, basis arb (perp ↔ spot or perp ↔ prediction), liquidation backstop. More can be deployed by governance or third parties post-launch.
- **Share semantics**: ERC-4626-style transferable claims per strategy. Vault-of-vaults wrapper for retail depositors who want a blended exposure without picking strategies.
- **Withdrawal policy**: lock window per strategy (vol-targeted may be daily; backstop weekly) — explicit, not the implicit lock Hyperliquid runs.
- **Capacity gating**: per-strategy cap with on-chain monitoring; deposits blocked above cap; surplus routed to next-best strategy by configured allocator.

---

## 4. Validator Economics & Fee Distribution

UltraFast's validators perform two distinct security functions: (1) running consensus and execution, and (2) co-signing TSS withdrawals from foreign-chain vaults. Their economic alignment must scale with both. Trading fee revenue — denominated in the fee asset (USDC) — is the primary compensation, distributed directly rather than via token buybacks. This is **real yield** (in the GMX/dYdX v4 sense): protocol revenue paid in non-protocol assets, not inflationary emissions.

### Fee Distribution (dYdX v4 Pattern)

Each block, trading fees flow into a distribution module and split as follows:

| Recipient | Share | Notes |
|-----------|-------|-------|
| **Validators + delegators** | **80%** | Distributed proportional to stake. Validator commission 5–20% (5% protocol minimum, dYdX-style), remainder to delegators. Paid in **USDC**, not native token. |
| **Insurance fund** | **10–15%** | Until target size reached (e.g., 5% of open interest); excess thereafter routes to validators/stakers. |
| **Community treasury** | **5–10%** | Governance-controlled — grants, audits, security top-ups. |

**100% of liquidation penalties** route to the insurance fund separately from trading fees, matching dYdX/Drift/Aevo industry practice.

### Why Real Yield in USDC, Not Buyback-Driven Token Capture

The Hyperliquid model — ~97% of fees fund continuous HYPE buybacks — is rejected for UltraFast despite its current effectiveness:

- **Reflexivity risk.** Buyback models couple validator security to token price. A volume drop compounds: lower fees → smaller buybacks → falling token → lower stake value → reduced security budget at exactly the moment markets are stressed. Direct USDC distribution makes validator economics **linear** in volume.
- **TradFi alignment.** Derivatives traders evaluate yield in USDC terms. A real-yield-in-USDC pipe is the natural denomination for their expectations and the natural unit for institutional MM onboarding.
- **Optionality.** Governance can layer buybacks on top of the USDC distribution later without breaking the base. The reverse — moving from a buyback to a direct-distribution model — is governance-fraught because token holders entrenched on the buyback fight it.

### Native Token (UFAST)

UFAST is the staking, bonding, and governance asset — not the primary fee currency:
- **Bonding for consensus and TSS custody.** Validators must stake UFAST to participate; bonded value backs both consensus safety slashing and TSS bridge slashing.
- **Low base inflation (~3–5%).** Provides a security baseline regardless of fee revenue. Once trading fees sustain validator economics, governance can vote to pause inflation entirely (Hyperliquid-style net-deflationary state) without the volume-coupling risk of pure buybacks.
- **Governance.** Protocol parameter changes, fee splits, market deployments, treasury allocations.

### Builder-Code Fee Sharing (HIP-3 Pattern)

Third-party frontends, market makers, and permissionless market deployers can claim a configurable share of fees they originate (capped at e.g. 30%), routed via on-chain builder codes. This aligns ecosystem distribution with Hyperliquid's HIP-3 model and incentivizes external integrators without requiring direct grants.

### Slashing

Slashing covers both consensus and TSS misbehavior:

| Fault | Detection | Slash Severity |
|-------|-----------|----------------|
| Consensus safety violation (double-sign) | Standard PoS evidence | Hard slash (5–100% bond) |
| Consensus liveness fault (missed blocks) | Block-level | Soft slash, escalating |
| TSS protocol deviation (malformed shares, wrong messages) | **Identifiable abort** in FROST/ROAST/DKLs23/CGGMP21 | Hard slash, scaled to attempted theft |
| TSS liveness fault (refusal to sign valid withdrawal) | Quorum timeout | Soft slash, escalating with repetition |
| Off-protocol key extraction (TSSHOCK-class) | Undetectable until exploited | Mitigated by audit/library hygiene, not slashing |

### Validator-Set Sizing and Anti-Concentration

- **Target:** 30–100 validators in steady state — sized to Threshold Simplex's BLS aggregation, Minimmit's `n ≥ 5f+1` requirement (active from v1), and TSS signing performance (FROST sign at n=100: ~150–300 ms over WAN; DKG at n=100: a few seconds for DKLs23, tens of seconds for CGGMP21).
- **v1 launch**: curated bonded set of 30 equal-weight validators with the *separate stake-weighted accountability layer* described in §2 Consensus. **Geographic topology constrained to two low-latency regions** (e.g. US-East + EU-West, ~30 ms one-way) to hit the 200 ms p50 finality target. This is the explicit v1 trade: jurisdiction diversity deferred to M1 in exchange for CEX-competitive latency at launch.
- **Commission floor:** 5 % (matches dYdX v4).
- **Bridge-specific anti-concentration:** consider **square-root-of-stake voting weight** in TSS signing (Axelar pattern) — reduces the value of stake-concentration attacks against the bridge specifically without altering consensus weighting.
- **Self-stake minimum:** non-trivial (e.g., 1 % of validator-set median) to prevent zero-skin-in-the-game validators.

### Validator-Set Evolution Milestones

§4 targets 30–100 validators in steady state, but the *path* matters. Foundation curation at launch is acceptable; foundation curation at year three is not. Numerical milestones bind the trajectory:

| Milestone | Validator count | Decentralisation gates | Authority |
|-----------|-----------------|------------------------|-----------|
| **v1 launch** | ~30, foundation-curated | Public criteria; 2-region topology (latency-optimised); Minimmit fast-path enabled; uptime SLA | Foundation |
| **M1** | 50 | Top-10 stake share ≤ 33 %; ≥ 4 jurisdictions (expand from 2-region launch topology); ≥ 3 regions | Foundation, with public veto window |
| **M2** | 75 | Top-10 ≤ 25 %; ≥ 6 jurisdictions; ≥ 2 client implementations | Token-holder vote |
| **M3** | 100+ | Top-10 ≤ 20 %; permissionless admission with stake bond + on-chain reputation | Fully on-chain rules |

Failure to meet a milestone gate freezes set expansion until remediated. Anti-Sybil: stake bond + on-chain reputation; KYC only at v1 (foundation curation already gates entry).

---

## 5. Open Design Decisions

These must be resolved before implementation begins. Each requires either simulation, prototyping, or team alignment. Decisions resolved by the §2 architectural choices (consensus = Threshold Simplex + Minimmit; execution = reth + EVM via Engine API; storage = QMDB; matching = FBA; parallelism = Block-STM + aggregators) are not relisted here.

**Matching, MEV, and execution.**

| Decision | Options | Key Trade-off |
|----------|---------|---------------|
| **FBA tick parameter** | **100 ms locked to consensus cadence (default)**; 150 ms; 200 ms | At the 200 ms p50 finality target the tick must be ≤ block cadence — a tick that closes *after* the next block is finalised re-introduces a round-trip we just removed. 100 ms tick co-located with Minimmit's 1-round commit is the natural pairing; solver budget p99 ≤ 20 % of tick (≤ 20 ms) becomes the hard constraint. Penumbra runs ~5 s; CowSwap ~30 s. |
| **MCP rollout timing** | v1 (single-proposer-with-MCP from launch); **v1.1 add-on** (single-proposer at launch, MCP added once Constellation/equivalent ships); v2+ | Censorship-resistance strength vs ship-date risk. YI_PROPOSAL §9 recommends single-proposer first, MCP as v1.1. Risk register §7 reflects the v1 single-proposer residual. |
| **Threshold-encrypted mempool revisit window** | Reject permanently; revisit at v2 if Shutter-class committee liveness reaches sub-100 ms; ship a Ferveo-style lane v2 regardless | Privacy of order content vs latency / committee halt risk. Rejected for v1 per §2 MEV stack. |
| **FBA carry-vs-expire policy** | Limit carries / market expires (CLOB-like, current default in §2); all expire at tick close (auction-pure); per-order-type configurable | Trader UX vs engine simplicity vs MM reasoning. |
| **Post-only orders in FBA** | Not supported (clean batch semantics); supported via tick-pre-commit + conditional reveal; supported by adding a continuous lane parallel to FBA | MM ergonomics (post-only is core to MM workflow) vs FBA fairness guarantees. |
| **Aggregator / typed-effects general-contract surface** | Native precompile available to all user contracts; reserved for system contracts only (CLOB, vault, fees, insurance fund); not exposed at all | Contract-author DX vs hot-key abort behaviour under contention. |
| **Tokenized-ordering bolt-on scope** | Admin/governance txs only; admin + cross-chain message handlers; ship as optional general-purpose primitive | Latency / capital lockup vs deterministic ordering for non-FBA paths. Kill if FBA covers everything. |
| **EVM compatibility level** | Full Cancun parity + custom precompiles for matching/oracle/aggregator; selective subset omitting opcodes incompatible with FBA/MCP (e.g. `BLOCKHASH` semantics under MCP, `BASEFEE` under FBA); pin to a specific hard-fork | Foundry/Solidity compatibility vs internal coherence. YI_PROPOSAL §10 recommends full Cancun + custom precompiles. |

**Prediction markets, margin, risk.**

| Decision | Options | Key Trade-off |
|----------|---------|---------------|
| **Scalar range design** | Fixed ranges set at market creation; dynamic ranges that adjust; range width as a market parameter | Narrow ranges increase leverage risk; wide ranges reduce capital efficiency. |
| **Prediction market oracle** | Decentralised oracle committee; optimistic oracle with dispute period; UMA-style escalation | Event resolution is inherently subjective — needs robust dispute mechanism. |
| **Funding rate for scalar markets** | Oracle-anchored (reference external probability estimates); pure market-driven (no anchor); hybrid | No natural "spot" for event probability — this is a fundamental design challenge. |
| **Cross-product risk model** | Portfolio margining (correlations-based); simple additive offsets; SPAN-style risk arrays | Complexity vs accuracy. Portfolio margin is most capital-efficient but hardest to implement and prove in ZK. |
| **Leveraged prediction-market liquidation** | Standard perps-style liquidation; gradual de-leveraging; auto-close at boundary approach | Must handle edge cases where scalar markets approach boundary (0 or 1) rapidly. |

**Bridge, TSS, ZK light-client.**

| Decision | Options | Key Trade-off |
|----------|---------|---------------|
| **TSS protocol selection** | Mixed (FROST/ROAST for Schnorr+EdDSA, DKLs23 for ECDSA); single-protocol via universal scheme; FROST-only with ECDSA pre-signature gateway | Mixed gives best per-chain quality but doubles cryptographic surface area; single-protocol simplifies ops at the cost of using a non-optimal scheme on some chains. |
| **Validator-set rotation model** | Per-epoch fresh-wallet (tBTC v2 pattern); CHURP/D-FROST in-place resharing; hybrid (resharing within epoch, fresh wallet across major churn) | Fresh wallets bound per-wallet exposure but require sweep-window operational tooling. Resharing avoids sweeps but adds complex DPSS code paths and longer ceremonies. |
| **Bonded-to-custodied ratio** | Static 2×; static 3×; dynamic based on volatility / asset class | Higher ratio = more secure but caps bridge throughput. Dynamic adjusts to market conditions but is harder to audit and reason about. |
| **Bridge withdrawal dispute window** | None (instant); short (1–5 minutes, Hyperliquid-style); long (1+ hour, Optimistic-rollup-style) | Longer windows catch more attacks but degrade UX for legitimate withdrawals. |
| **ZK light-client prover hosting** | Succinct hosted (fee-revenue split); self-hosted (capex + ops); hybrid (Succinct day-1, migrate to self-hosted at v2) | Ops cost vs proving latency vs control. YI_PROPOSAL §6.5 recommends Succinct hosted for v1. |
| **Cosmos integration path** | Custom IBC translator (heavy build); LP-style bridge (LayerZero/Across pattern, lighter trust); skip Cosmos integration in v1 entirely | Engineering cost vs Cosmos-side liquidity capture vs trust assumption. YI_PROPOSAL §10 recommends skip-in-v1 unless Babylon/restaking demand materialises. |
| **Dark-pool privacy tech (post-MVP)** | TEE-attested only (Phase 1, fastest to ship); Renegade-style ZK + MPC only (strongest privacy, heaviest); TEE first, ZK + MPC migration path at v2 | Time-to-flow-bootstrap vs privacy-maximalist user trust. §2 Privacy Tiers commits to TEE-first; this row tracks v2 migration policy. |

**Validator economics.**

| Decision | Options | Key Trade-off |
|----------|---------|---------------|
| **Validator-set admission v1** | Foundation-curated 30 → progressive milestones; permissionless from day 1; foundation-curated indefinitely | Latency/coordination vs decentralisation. Hyperliquid launched permissioned. §4 Validator-Set Evolution commits to curated v1 with milestone path. |
| **Fee distribution split** | 80 / 15 / 5 (validators/insurance/treasury); 90 / 5 / 5; per-market configurable | Higher staker share boosts security budget; higher insurance share boosts solvency. Per-market tuning enables aggressive scalar/binary risk parameters but adds governance burden. |
| **Validator commission floor** | 5 % (dYdX); 10 %; market-determined with no floor | Higher floor protects small validators and ensures operator viability; lower floor maximises delegator yield. |
| **Native-token-vs-USDC fee currency** | 100 % USDC (real yield); USDC + optional UFAST buyback module added by governance later; immediate hybrid (e.g., 80 % USDC + 20 % UFAST buyback) | Pure USDC keeps validator economics linear in volume. Hybrid creates token demand but introduces buyback reflexivity risk. |
| **HIP-1 auction-proceeds destination** | Burned (Hyperliquid pattern); routed to community treasury; split (e.g., 50/50) | Token-capture narrative vs treasury runway. Reverses easier in one direction than the other. |

---

## 6. Remaining Work

### Phase 0.0 — Specs and RFC Infrastructure (Process Layer)

A lightweight specification process before code begins. Every Phase A workstream produces an RFC + (where applicable) ADR + (where applicable) TLA+ spec; nothing in Phase A merges without the corresponding RFC at `accepted` status.

- **Layout**: `specs/INDEX.md` (one-line entry per spec, sorted by ID), `specs/rfcs/`, `specs/adrs/`, `specs/tla/`.
- **RFC frontmatter**: `id`, `title`, `status` (`draft|review|accepted|superseded`), `authors`, `depends_on`, `supersedes`. Body sections per RFC 2119: Motivation / Specification (normative MUST/SHOULD/MAY) / Rationale / Security considerations / Open questions / References.
- **ADR format**: single-page Context / Decision / Consequences. One decision per ADR.
- **TLA+ tooling**: TLC for finite-state model-checking, Apalache for symbolic on larger state spaces. CI runs both on every PR touching `specs/tla/`. Yi Huang's TLA+ work on Block-STM is the in-house precedent.
- **Effort sizing convention**: S = 1–2 weeks one engineer, M = 3–6 weeks one engineer, L = 2–3 months one engineer, XL = 3–6 months a small team.
- **Acceptance per workstream**: deliverable artifact + 2-engineer review + acceptance criteria checked + INDEX.md entry.

### Phase 0 — Walking Skeleton (Risk Reduction)

Before committing to the full Phase A buildout, a thin vertical slice exercises the four highest-risk integrations end-to-end. The goal is **not** a product — it is to discover, within ~2–3 months, whether the architecture stack actually composes within the latency budget (~200 ms p50 finality on the Minimmit happy path with speculative execution, ~400 ms pessimistic floor).

**The slice:** a single BTC-collateralised inverse perp market (BTC deposited via TSS, USD-priced via oracle, PnL settled in BTC) running end-to-end on a 4-validator testnet, with everything stubbed except the four pieces no one has integrated before.

**The four pieces that must be real:**

1. **FROST TSS for Bitcoin Taproot deposits/withdrawals.** Bitcoin first, not Ethereum. FROST (`ZcashFoundation/frost`, RFC 9591) is the more mature cryptographic primitive — fewer rounds than DKLs23, no Paillier, audited and Zcash-deployed. Bitcoin has no smart-contract surface, so the bridge skeleton needs only a TSS-signed Taproot withdrawal transaction plus an L1-side UTXO watcher for deposit credit — that watcher pattern is reused later for Solana and Cosmos. BTC is also the highest-value asset to prove custody for; if the design works on Bitcoin (Taproot, UTXO model, ~10-minute confirmations on signet/regtest for the testnet) it works on every easier chain. DKLs23/Ethereum and FROST/Ed25519 come second, in Phase A.
2. **Threshold Simplex consensus driving reth via Engine API.** Single-proposer in Phase 0 — MCP is deferred to v1.1 per §5. Use Commonware's Threshold Simplex implementation as a versioned dependency (not a fork) to validate the integration shape; pay the cost of upstream churn rather than the cost of forking. The integration question: does Threshold Simplex's BLS-aggregated certificate plug into reth's `engine_newPayload` / `engine_forkchoiceUpdated` cleanly, or do we need a translation layer for `parentBeaconBlockRoot` / blob-sidecar fields reth expects? Find out in 4-validator testnet, not month-six of Phase A.
3. **FBA matching as a system contract on the EVM lane.** This is the integration nobody has done — does block-level FBA clearing compose with reth's Engine API + Block-STM? Build matching as a privileged precompile called from a system contract at tick boundary; measure solver runtime against tick budget (target p99 ≤ 20 % of tick). If solver-in-validator-native vs solver-in-VM-precompile turns out to matter at 4-validator scale, that finding is decision-forcing for §5.
4. **QMDB-backed reth.** Replace reth's MDBX state DB with QMDB via the state-DB trait. Validate that EVM execution semantics (hexary-trie semantics exposed to user contracts via standard RPCs) round-trip correctly through QMDB's twig storage. If the shim is awkward, the disk-cost / state-root format implications of an alternative (RocksDB + custom Merkle, reth-stock MDBX) become decision-forcing for §5.

**What gets stubbed:** scalar markets, cross-product margin, privacy tiers above Lit, RWA, liquidation (trivial fixed-threshold liquidator), insurance fund, fee distribution (single bucket), validator rewards math, builder codes, dark pool, MCP, ZK light-client bridge, listing modules, multi-strategy vault.

**Validator set:** four nodes split across the **two v1 launch regions** (2× US-East, 2× EU-West, or equivalent ~30 ms one-way pairs) — matches the production topology that the 200 ms target depends on, exposes realistic WAN latency on consensus rounds and TSS signing, small enough that DKG ceremonies are tractable. A parallel 4-jurisdiction soak (M1 topology) runs alongside to measure the latency cost of the M1 expansion *before* committing to it.

**Bench harness scaffold.** Stand up the reproducible benchmark harness (see Cross-Cutting Concerns below) at Phase 0 so the skeleton's numbers feed Phase A's CI regression gates from day one. Measures: p50/p95/p99 commit latency, tick-clearing latency, end-to-end submit-to-fill latency, throughput in orders/s and txs/s.

**Exit criteria (both must hold):** an EIP-712-signed order from mempool entry to finality + settled balance update measured at:
1. **< 300 ms p95** on the 4-validator 2-region skeleton with Minimmit + speculative execution enabled — proves the 200 ms p50 / 300 ms p99 production target is reachable with ~50 ms headroom.
2. **< 600 ms p95** on the 4-jurisdiction soak with Minimmit fallback to standard Simplex — proves the system degrades gracefully to the ~400 ms pessimistic floor rather than to halt.

Hit both, and the architecture stack is plausible — Phase A can be staffed with confidence to harden each component. Miss either, and the skeleton points to exactly which layer is over budget before a line of perps margin code is wasted. **Decision-forcing**: if the gap between (1) and (2) exceeds 2× consistently, the 2-region launch topology assumption needs revisiting.

**Tradeoff acknowledged:** Phase 0 delays user-facing product by ~2–3 months vs. starting Phase A directly. The alternative failure mode — building product on the assumption that Threshold Simplex + reth Engine API + FBA + QMDB compose cleanly, then discovering at month six that one doesn't — is much more expensive. Visible product progress traded for invisible architectural certainty, which is the right trade at this stage.

### Phase A — Core Infrastructure

Build the L1 foundation, hardening each component validated by Phase 0. Everything else depends on this.

- **Threshold Simplex + Minimmit consensus**: harden the Phase 0 single-proposer integration. Decide fork vs versioned-dependency on `commonwarexyz/monorepo` based on Phase 0 findings (currently leaning versioned-dep). Validator-set provider interface, BLS DKG with resharing, equivocation evidence path. **Minimmit fast-path enabled from v1 launch** (curated 30-validator set, n≥5f+1 satisfied by construction) with automatic fallback to standard Simplex when the 5f+1 quorum is unmet — see §2 Consensus latency budget.
- **Speculative execution integration**: wire reth to execute `engine_newPayload` on the proposal before the threshold-cert arrives; gate the QMDB root commit on finality; implement deterministic rollback for skipped views. Test under adversarial proposal-then-skip patterns. This is the third lever in the 200 ms target stack — without it, even Minimmit + 2-region tops out around 280–320 ms p50.
- **reth + Engine API integration**: harden the Phase 0 binary so that consensus drives reth via `engine_newPayloadV*` / `engine_forkchoiceUpdatedV*` / `engine_getPayloadV*` cleanly. Inject FBA matching results via system-contract precompile (chosen over custom system-tx and protocol-level state injection). Stock Foundry / Hardhat / wallets must work against the RPC unchanged. 24-hour soak test with no Engine API failures.
- **QMDB state backend**: harden the reth state-DB shim. Benchmark on synthetic perp workload — 1M orders/min, 80 % touching a single market state. Document state-root format for the ZK bridge prover team. Snapshot import from a 100 GB chain in < 10 min on consumer SSD.
- **Custom staking / slashing / governance modules** (greenfield Rust on Commonware primitives — no Cosmos x/staking inheritance). Worked end-to-end example with 30 validators, 100 delegators, full lifecycle including a slash event executed on testnet. Slash conditions formally specified (TLA+ for safety, executable test vectors). Covers consensus equivocation, consensus liveness, TSS protocol deviation, TSS liveness — see §4 Slashing table.
- **Block-STM with aggregator primitives**: integrate aggregator precompile + Solidity library. Benchmark 10k concurrent funding-accumulator writes for zero aborts. Compare against vanilla Block-STM hot-key abort rate as a regression baseline.
- **FBA matching engine**: harden the Phase 0 system contract supporting both perps and scalar prediction-market order types. Benchmark with cancel-heavy workloads (MMs cancel 10–100× more than they fill). p99 solver runtime ≤ 20 % of tick budget.
- **End-to-end benchmark**: target 100K+ orders/sec, **~200 ms p50 finality / ~300 ms p99** on the 2-region production topology, ~400 ms pessimistic-leader floor. Compare against Hyperliquid's 200K ops/sec and 70 ms blocks; frame the remaining ~130 ms gap as the structural-fairness premium (MEV-resistance + open validator set + cross-product margin).
- **MCP layer (post-launch v1.1)**: build single-proposer first, MCP layered in once Constellation (or equivalent) ships. Bandwidth budget < 50 Mbps per validator at projected throughput. End-to-end handshake with FBA documented and tested. **Rolling out MCP requires no consensus fork** — it sits underneath Threshold Simplex as block-assembly plumbing.
- **TSS bridge production hardening**: integrate `ZcashFoundation/frost` (with ROAST wrapper) for Schnorr / EdDSA chains and `silence-laboratories/dkls23` for ECDSA chains. Run native DKG ceremonies with 30+ test validators. Benchmark sign latency over WAN. Implement fresh-wallet rotation tooling (sweep generator, deposit-address rollover) modelled on tBTC v2.
- **Foreign-chain bridge contracts**: write and audit deposit/withdrawal contracts for Ethereum, all major EVM L2s, and Solana. Implement dispute window with finaliser kill-switch (Hyperliquid pattern). Native Bitcoin path needs no contract — only TSS-signed transactions plus an on-L1 deposit-detection oracle.
- **Succinct-style ZK light-client bridge to Ethereum**: prover circuit operating against QMDB commitment; bridge contract on Ethereum testnet; deposit → trade → withdraw cycle with proof verification. Force-withdraw mechanism documented and tested. Cost projection: < $X/tx at target volume, signed off by economics.
- **Formal-verification artifacts**: TLA+ for consensus safety (Threshold Simplex + Minimmit under our parameters), FBA no-intra-tick-MEV property. Risk-engine no-negative-equity spec deferred to Phase B with the risk engine itself. MCP censorship-resistance spec lands with the v1.1 rollout.

### Phase B — Product Mechanics

Build the trading products on top of the L1.

- **Perps engine**: margin calculation, funding rate computation, gradual liquidation, insurance fund management. Simulate with real Hyperliquid order flow data.
- **Scalar prediction market engine**: range settlement mechanics, event oracle integration, expiration handling, permissionless market deployment (stake-gated).
- **Unified margin system**: cross-product risk model, risk offsetting logic, excess margin release. This is novel — requires careful simulation and formal analysis.
- **Fee distribution module**: implement `x/distribution`-equivalent pipe (Rust-native, no Cosmos x/distribution inheritance) — every-block trading-fee accrual in USDC, validator commission deduction, delegator share allocation, claimable rewards. Wire liquidation penalties separately to insurance fund. Implement bonded-to-custodied deposit cap that throttles new bridge inflows when ratio falls below threshold.
- **Listing modules (HIP-1 / HIP-2 / HIP-3 equivalents)** per §3: three system contracts on the EVM lane — Dutch-auction token issuance (HIP-1), bootstrap-MM seeder (HIP-2), stake-bonded builder perps (HIP-3). Builder-code system folds into HIP-3 (capped share, on-chain registration).
- **Multi-strategy community vault** per §3: strategy interface (`deposit / withdraw / reportPnL`), three reference strategies (vol-targeted MM, basis arb, liquidation backstop), risk-isolation tested via simulated drawdown injection. ERC-4626 shares per strategy; vault-of-vaults wrapper for retail.
- **Risk-engine TLA+ spec**: no-negative-equity safety property, model-checked under our liquidation flow.
- **Tokenized ordering bolt-on** *(optional)*: only if any non-FBA paths remain (admin txs, governance executions, cross-chain message handlers); kill if FBA covers everything.
- **Resolve open design decisions** from §5: run simulations for scalar range parameters, funding-rate designs, cross-product risk model, FBA tick parameter, fee splits, TSS protocol selection. Use results to commit to specific approaches.

### Phase C — Privacy & ZK Stack

Layer the opt-in privacy tiers (per §2 Privacy Tiers) on top of the lit-by-default L1. Note: threshold-encrypted mempool was rejected for v1 in §2 (committee halt risk + sub-second latency incompatible). Phase C therefore leads with TEE dark pool, not encrypted mempool.

- **TEE-attested dark pool, Phase 1 — single-vendor, simple replication.** Intel TDX or AMD SEV-SNP enclave running the matching engine; remote attestation verified on-chain via Automata-style attestation contracts. Liquidity bootstrap via Renegade-style midpoint peg from a CEX oracle to sidestep the dark-pool depth-display problem. RFQ surface for designated MMs + intent/solver auction for block trades.
- **TEE-attested dark pool, Phase 2 — multi-vendor, threshold-decrypt fallback.** N enclaves (mixed Intel + AMD vendors) running the same engine, quorum-sign the matching result. Threat model includes TEE side-channel attacks; mitigation includes size limits per match, multi-vendor quorum, and a documented migration path to ZK + MPC at v2.
- **ZK position-privacy tier (Phase 2 → v2).** Pedersen commitments over positions + range proofs over margin ratios + liquidation levels. Client-side prove on commitment update; verification by user contracts and risk engine. Enables the Position-private privacy tier (§2).
- **Renegade-style ZK + MPC dark-pool migration (v2+).** Collaborative-PLONK matching, no enclave-vendor trust. Study Renegade's `mpc-jellyfish` and `mpc-bulletproof` codebases; extend to perps-specific constraints (margin enforcement under privacy, liquidation under privacy, funding under privacy). The hard part is *funding* — periodic forced state mutation is awkward under client-side ZK.
- **Threshold-encrypted mempool re-evaluation (v2).** Re-open if Shutter / Ferveo committee liveness reaches sub-100 ms. Per §5, the decision is to revisit, not to ship by default.

### Phase D — Ecosystem & Launch

Prepare for mainnet.

- **Oracle infrastructure**: Pyth + Chainlink + custom TWAP for asset prices. Design event resolution oracle for prediction markets (dispute mechanism is critical).
- **Cosmos integration** *(per §5 decision)*: ship a custom IBC translator, an LP-style bridge (LayerZero / Across pattern), or skip Cosmos integration in v1 entirely and revisit at v2 when Babylon BTC liquidity / restaking demand materialises. **MANTRA-specific bridge** for RWA token collateral and Noble USDC is the day-1 priority within whichever path is chosen.
- **TSS bridge production hardening**: full audits of FROST / DKLs23 integration code by Trail of Bits / Zellic / OtterSec — explicitly post-TSSHOCK-aware reviews. Live key rotation drills. Foreign-chain bridge contract audits, separate from TSS layer audits. Bug bounty top-up tied to custodied value.
- **ZK light-client bridge production hardening** (per §2): Succinct prover SLA + monitoring; on-chain bridge contract audits; force-withdraw drill on Ethereum testnet before mainnet.
- **Market maker onboarding**: API documentation, WebSocket feeds, FIX protocol connectivity. Target DWF, Wintermute, GSR, Flow Traders, Amber.
- **Compliance**: zk-KYC integration (Privado ID / Polygon ID), permissioned institutional pools.
- **RWA perps**: gold, equity index, FX, and treasury yield perpetuals using MANTRA RWA price feeds.
- **Audits**: 2+ top firms (Trail of Bits, OtterSec, Zellic). Bug bounty ($5M+). Formal verification of matching engine and consensus.

### Cross-Cutting Concerns

These run alongside the phased buildout, not after it.

**Security audit plan.**
- *Phase 1* — internal cross-review: every workstream lead reviews every other workstream's RFC at `accepted` status before code starts.
- *Phase 2* (pre-mainnet) — two parallel external audits: (i) consensus / cryptography (Trail of Bits or Sigma Prime); (ii) Solidity / economics (Spearbit, OpenZeppelin, or Halborn). Plus a separate, explicitly post-TSSHOCK-aware audit of the TSS layer (Zellic or OtterSec) and a separate audit of foreign-chain bridge contracts. Plus a dedicated audit of the FBA + system-contract surface (highest-value target).
- *Phase 3* (post-mainnet, ongoing) — bug bounty: Immunefi tier-1 for the bridge, tier-2 for system contracts. Bounty pool tied to custodied value.
- *UltraFast-specific scrutiny*: greenfield Rust staking module has no audit precedent — extra scrutiny. FBA + MCP composition is novel; TLA+ is part of the spec, not optional. The Threshold Simplex stake-weighting workaround (equal-weight consensus + separate stake-weighted slashing) needs a dedicated security-properties review.

**Performance benchmark harness** at `bench/`. Reproducible 30-validator devnet replaying a synthetic Hyperliquid-equivalent workload trace (open-source workload trace TBD; if none exists, synthesise from public Hyperliquid event data). Measures p50/p95/p99 commit latency, tick-clearing latency, end-to-end submit-to-fill latency, throughput in orders/s and txs/s. Runs in CI on every PR touching consensus / execution / FBA / system-contract workstreams. **Fails the PR on regression > 10 %.** Initial scaffold lands in Phase 0.

**Formal-verification umbrella.** TLA+ specs required for: consensus safety (Threshold Simplex + Minimmit), MCP censorship-resistance (lands with v1.1), FBA no-intra-tick-MEV, risk-engine no-negative-equity. Specs *composed* at the end of Phase A — prove the *composition* (consensus + FBA + risk; later + MCP) is liveness-trap-free, not just each component in isolation. Yi Huang's Block-STM TLA+ work is the in-house precedent. Apalache for the larger composed spec.

**Non-research execution tracks** (sequenced after Phase 0, run in parallel with Phases A–D, RFC-equivalent specs of their own):
- *Devops / validator ops* — validator binary distribution, monitoring, alerting, runbooks.
- *MM / institutional onboarding* — gRPC API, FIX-like adapter, colocation / latency-fairness policy.
- *Indexer / data API* — real-time orderbook reconstruction, fill history, PnL streams.
- *Wallet / SDK* — TypeScript / Rust SDK, EIP-712 signing flows, account-abstraction support.

---

## 7. Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Hyperliquid network effects** | High | Target underserved segments: institutions (dark pool, compliance), RWA traders, prediction market users. Don't compete on raw latency alone. |
| **Low initial liquidity** | High | Multi-MM strategy (DWF + Wintermute + GSR), aggressive maker rebates (−0.01 %), pre-deposit points campaign, HIP-2-equivalent native MM seeder. |
| **FBA tick perceived as "too slow" by HFT MMs** | Medium → High | 100 ms tick locked to consensus cadence is competitive with most CEXes; market the MEV story; HIP-2 native MM seeder bridges the bootstrap gap; consider parallel non-FBA lane for makers if MM feedback warrants it post-launch. |
| **2-region v1 topology criticised as "centralised"** | Medium | Explicit, time-boxed trade — the 200 ms p50 finality target requires it; M1 expands to ≥ 3 regions and ≥ 4 jurisdictions per §4 milestones. Document publicly at launch alongside the latency rationale. Alternative framing: Hyperliquid's ~70 ms finality also depends on validator clustering — we're making the same trade more transparently and with a published exit. |
| **Minimmit n≥5f+1 quorum unmet under Byzantine pressure** | Medium | Automatic fallback to standard Threshold Simplex (`n ≥ 3f+1`) — the chain doesn't halt, it degrades to the ~400 ms pessimistic floor. Bench harness includes adversarial scenarios that force the fallback path to verify graceful degradation, not collapse. |
| **Speculative-execution rollback diverges from finalised state** | Medium | Deterministic rollback contract: any state mutation produced under speculative execution is committed only when the threshold-cert lands; on view skip, the speculative state is discarded before the next proposal. TLA+ spec covers the speculative-commit / rollback invariant. User-facing "fill confirmed" UX waits for finality on the user's wallet by default, optimistic display opt-in. |
| **MCP layer not production-ready in v1.1 timeframe** | High | Ship single-proposer Threshold Simplex at launch; document residual selective-censorship risk transparently in audit & marketing. Track Solana Constellation / equivalent for adoption signals. The chain remains *useful* without MCP — just less differentiated on censorship-resistance. |
| **Threshold Simplex stake-weighting limitation breaks PoS economics** | High | Curated equal-weight 30-validator launch + separate stake-weighted accountability layer (§2 Consensus, §4 Slashing). Worked example with full slash event executed on testnet before mainnet. Independent cryptographic-properties review by external auditor. |
| **Single-proposer selective censorship until MCP ships** | Medium (v1) → resolved at v1.1 | Aggressive leader rotation (Threshold Simplex view changes), timeout-skip rules for orphaned proposals, retry-from-different-mempool-entrypoint UX in wallets. Document the gap publicly, fix structurally with MCP. |
| **ZK light-client bridge proving costs dominate** | Medium | Use Succinct's hosted prover initially; fee-revenue split caps cost exposure. Self-hosted prover only at v2 once volume justifies capex. ETH corridor only — other corridors stay TSS-only, so prover cost scales with one chain's traffic, not all. |
| **Cosmos-EVM bug class repeats in any other gas-refund-using EVM** | Medium → Low | Use stock reth via Engine API; no bespoke EVM precompiles for state mutation; precompiles read-only or aggregator-typed. The Cosmos-EVM advisory class (GHSA-mjfq-3qr2-6g84 etc.) cannot recur on a non-Cosmos-SDK substrate using stock reth. |
| **TEE dark-pool side-channel exploit** | Medium | Multi-vendor TEE attestation (Intel TDX + AMD SEV-SNP); per-match size limits in v1.5; documented ZK + MPC migration path at v2. Threat model includes operator collusion. |
| **Prediction market oracle disputes** | Medium | Optimistic oracle with economic bond + escalation path. Study UMA's track record. Design for subjective events from day one. |
| **Scalar market edge cases** | Medium | Conservative initial leverage limits (3–5×). Circuit breakers when price approaches range boundaries. Gradual increase as system proves stable. |
| **Greenfield Rust complexity (staking + slashing + governance + listings)** | High | Build on Commonware primitives (Rust-native, audited components); reth via Engine API for execution (no custom EVM); aggressive use of TLA+ for the parts that have no production precedent (staking module, FBA + MCP composition). Hire from Aptos / Monad / Sui / Commonware talent pools. |
| **Regulatory scrutiny** | Medium | VARA license via MANTRA, zk-KYC compliance layer, post-trade transparency (all settlements on-chain). Engage crypto-native legal counsel early. Foundation in jurisdiction with crypto clarity; no US persons in v1; legal opinion before token launch. |
| **Hyperliquid v2 ships same MEV defences** | Medium | Move fast; differentiate on credibly-decentralised validator set and prediction-market + RWA + MANTRA-ecosystem reach they cannot replicate. |
| **Defx competition** | Medium | Defx ($2.5M seed, Pantera-backed) is the most direct competitor building a private perps L1. Move fast, differentiate on prediction markets + RWA + MANTRA ecosystem. |
| **Pod.network latency leadership** | Low | Pod's leaderless / partial-order model is interesting but production-immature; we compete with it rather than build on it (per architecture decision). Track for v2 reassessment. |
| **TSS implementation bug (TSSHOCK-class)** | Critical | Use only post-TSSHOCK audited libraries (`ZcashFoundation/frost`, `silence-laboratories/dkls23`, `LFDT-Lockness/cggmp21`). Never fork or modify. Independent cryptographic audits before mainnet. Compare to: Multichain ($1.5B+ exposure from `tss-lib` derivatives). |
| **Foreign-chain bridge contract bug** | Critical | Audited separately from TSS layer (Trail of Bits / Zellic / OtterSec). Withdrawal dispute window + finaliser kill-switch. Compare to: Nomad ($190M from initialisation bug). |
| **Validator collusion against bridge** | High | Bonded UFAST stake ≥ 2× total custodied value, enforced by on-chain deposit cap. THORChain's "Incentive Pendulum" reference. Square-root-of-stake voting weight in TSS to limit concentration attacks. ZK light-client bridge for ETH corridor adds cryptographic complement on highest-value path. |
| **Stale TSS wallet drainage during epoch rollover** | Medium | Bounded sweep window with on-chain monitoring; old wallets retain full TSS security until empty; fresh-wallet model keeps per-wallet exposure capped (tBTC v2 reference). |
| **Cross-chain deposit re-org** | Medium | Per-chain confirmation depth tuned to economic finality (e.g., 6 blocks BTC, 32 epochs ETH, ~32 slots SOL). Deposits below threshold don't credit balances on UltraFast. |
| **Validator stake concentration** | Medium | 5 % commission floor (dYdX pattern); square-root-of-stake voting weight in TSS; transparent dashboards; consider stake caps if top-N concentration exceeds threshold. Compare to: Injective top-10 holding ~58 %. |
| **Hot-key contention without typed-effect primitives** | Medium → Low (mitigated by §2 Aggregator subsection) | Block-STM degrades toward sequential under hot-key contention; aggregator primitives recover commutative semantics for fees / funding / vault share supply / insurance fund. Phase A benchmark gates on 10k concurrent writes / zero aborts. |
| **Buyback / inflation reflexivity** | Low (avoided by design) | USDC-denominated real yield breaks the volume↔token-price↔security feedback loop. Buybacks can be added later by governance; reverse path is much harder. |
