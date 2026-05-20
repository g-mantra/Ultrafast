# Architectural Proposal: A Hyperliquid-Competitor Perp DEX Chain

*Working name: **Ultrafast** (placeholder, per `g-mantra/Ultrafast`)*
*Author basis: Yi Huang + G (Mantra), May 2026*
*Status: design proposal, pre-funding decision*

---

## 0. Executive Summary

Hyperliquid is currently extracting ~70%+ of on-chain perp volume (~$800B March 2026) on a 21-validator HotStuff-derivative L1 with a non-EVM CLOB module and a bolted-on EVM. They are dominant but **technically exposed** in five places — thin validator decentralization, transparent mempool, no protocol-level fair ordering, an asymmetric dual-VM seam, and foundation-mediated governance. A new chain wins by attacking those weaknesses *together*, not by trying to out-latency Hyperliquid on its own design axis.

This document proposes an architecture, surveys the design space (consensus, MEV, execution, settlement) with concrete tradeoffs, and ends with a recommended stack and a 12-18 month delivery plan.

**Recommended stack (TL;DR):**
- **Chain shape:** **Greenfield Rust L1.** No Cosmos SDK, no Tendermint legacy. Architecture is Commonware-style consensus binary driving reth via Engine API — same shape Tempo and Monad converged on.
- **Consensus:** Threshold Simplex + Minimmit fast path on top of QMDB storage, built from the Commonware monorepo.
- **MEV defense:** in-protocol frequent batch auctions (FBA) at a 100-250 ms tick + multi-concurrent-proposer (MCP) data-availability layer.
- **Execution:** stock EVM via reth (Engine API). Typed-effects aggregator primitives (Aptos-style) so the matching engine and funding accumulator don't degrade Block-STM. Optional second VM only after launch.
- **Settlement / bridging:** Sovereign L1 with a Succinct-style ZK light-client bridge to Ethereum. (No IBC Eureka — that path is closed because we're not on Cosmos SDK; reach Cosmos chains via a custom relayer or skip the integration entirely.)
- **Privacy lane:** opt-in TEE-attested dark-pool matching for institutional flow, bolted on after the lit book has product-market fit.

The core differentiator is "**MEV-resistant by construction, not by promise**" — every Hyperliquid weakness becomes a marketing line backed by a protocol property.

---

## 1. Problem & Opportunity

### 1.1 What we are competing against

**Hyperliquid in concrete numbers:** HyperBFT (HotStuff variant, pipelined 3-chain), 21 active validators, ~70 ms healthy-network finality, dual-VM design. HyperCore is a non-EVM CLOB module — order placement is signed actions, not gas-paying transactions. HyperEVM runs alongside on the same consensus, with two interleaved block types: small (~1 s, 2M gas, 1 gwei base) and big (~60 s, 30M gas, 0.5 gwei). EVM contracts read HyperCore state via precompiles at block boundaries and submit actions via the `CoreWriter` system contract at `0x3333…3333`. 100% of HyperEVM gas and HyperCore spot fees burn HYPE.

Marketing claim: 200,000 orders/sec, scalable >1M TPS. **Measured:** no public real-time TPS feed; median action latency ~200 ms, p99 ~900 ms. Treat the 200k as a benchmark ceiling.

### 1.2 Direct competitors (2025-2026)

| Project | Architecture | Volume signal |
|---|---|---|
| **dYdX v4** | Cosmos SDK app-chain, ~60 validators, off-chain in-memory orderbook gossipped between validators, on-chain settlement | ~$300-400M TVL, ~$250M daily perp volume |
| **Lighter** | App-specific ZK rollup on Ethereum; matching/funding/risk all encoded as ZK circuits; centralized sequencer | ~$232B 30-day volume pre-TGE |
| **Aster** | Multi-chain CLOB now; **own Aster Chain L1** Q1 2026: claimed 50ms blocks, 100k TPS, ZK stealth addressing, encrypted orders by default | ~$185B 30-day pre-TGE |
| **Paradex** | Starknet appchain (validity rollup), off-chain matching, ZK-verified settlement, ZK position privacy | ~$250B cumulative since Feb 2024 |
| **Vertex Edge** | Rust off-chain sequencer mirrors maker liquidity across instances on multiple chains | Smaller; cross-chain UX play |
| **Drift (Solana)** | Hybrid on-chain DLOB + JIT Dutch auctions + vAMM backstop; ~400 ms slot | $285M exploit April 2026 — instructive |
| **Pod.network** | "Generalized consensus" partially-ordered ledger, leaderless, designed *for perps* | Live, early; the most architecturally aggressive competitor |

### 1.3 The technical openings

The dimensions that decide flow, ranked:
1. **End-to-end book latency** — submit → ack → fill. Hyperliquid's ~200 ms median is the bar.
2. **Fill quality / queue fairness** — deterministic price-time priority, no proposer reordering, no quote leak.
3. **Listing speed and breadth** — HIP-1/2/3 made permissionless listing a moat. Anything slower than "mint and trade in one tx" is regression.
4. **EVM composability with the book** — synchronous, atomic reads of book state from contracts. Cross-VM async messaging (LayerZero-style) is strictly worse.
5. **Vault/HLP economics** — HLP's $500M+ Sharpe-2.89 narrative is the flywheel.
6. **Market-maker tooling** — gRPC/WS APIs, post-only/IOC/reduce-only, sub-account margining, predictable fee tiers.
7. **Oracle latency** — sub-3 s funding inputs.

**Where Hyperliquid is exposed:**
- Validator decentralization is thin (21, geographically concentrated, single closed-source binary historically).
- No mempool privacy — orders visible to validators pre-inclusion. Aster, Paradex, Lighter all attack this.
- No protocol-level fair ordering — MEV defense rests on validator honesty, not protocol property.
- HyperEVM is bolted on (async-ish bridge, two block types, gas in HYPE constrains stablecoin-native UX).
- Foundation-mediated governance (HIP listings, fee-burn rates, validator admission).
- No native private/iceberg orders for institutional flow.

The proposal targets **(a) credibly decentralized validator set with protocol-level fair ordering**, **(b) native private orders as a first-class primitive**, and **(c) a single-VM design where the CLOB is just code** — eliminating the HyperCore/HyperEVM seam.

---

## 2. Decision Framework — Four Questions

Every architectural choice in §3-§6 collapses into four questions:

1. **L1 sovereign vs L2 vs validium vs encrypted L2?** (§6)
2. **Which BFT consensus?** (§3)
3. **Which MEV-defense layer(s)?** (§4)
4. **Which execution model + parallelism strategy?** (§5)

Each section below presents the candidates with concrete tradeoffs, then §7 picks one combination.

### 2.1 Two foundational decisions taken upfront

**Decision A — Greenfield Rust L1, not Cosmos SDK.** The chain binary is custom Rust on Commonware primitives, driving reth via Engine API. This is the shape Tempo (Stripe/Paradigm) and Monad converged on. Rationale:
- **Avoids the Cosmos-EVM bug class** (gas-refund / precompile-atomicity / ante-handler interaction — see §5.2). Several incidents in 2025-26 (GHSA-mjfq-3qr2-6g84 etc.) make this an unacceptable substrate for leveraged perp positions.
- **Native ergonomics.** Commonware is a Rust-native consensus library; reth is the highest-throughput Ethereum execution client; both are Rust. Cosmos SDK forces Go + Tendermint legacy + the entire SDK module surface (most of which we'd disable anyway).
- **No CometBFT operational legacy.** We don't inherit the issue-5801-class catch-up vulnerabilities or the Tendermint mempool model; FBA + MCP designs cleaner without working around CometBFT's `ProcessProposal` lifecycle.
- **Tradeoffs we accept:** we build staking, slashing, governance, and listings as custom Rust modules. We lose IBC Eureka day-1 bridging to Cosmos chains (Babylon, Injective, restaking). We lose the Cosmos validator-ops ecosystem and have to bootstrap our own. Given the perp-DEX market is on Ethereum + Solana + L2s — not Cosmos — these are acceptable losses.

**Decision B — Ignore pod.network as a build-on or partner.** Pod's leaderless / partial-order model is genuinely interesting and they target perp futures explicitly, but: (a) production maturity is too early to bet on, (b) partial-order semantics force a redesign of every CLOB-adjacent contract, (c) they are a competitor not an infrastructure provider. We compete with them rather than build on them. We retain typed-effects / aggregator parallelism patterns (see §5.3) — these are a general technique (Aptos shipped them in production) and not pod-specific.

---

## 3. Consensus Layer

### 3.1 Candidates

**Sei Autobahn** — Cosmos consensus that decouples data availability from ordering: validators continuously disseminate transactions in independent **lanes**, leader takes "tip cuts" of the latest certified tips. ~1.5 round-trips to commit vs ~3 for Tendermint; targeted sub-400 ms finality, claimed 50× CometBFT throughput. Devnet 2025 → progressive 2026 mainnet. No public audits surfaced.

**Streamlet (Chan & Shi 2020)** — minimal classroom BFT. Useful as the structural ancestor of Simplex. Pessimistic latency ~2880 ms in the Simplex benchmark — equivalent to HotStuff. Not a production candidate.

**Simplex (Chan & Pass, TCC 2023)** — SOTA refinement of Streamlet. Matches PBFT-style stable-leader latency while keeping Streamlet's simplicity. Under pessimistic conditions (1/3 faulty leaders, 80 ms delay): **Simplex 400 ms vs HotStuff 2480 ms vs Streamlet 2880 ms**. O(n²) basic, reduces to O(n) with threshold sigs. Production implementations in Commonware (Rust), Ava Labs (Go), Tempo (Stripe/Paradigm). Solana's Alpenglow Votor is a Simplex derivative.

**Commonware monorepo** — Rust toolkit bundling Simplex, Threshold Simplex, Minimmit, QMDB, p2p, runtime. **Threshold Simplex** key property: validators run a one-time DKG to produce a shared BLS12-381 threshold secret; every consensus message is a partial signature; once 2f+1 partials arrive, a single ~240-byte threshold-signature certificate is produced per view, verifiable against a static public key surviving validator-set reconfiguration via resharing.

**The stake-weighting concern** (Yi Huang flagged): Commonware's threshold aggregation treats validators as **equal-weight participants** — `2f+1 of 3f+1` is a count, not a stake quorum. PoS workarounds:
- **Virtual-share / weighted DKG** (Das et al. CCS'23, Garg et al. S&P'24) — issue secret shares proportional to stake. Heavier DKG.
- **Validator-set normalization** — admit only the top-N stakers; bucket stake into equal-weight virtual validators (Aptos pattern).
- **Equal-weight consensus + stake-weighted accountability** — slash via a separate stake-weighted layer. Lowest friction, fits a curated 30-100 validator set.

**Minimmit** — Commonware's "faster finalization under stronger assumptions." Requires `n ≥ 5f+1` (i.e. **<20% Byzantine**, vs <33% Simplex). Honest leaders finalize **after a single round** of voting on the happy path. Best happy-path latency on this list.

**Pod-style consensus** (pod.network, Pi-Squared / FastSet) — leaderless, no global order, validators don't communicate, correctness via CRDTs / past-perfect snapshots. Sub-150 ms latency claimed. **Excluded from our candidate set per §2.1 Decision B** — we treat pod as a competitor not a foundation. Listed only as a reference frame for what "absolute lowest latency" looks like in 2026.

**HotStuff family baseline (reference frame):**
- Tendermint/CometBFT: ~2.5 s pessimistic latency, single rotating proposer is bandwidth bottleneck.
- HotStuff: linear view-change, ~2.5 s, powers Aptos.
- Bullshark/Narwhal-Tusk: DAG mempool + total-order consensus, 1-2 s commit, used by Sui.

**QMDB (Quick Merkle Database)** — LayerZero Labs storage layer (Jan 2025), unifies KV + Merkle tree as append-only log of immutable subtrees ("twigs"). **One SSD read per state access, O(1) IOs for updates, in-memory Merkleization at ~2.3 bytes/entry.** Removes the I/O wall a Patricia trie + RocksDB chain hits at 200k TPS. Free win regardless of consensus choice.

### 3.2 Comparison

| Protocol | p50 commit | Fault tolerance | Maturity | Perp-DEX fit | Impl. cost |
|---|---|---|---|---|---|
| CometBFT | ~2.5 s | f<n/3, partial sync | 5/5 | 4 — too slow | 1 |
| HotStuff | ~2.5 s | f<n/3 | 5/5 | 4 | 2 |
| Bullshark/Narwhal | ~1-2 s | f<n/3 | 4/5 | 3 | 4 |
| Sei Autobahn | ~400 ms | f<n/3 | 2/5 | 2 | 3 |
| Streamlet | ~2.9 s | f<n/3 | 1/5 | 5 | 5 |
| **Simplex (Threshold)** | **~400 ms** | f<n/3 | 3/5 | **1** | 2 |
| **Minimmit** | **~2δ-3δ (1-round)** | f<n/5 | 2/5 | **1** (curated set) | 2 |
| Pod-style (reference) | <150 ms | f<n/3, no global order | 2/5 | excluded — competitor | n/a |

### 3.3 Two coherent paths (post §2.1 decisions)

1. **Lowest-risk, fastest TTM:** Fork Sei Giga consensus (Autobahn) and graft onto our greenfield binary. Inherit their roadmap; pay the cost of being one step behind their releases.
2. **Best engineered ceiling — RECOMMENDED:** Commonware Threshold Simplex + Minimmit fast path + QMDB, all Rust, all under our control. ~400 ms baseline, sub-second happy path. Cost: solve stake-weighting (curated bonded set + custom stake-weighted slashing module — see §3.4).

**Streamlet:** teaching protocol. **CometBFT/HotStuff:** what *not* to ship in 2026 for this product. **Pod-style:** excluded per §2.1.

---

## 4. MEV-Resistance Layer

### 4.1 Important correction to the chat thesis

The chat author claimed arxiv 2509.23984 argues "perfect MEV mitigation requires MCP." That overstates what the paper proves. **Actual claim:** any application-layer MEV-mitigation that runs an *auction* (intent solvers, OFAs, RFQ, encrypted mempools, threshold-decrypted batch auctions) requires the underlying consensus to provide **(a) selective-censorship resistance** and **(b) hiding** — both of which a single proposer trivially fails. MCP is the *consensus-layer prerequisite* for any application-layer MEV defense, not a complete defense itself. Follow-up arxiv:2511.13080 confirms MCP eliminates ordering-based MEV (sandwich, classic front-run, hard censorship) but leaves residual MEV in: PBS-layer extraction, *temporal* MEV (proposal→execution gap), and *cross-domain* MEV.

So MCP is *necessary plumbing* underneath whatever MEV-defense we build on top.

### 4.2 Candidate mechanisms

**Multiple Concurrent Proposers (MCP) — Solana Constellation pattern.** ~16 stake-weighted Proposers accept txs in 50 ms cycles, assemble *pslices*, erasure-code into 256 *pshreds* (one per Attester). 256 Attesters sign attestations. Leader is **forced** to include any pslice that crossed 40% attester support; block valid only if total attestation ≥60%. Censoring an attested pslice produces a structurally invalid block — enforcement is architectural, not slashing-based. **What it solves:** hard selective censorship. **What it doesn't:** content visibility (proposers and leader still see plaintext post-deadline; redundant submission widens exposure), timing/late-message attacks. Whitepaper stage; depends on Alpenglow shipping first.

**Tokenized transaction ordering (Masquerade, ACM 10.1145/3730410).** User pre-purchases an "ordering token" with strictly increasing serial number. Tokenized txs ordered by token number, ahead of un-tokenized in same block. Tokens single-use. Yi Huang's correction is correct and load-bearing: because numbers issue *strictly increasing*, an attacker observing a victim's tokenized tx in flight cannot acquire a *smaller* token to front-run — every fresh token issued after observation orders behind. **Prevents:** front-running (deterministic ordering), most sandwich attacks. **Doesn't prevent:** oracle MEV / liquidations (attacker stockpiles small tokens), back-running un-tokenized txs, builder-level censorship of token claim, corruptible issuer. **Cost:** ~2 on-chain interactions per protected tx, ~1 extra signature, modest gas. **Status:** research, no production.

**EIP-8184 (LUCID encrypted mempool, commit/reveal).** Two-slot. Slot N: builders include ST-commitments (hashes of ciphertext + key + plaintext + sender ticket). Slot N+1: key publishers release `k_dem`; decrypted txs execute at top-of-block in pre-committed order. Non-revealing forfeits 1/8 of `tob_fee`. **Cost:** +1 slot latency (~12 s on Ethereum, materially worse on a perp chain). **Stops:** targeted front-running, sandwich, builder reorder. **Doesn't:** speculative front-running (attacker commits decoys). **Status:** Draft.

**EIP-8209 (commit-reveal frames).** Built on Frame Transactions (EIP-8141), deliberately simpler than 8184. Block N-1: COMMIT frame with `keccak256(payload)`, reserves 1M gas. Block N: REVEAL must appear at block start, executes against reserved gas; multiple reveals randomized by RANDAO. **Same threat model as 8184** (targeted front-run, sandwich), **same guarantees** for those. **Weaker:** speculative front-running, user-must-be-online to reveal. **Why simpler:** no enshrined cryptography, no new consensus participant roles. **Status:** Draft.

**Frequent batch auctions (FBA) — CowSwap, Penumbra ZSwap.** Collect intents over a batch interval, solvers compete to clear at uniform clearing price per pair; reordering within batch irrelevant by construction. Penumbra does this in-protocol every block (~5 s). **Eliminates:** intra-batch sandwich and ordering MEV. **Doesn't:** oracle MEV, cross-batch front-running by solver if it sees plaintext. **Perp relevance:** maps cleanly onto a periodic-settlement perp at 100-500 ms tick.

**Threshold encryption / encrypted mempool — Shutter, Ferveo.** Users encrypt to Keyper public key; ciphertexts sequenced; committee publishes decryption shares only after inclusion. **Live on Gnosis Chain mainnet** as alternative RPC; on Optimism testnet. Trust: t-of-n permissioned committee, *not* validator set. **Liveness:** if >n-t go offline, encrypted txs halt or drop. Real-world tx-to-inclusion ~3 minutes today on Gnosis — **disqualifying for sub-second perp** without a redesigned committee.

**Dark-pool architectures.** TEE (microsecond latency, Intel/AMD/AWS trust, side-channel risk — Aster's design), ZK + MPC (Renegade — strongest privacy, heaviest proving), threshold encryption. **Liquidity bootstrap is the structural problem** — privatizing flow kills the public-fills marketing flywheel.

### 4.3 Decision table (sub-second tick target)

| Mechanism | MEV class covered | Added latency | Trust | Liveness risk | Impl. complexity | Maturity | Fit |
|---|---|---|---|---|---|---|---|
| **In-protocol FBA** | sandwich, front-run, time-boost | = batch tick (100-250 ms) | none beyond consensus | none | medium | Penumbra prod, CoW prod | **Excellent** |
| **MCP (Constellation-style)** | hard censorship, ordering | +1 RTT (~50 ms) | f<n/3 proposers | low (PBFT) | high | research/spec | **Strong, complementary** |
| **EIP-8209 commit/reveal** | targeted front-run, sandwich | +1 block (≥ tick) | none | self-reveal | low | draft | **Marginal** — doubles latency |
| **EIP-8184 LUCID** | as 8209 + hidden sender | +1 slot, ToB-only | key publishers | committee halt | high | draft | **Poor** for sub-s |
| **Tokenized ordering** | front-run, opportunistic sandwich | ~0 (extra tx, async) | issuer contract | none | low-medium | research | **Good as bolt-on** |
| **Threshold mempool (Shutter/Ferveo)** | front-run, sandwich, content-leak | ~0 theory; minutes prod | t-of-n keypers | committee halt | high | Gnosis prod, slow | **Risky** |
| **Dark pool (TEE)** | all order-book MEV | sub-ms | enclave vendor | low | medium | live | **Excellent if TEE acceptable** |
| **Dark pool (ZK/MPC, Renegade)** | all order-book MEV + privacy | tens-hundreds ms | none | low | very high | live | **Strong if proving fits tick** |

### 4.4 Recommended combination

For a Hyperliquid-competitor with sub-second matching and a credible MEV differentiator:

1. **In-protocol FBA at the matching tick (100-250 ms)** — provably eliminates intra-tick ordering MEV, clean UX since perp settlement is naturally periodic.
2. **MCP-style multi-proposer block production** underneath — kills selective censorship of FBA commits, provides the prerequisite consensus properties.
3. **TEE-attested matching engine in opt-in dark-pool lane** for institutional flow — handles privacy/quote-fade for size, doesn't burden retail.
4. **Reject** EIP-8184/8209 (latency-incompatible). **Defer** Shutter-style until committee liveness reaches sub-100 ms.
5. **Tokenized ordering** as a cheap bolt-on for un-batched admin/governance txs.

---

## 5. Execution Layer + Parallelism

### 5.1 The hot-key problem

Every perp DEX execution-layer choice collapses into one constraint: **hot-key contention on the orderbook**. A single hot pair (BTC-PERP) is exactly the worst case for optimistic concurrency — every order touches the same book root, the same oracle price, the same funding accumulator. Honest designs must either (a) avoid the hot key, (b) clear it in a single semantically-batched step, or (c) tolerate massive abort rates from optimistic concurrency.

### 5.2 Candidate VMs

**EVM via Engine API + reth/geth.** Drive a stock execution client as a black-box EL via `engine_newPayload` / `engine_forkchoiceUpdated` / `engine_getPayload`. Get Foundry, Etherscan, every wallet for free. Swap consensus freely. Inherit Ethereum's hard-fork cadence on EL side. **Trade:** Engine API assumes Ethereum's block format; injecting batch-auction settlement events means extending the API or post-processing in a custom precompile.

**EVM + revmc JIT.** Paradigm's LLVM-lowered EVM (June 2024, v0.1.0). Up to **6.9× speedup on compute-heavy** workloads; near-zero gain on state-heavy — a "two-speed EVM" where compute becomes free and state IO becomes the new ceiling. BNB Chain has explored integration. Doesn't fix the orderbook contention problem (state-IO bound).

**Cosmos EVM (excluded — cautionary reference).** Per §2.1 Decision A we are not building on Cosmos SDK, so Cosmos EVM is not a candidate. Listed here because it informed the decision: GHSA-mjfq-3qr2-6g84 (May 2025, CVSS 8.3) — precompile `Run` methods not atomic, deferred `HandleGasError` failed to revert StateDB on out-of-gas, allowing partial state writes (claiming distribution rewards without zeroing the claimable balance). Same vulnerability class — gas/refund interaction with ante handler and precompiles — that plagued Evmos. As of 2025-2026, Cosmos Labs explicitly says they will *not* tag stable v1 until audit + benchmarking complete. The Mantra ADR catalogues these concerns. This bug class is the single strongest argument for the greenfield path.

**Arbitrum Stylus (WASM alongside EVM).** Production on Arbitrum One since 2024, Trail of Bits audit. **10-100× faster on compute-heavy micro-benchmarks** (hashing, bigint), ~30%+ gas savings on production oracle workloads. Lessons: (a) shared *state model* is the hard part; (b) cross-VM calls work but need ABI bridging; (c) the fraud-prover forces WASM as canonical bytecode — for our chain with own consensus (no fraud-proof needed), this constraint goes away.

**RISC-V (Vitalik direction).** Speculative for 2026. Vyper Venom IR (SSA-form, LLVM-inspired) is the most plausible near-term route — Venom is already the IR, and a register-machine backend (RISC-V) added to an SSA IR is mechanical. But no production chains, no audit corpus, very high build cost. Hedge against EVM lock-in, not a 2026 production option.

**Custom commutative VM (Groundhog-style).** Stanford SCS Lab's Groundhog (arxiv 2404.03201) — transactions inside a block are *unordered*. Runtime exposes a small set of *commutative* primitives (counters, set unions, side-effect lists). >500k payment-style TPS on 96 cores, throughput essentially independent of address-set size. Adopting Groundhog requires a *non-EVM* VM because the EVM has no semantic handle on "this op is an Incr" — it sees `SLOAD; ADD; SSTORE` and must treat any read-modify-write as a conflict. To get Groundhog's parallelism guarantees the VM must *type* side-effects (counter, set, balance, reserve) at instruction or syscall level — closer to Move/Sui-objects than Solidity. Highest build cost, highest audit risk; no production deployments.

### 5.3 Parallelism strategies

**Block-STM** (Aptos). Deterministic optimistic concurrency. Speculative parallel execution; conflicts → abort and re-execute with estimated write-sets. ~160k TPS Aptos benchmarks low-conflict, ~80k high-conflict. **2× hot-key tax.** Production on Aptos, Sui, and via go-block-stm for Cosmos SDK. Battle-tested but degenerates toward sequential for a CLOB with one hot pair.

**Block-STM + aggregators (Aptos-style).** Aptos's [Aggregators](https://medium.com/aptoslabs/aggregators-how-sequential-workloads-are-executed-in-parallel-on-the-aptos-blockchain-e7992c70cefb) ship typed primitives that let the runtime know an op is commutative — lifts storage from `get/set` to `Incr(key, delta)`, so two `Incr` ops on the same key don't trigger a Block-STM abort. (Pod ships an analogous Solidity SDK with `OwnedCounter` / `SharedCounter` / `Balance`; we cite Aptos because it's the production reference and we're not building on pod per §2.1.) Helps for funding/fees/balances. **Doesn't help the matching engine itself** — a CLOB isn't a CRDT.

**Sharded state (one shard per market).** Linear scaling for cross-shard-light workloads. One BTC-PERP shard still a bottleneck. Composability across markets degrades.

**Speedex batch auctions** (SCS Lab, same authors as Groundhog). Each block is a batch auction; clearing prices per asset computed via Tâtonnement against a linear Arrow-Debreu market. >100k TPS at 32 cores even with 70M open offers; throughput drops only ~10% from zero to tens of millions. **Eliminates the hot key by definition** — one price per asset per block. Trades CLOB UX for parallelism + MEV-resistance. Best fit as settlement layer underneath an off-chain matching engine, or default-pool-of-liquidity for long-tail assets where a CLOB doesn't pay.

### 5.4 EIP-7990 RUNCODE

Proposed opcode executes arbitrary bytecode from memory in current execution context — like `DELEGATECALL` but code from memory. **Use case for this chain:** strategy composition (pyDeFi-style) — submit a tx whose payload *is* a sequence of bytecodes describing "open perp, hedge with options, post collateral" without deploying a one-shot contract. Saves 32k+ gas of `CREATE` plus 2.6k cold-`CALL` per leg. Magicians-stage; track but not a 2026 dependency.

### 5.5 Decision tables

**VM choice:**
| VM | Latency | Parallelism ceiling | Ecosystem | Audit risk | Build cost |
|---|---|---|---|---|---|
| EVM (reth via Engine API) | Medium | Block-STM ~80-160k | **Maximal** | **Lowest** | **Low** |
| EVM (revmc JIT) | Low compute, medium state | Same | EVM ecosystem | Medium | Medium |
| EVM (Cosmos-EVM) | Medium | SDK Block-STM | Cosmos+EVM | **High** (recurring bugs) | Low if you accept risk |
| WASM (Stylus-style) | Low (10-100× compute) | Same as EVM | Rust/C++ growing | Medium | High |
| RISC-V | Low | High (speculative) | None | High | Very high |
| Custom commutative (Groundhog) | Low | **Linear in cores** | None | Highest | Very high |

**Parallelism strategy:**
| Strategy | Performance | Complexity | Fit for hot-key contention |
|---|---|---|---|
| Block-STM (vanilla) | ~160k low / ~80k high | Low | **Poor** |
| Block-STM + aggregators/CRDTs | Recovers low-conflict on commutative ops | Medium (typed primitives) | Helps adjacent state (fees/funding/balances), not matching |
| Sharded state | Linear in shards | High | Good per-market, one BTC-PERP shard still bottleneck |
| Coordination-free CRDTs | Effectively unbounded for CRDT-expressible ops | Medium | **N/A for matching** |
| **Speedex batch auctions** | >100k TPS at 32 cores, flat under contention | High (Tâtonnement in consensus path) | **Excellent** — eliminates hot key by definition |

### 5.6 Recommendation

- **VM:** EVM via Engine API + reth. Lowest audit risk, maximum ecosystem capture. Add revmc later if compute-heavy precompiles materialize.
- **Parallelism:** Block-STM with aggregator primitives for fees/funding/balances. The matching engine itself runs as a single-threaded module per market (the FBA tick collapses what would have been hot-key contention into a single batched solve).
- **Reject Cosmos-EVM** for production — recurring gas-refund/precompile-atomicity bugs and pre-stable status make it the wrong bet for a chain handling leveraged perp positions.
- **Defer Stylus / RISC-V / custom commutative VM** to post-launch — too much greenfield risk.

---

## 6. Settlement, Bridging, and L1-vs-L2

### 6.1 Tempo zones (privacy anchors, payments-first)

Tempo (Stripe/Paradigm, mainnet 18 Mar 2026) is a payments L1 with sub-500 ms blocks. **Zones** are private blockchains anchored to Tempo: ~250 ms cadence, batched withdrawals back to L1, account-authenticated RPCs. Operators see full state for compliance; users see only confidential balances. **Not a true state channel** — operators are trusted intermediaries with anchored settlement. If applied to orderbooks, zone operators become a trusted intermediary — exactly what a "more decentralized than CEX" perp DEX should avoid.

### 6.2 Lightning-session draft (paymentauth.org)

Three-phase HTTP intent (open / streaming / close): client funds deposit invoice, gets bearer token, server debits per request, refunds on close. **Honest critique:** great for *fee metering*, weak for *position custody*. Margin in a perp is not the same as a prepaid usage credit — must remain seizable on liquidation by an adversarial counterparty, not just decrement under server discretion.

### 6.3 State channel for an orderbook

**Yi Huang's analysis is correct.** A state channel for an orderbook with N reputable operators is "not much different than BFT consensus with a light-client bridge — finality is similar." At the same N with the same operator set, both require ≥⅔ of N signers to advance state, both have a single dispute window, both rely on a light-client bridge for L1 enforcement. Where channels actually win: bilateral hot paths (maker-vs-one-taker, no global book) and long-tail markets where chain overhead dominates volume. **For a global CLOB perp DEX, a state channel network is a BFT chain in costume.** Use channels only for bilateral payment rails, not orderbooks.

### 6.4 ZK-orderbook L2 / validium

Trusted operator runs matching engine off-chain, posts state diffs + STARK/SNARK validity proof to L1 every batch. Rollup mode publishes diffs as calldata; validium keeps diffs off-chain with DAC. **Trust:** operator trusted for liveness/ordering only; proof guarantees correctness. **Latency:** off-chain match sub-10 ms; finality per-batch (minutes-1h on dYdX v3 / StarkEx). **Withdrawal:** 7-8h normal on Brine/rhino.fi; *forced* withdraw 14 days before chain freeze + trustless escape. Production: dYdX v3 (StarkEx), Brine, Loopring, Aevo (OP-stack optimistic).

Yi Huang's note (msg 416-417): "these are not new ideas, polygon zkevm dead, the most important thing for zkrollups is proving cost and speed."

### 6.5 PoS BFT chain + ZK-proven STF *only for L1 bridge* (the hybrid)

Run a BFT chain for execution + ordering. Validators sign blocks normally. Separately, prove the STF in ZK and post proof + Merkle root to an Ethereum bridge. Bridge accepts deposits and releases withdraws against ZK-verified state.

**Gained:** no multisig bridge. Ethereum side has cryptographic certainty that whatever validators committed to, the STF was applied correctly.

**Lost:** this is **not** a zk-rollup. Validators still have unilateral power over liveness, ordering, MEV, censorship, and selecting which blocks to prove — the ZK proves *they didn't deviate from the rules they ran*, not that the rules or validator set are decentralized. A 13-of-21 validator collusion still censors and front-runs at will. **This confusion must not survive into the proposal or marketing.**

Production examples: Succinct's Ethereum ZK light client securing Gnosis Omnibridge.

### 6.6 Cosmos IBC v2 / Eureka (closed by §2.1 Decision A)

IBC Eureka is the canonical ZK-light-client bridge between Tendermint chains and Ethereum (mainnet 2025, integrations include Babylon Genesis, Lombard, PumpBTC, Injective, SEDA). It would have been the day-1 bridge if we were on Cosmos SDK — but we are not. Listed for completeness; closed for v1.

**Replacement path:** Succinct's hosted Ethereum ZK light client (used in production by Gnosis Omnibridge) gives the same trust model — Ethereum-side cryptographic certainty over our consensus — without IBC. We control prover infrastructure ourselves or pay Succinct a fee-revenue split. To reach Cosmos chains we either (a) ship a custom IBC translator (heavy), (b) bridge via an LP-style mechanism (LayerZero/Across-style, lighter trust), or (c) skip Cosmos integration entirely in v1 and revisit if user demand materializes. Ethereum, Solana, and Base are the volume sources for perp flow — Cosmos is a marginal addressable market.

### 6.7 Dark-pool encrypted L2

**Renegade:** MPC for pairwise order matching on permissionless P2P; ZK for settlement on Arbitrum/Base; CEX midpoint pricing (Binance) avoids price-discovery liquidity bootstrapping. **Penumbra:** sealed-bid batch auctions on Cosmos chain, encrypted intents to validators, ZK fairness proof. **Liquidity bootstrap problem:** dark pools structurally cannot show depth → makers won't quote first. Renegade dodges via Binance peg; Penumbra via batch auctions; pure perp dark pools at scale remain unrealized.

### 6.8 L1 vs L2 framing

**Sovereign L1 gains:** full token capture (sequencer fees + gas + listing + funding revenue all to chain), validator-set control, no L1 fee tax, no DA fee, sub-100 ms finality achievable, custom matching precompiles, no shared-sequencer dependency.
**Sovereign L1 costs:** bootstrap a validator set, build/maintain a bridge, no day-one Ethereum liquidity, regulatory surface (often classified as unregistered exchange + unregistered network), capital cost for security budget.

**L2 gains:** Ethereum security (rollup) or near-inherited (validium), day-one liquidity from L1 bridges + aggregators, lighter regulatory positioning, no validator ops.
**L2 costs:** L1 fee tax, sequencer-centralization optics regardless, finality bound by L1 settlement, less token-capture, harder to ship custom matching opcodes.

**Hybrid (sovereign L1 + ZK light-client bridge):** captures most L1 economics while eliminating multisig-bridge attack surface that historically drains $100M+ events. Does *not* give Ethereum-equivalent decentralization.

### 6.9 Decision matrix

| Option | Throughput | Latency / Finality | Decentralization | MEV resistance | TTM | Capital cost |
|---|---|---|---|---|---|---|
| **Sovereign L1 (BFT)** | Very high | ~70-500 ms instant | Bound by validator count (low: 21-100) | Validator-controlled, weak by default | 12-18 mo | High (validators, audits, multisig) |
| **Sovereign L1 + ZK bridge** | Very high | ~70-500 ms exec; 12 min-1 h bridge | Same as BFT for chain; cryptographic for bridge | Validator-controlled | 18-24 mo | High + prover infra |
| **ZK rollup (orderbook)** | High (5-10k TPS) | <10 ms match; min-1 h L1 settlement | Operator-centralized; ZK-correct | Operator-controlled | 12-18 mo | Medium (proving cost ongoing) |
| **Validium** | Highest L2 | <10 ms match; min settlement | + DA committee trust | Operator-controlled | 12-18 mo | Medium-low |
| **State-channel network** | Bilateral unlimited; global CLOB poor | Sub-100 ms cooperative; 7-14 d dispute | Equivalent to BFT at same N | Same as BFT | 18-24 mo | Medium; high dispute gas |
| **Dark-pool encrypted L2** | Low-medium (MPC/FHE-bound) | 100 ms-seconds | Operator/committee | **Strong** | 24+ mo | High (cryptographic R&D) |

---

## 7. Recommended Architecture

### 7.1 Stack

**Chain shape:** Greenfield Rust L1. Custom binary on Commonware primitives drives reth via Engine API. No Cosmos SDK, no Tendermint legacy. Same architectural shape as Tempo and Monad.

**Settlement model:** Sovereign L1 + Succinct-style ZK light-client bridge to Ethereum. Reject pure-rollup (proving cost dominates at perp throughput), validium (DA committee trust adds risk without gain), and IBC Eureka (closed by Decision A — not on Cosmos SDK).

**Consensus:** Threshold Simplex from Commonware monorepo, with Minimmit fast-path for happy-case finalization. ~400 ms baseline, sub-second on the happy path. QMDB as storage.
- Validator set: curated bonded set of 30-100 equal-weight validators with a *separate stake-weighted accountability layer* for slashing. Sidesteps Commonware's stake-weighting limitation while preserving PoS security economics. The accountability layer is a custom Rust module — staking, delegation, slashing logic written by us, not inherited from Cosmos x/staking.
- Eventually upgrade to Minimmit's 5f+1 fault model once validator set stabilizes.

**MEV-resistance:**
- **In-protocol frequent batch auctions** at a 200 ms tick. Penumbra-style sealed-bid clearing. Eliminates intra-tick ordering MEV by construction. Maps cleanly onto perp settlement (funding + mark price tick at the same cadence).
- **MCP-style multi-proposer block production** (Constellation pattern) underneath. Provides selective-censorship resistance + hiding required by the FBA layer.
- **Tokenized ordering** as cheap bolt-on for un-batched admin/governance txs.
- **Reject** EIP-8184/8209 (latency-incompatible) and Shutter-style threshold mempools (committee halt risk) for v1.

**Execution:**
- **EVM via Engine API + reth.** Lowest audit risk, maximum ecosystem capture (Foundry, Etherscan, every wallet).
- The CLOB is just a system contract. Reads of book state from user contracts are synchronous (same VM, same block) — eliminates the HyperCore/HyperEVM seam that Hyperliquid users complain about.
- **Block-STM with aggregator primitives** (Aptos-style typed effects) for fees, funding, balances. Matching engine runs single-threaded per market — the FBA tick collapses contention.
- **Reject Cosmos-EVM** for production due to recurring gas-refund/precompile-atomicity bug class (GHSA-mjfq-3qr2-6g84 etc.).
- **Defer** revmc JIT, Stylus, RISC-V to post-launch.

**Privacy lane (post-MVP):**
- Opt-in **TEE-attested matching engine** for institutional flow. Renegade-style ZK/MPC is too heavy for v1; revisit at v2 once flow has bootstrapped.

**Listing/economics:**
- HIP-1-equivalent permissionless listing (Dutch-auction deploy gas).
- HIP-2-equivalent native MM seeder.
- HIP-3-equivalent builder-deployed perps with stake bond.
- HLP-equivalent vault, but with *segmented strategies* (vol-targeted, basis-arb, market-making) instead of one monolithic strategy. Differentiation lever vs Hyperliquid's single HLP.

### 7.2 Why this stack beats Hyperliquid on each axis

| Axis | Hyperliquid | Ours |
|---|---|---|
| Validator decentralization | 21, geographically concentrated, single binary historically | 30-100 curated bonded, multi-implementation target by v2 |
| Mempool privacy | Plaintext, validator-visible | Sealed-bid FBA + MCP attestation; opt-in TEE dark pool |
| Fair ordering | Validator-honest | Protocol-level (FBA + MCP) |
| EVM seam | HyperCore + HyperEVM async-ish bridge, dual block | Single-VM EVM, CLOB as system contract, synchronous reads |
| Governance | Foundation-mediated | Stake-weighted on-chain from day 1 |
| Native private orders | None | TEE dark-pool lane (post-MVP) |
| Listings | HIP-1/2/3 — strong | Equivalent + multi-strategy vaults |

### 7.3 Where this stack does *not* beat Hyperliquid

- **Latency.** A 200 ms FBA tick is slower than Hyperliquid's ~70 ms BFT finality on some axes. We frame this as a feature ("MEV-resistant by construction") not a bug, but market-makers running stat-arb on a sub-100 ms loop will notice.
- **Time-to-market.** Hyperliquid is years deep on tooling, HLP performance, and liquidity. We need a credible bootstrap mechanism (incentivized testnet, MM subsidies, points campaign) — and we cannot count on out-shipping them on raw features.
- **Network effects.** HYPE is a $30B+ asset with deep liquidity and a points-to-launch playbook. We cannot win the token-utility comparison in year 1.

The thesis: **win on credibly-decentralized + protocol-level fair-ordering + native privacy lane**, accept being 2nd on raw latency, attack the institutional flow that Hyperliquid leaks.

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Commonware Threshold Simplex stake-weighting limitation breaks PoS economics | High | High | Curated equal-weight validator set + separate stake-weighted slashing layer |
| FBA tick perceived as "too slow" by MM/HFT | Medium | High | 100-200 ms is competitive with most CEXes; market the MEV story; offer parallel non-FBA lane for makers |
| MCP layer not production-ready in our timeframe | High | Medium | Build single-proposer first, MCP as v1.1 once Constellation/equivalent ships |
| ZK light-client bridge proving costs dominate | Medium | Medium | Use Succinct's hosted prover initially; control via fee-revenue split |
| Cosmos-EVM bug class repeats in any other gas-refund-using EVM | Medium | High | Use stock reth via Engine API; avoid bespoke EVM precompiles for state mutation |
| TEE dark-pool side-channel exploit | Medium | Medium | Multi-vendor TEE attestation; size limits in v1; ZK/MPC migration path |
| Hyperliquid ships Hyperliquid v2 with same MEV defenses | Medium | High | Move fast; differentiate on decentralization narrative they cannot credibly match |
| Regulatory: classified as unregistered exchange + unregistered network | Medium | High | Foundation in jurisdiction with crypto clarity; no US persons in v1; legal opinion before token launch |

---

## 9. Roadmap

**Phase 0 — Spec + prototype (months 0-3)**
- TLA+ specification of FBA + MCP + Threshold Simplex composition. Yi Huang's TLA+ work on Block-STM is precedent.
- Greenfield Rust binary scaffolded on Commonware monorepo + reth driven via Engine API. Single-proposer, FBA module stub.
- Custom staking / slashing module spec (no Cosmos x/staking inheritance).
- Whitepaper + funding pitch.

**Phase 1 — Closed testnet (months 3-9)**
- Full FBA matching engine integrated as a system contract on the EVM lane. Threshold Simplex consensus with 30-validator curated set.
- Custom staking / slashing / governance modules in Rust.
- Succinct-style ZK light-client bridge to Ethereum testnet.
- Aggregator primitives + Block-STM tuned for funding/fees.
- HIP-1/2/3-equivalent listing modules.
- Permissioned MM onboarding for closed testnet.

**Phase 2 — Open testnet + audit (months 9-12)**
- Audit campaign (Trail of Bits, Halborn, OpenZeppelin).
- Public testnet, points/incentive campaign.
- Multi-strategy HLP-equivalent vaults launched.
- MCP layer added (single-proposer fallback).

**Phase 3 — Mainnet launch (months 12-15)**
- Mainnet with curated validator set (30-50 nodes).
- Token launch.
- TEE dark-pool lane in opt-in beta.

**Phase 4 — Decentralization + scale (months 15-24)**
- Validator set expansion to 100+, multi-implementation.
- Minimmit fast-path enabled.
- Renegade-style ZK/MPC dark-pool migration option.
- Custom IBC translator or LP-style Cosmos bridge if §10.4 demand materializes.

---

## 10. Open Questions to Resolve Before Funding

1. **Validator-set composition** — fully permissionless from day 1, or curated/permissioned with a decentralization roadmap? Hyperliquid took the curated path; dYdX v4 went fully open. *Recommend: curated v1, formal decentralization milestones tied to stake distribution metrics.*
2. **Token launch path** — points campaign à la Hyperliquid, or direct issuance? Regulatory implications differ.
3. **Mantra positioning** — is this a Mantra product, a spinout co-funded with Mantra capital, or a separate raise? G's note (msg 385): "applicable to Mantra but also applicable to you and me in a way that we can raise money for it independently."
4. **Cosmos liquidity reach** — given we are not on Cosmos SDK and not running IBC Eureka day-1, do we ship a custom IBC translator, an LP-style bridge, or skip Cosmos integration in v1? *Recommend: skip in v1, revisit in v2 if Cosmos restaking / Babylon BTC liquidity matters.*
5. **Greenfield staking module — build vs fork?** Lighthouse / reth's staking-adjacent code, Anchor's bonded-validator patterns, or write from scratch on Commonware primitives. Affects Phase 0 timeline.
6. **EVM compatibility level** — full Cancun parity (so Foundry / standard Solidity work unchanged) or selective subset that omits opcodes/precompiles incompatible with our consensus model (e.g. `BLOCKHASH` semantics under MCP, `BASEFEE` under FBA). *Recommend: full Cancun + custom precompiles for matching engine and oracle reads.*

---

## Appendix A — Source Index

### Consensus
- Sei Autobahn: https://blog.sei.io/autobahn-sei-gigas-multi-proposer-approach-to-blockchain-consensus/
- Streamlet: https://eprint.iacr.org/2020/088.pdf
- Simplex: https://simplex.blog/
- Threshold Simplex: https://commonware.xyz/blogs/threshold-simplex
- Commonware monorepo: https://github.com/commonwarexyz/monorepo
- Minimmit: https://github.com/commonwarexyz/monorepo/blob/main/pipeline/minimmit/minimmit.md
- QMDB paper: https://arxiv.org/abs/2501.05262
- Pod docs: https://docs.v1.pod.network/
- Pi-Squared / FastSet: https://pi2.network/papers

### MEV
- MCP: arxiv:2509.23984, arxiv:2511.13080
- Solana Constellation: https://constellation.anza.xyz/, https://www.helius.dev/blog/constellation
- Masquerade: arxiv:2308.15347, ACM 10.1145/3730410
- EIP-8184: https://eips.ethereum.org/EIPS/eip-8184
- EIP-8209: https://eips.ethereum.org/EIPS/eip-8209
- Shutter: https://blog.shutter.network/applied-mev-protection-via-shutters-threshold-encryption/
- Penumbra DEX: https://protocol.penumbra.zone/main/dex.html
- Renegade: https://docs.renegade.fi/core-concepts/dark-pool-explainer

### Execution
- Groundhog: arxiv:2404.03201, https://github.com/scslab/smart-contract-scalability
- Speedex: https://github.com/scslab/speedex, arxiv:2111.02719
- Block-STM: arxiv:2203.06871
- Aptos Aggregators: https://medium.com/aptoslabs/aggregators-how-sequential-workloads-are-executed-in-parallel-on-the-aptos-blockchain-e7992c70cefb
- revmc: https://github.com/paradigmxyz/revmc
- Stylus: https://docs.arbitrum.io/stylus/gentle-introduction
- Cosmos EVM advisory: https://github.com/cosmos/evm/security/advisories/GHSA-mjfq-3qr2-6g84
- EIP-7990: https://ethereum-magicians.org/t/eip-7990-runcode-opcode-execute-arbitrary-bytecode-from-memory-within-the-same-execution-context/24850
- Engine API: https://github.com/ethereum/execution-apis/tree/main/src/engine

### Settlement / Bridging
- Tempo zones: https://github.com/tempoxyz/zones
- Lightning session: https://paymentauth.org/draft-lightning-session-00.html
- IBC Eureka: https://cosmos.network/ibc-eureka
- Succinct ZK light client: https://www.gnosis.io/blog/succincts-ethereum-zk-light-client-and-the-road-to-trust-minimzed-bridges-with-hashi
- StarkEx: https://docs.starkware.co/starkex/overview.html

### Competitor landscape
- Hyperliquid: https://hyperliquid.gitbook.io/hyperliquid-docs
- dYdX v4 architecture: https://www.dydx.xyz/blog/v4-technical-architecture-overview
- Lighter whitepaper: https://assets.lighter.xyz/whitepaper.pdf
- Aster docs: https://docs.asterdex.com/
- Paradex: https://messari.io/report/paradex-privacy-first-perp-dex-and-the-dime-tge
- Vertex Edge: https://medium.com/@vertex_edge/introducing-vertex-edge-the-future-of-liquidity-is-synchronous-ec3cab5311a1
- Drift: https://docs.drift.trade/developers/market-makers/orderbook-and-matching
