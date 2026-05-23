# reth

Research note backing the UltraFast whitepaper references to reth in §6.1 (EVM execution via the Engine API), §6.2 (Block-STM layered above it), §6.3 (aggregator precompiles), §5.4 (QMDB state-DB shim), and §15 (related-work positioning against Tempo and Monad).

---

## Part 1 — How UltraFast uses reth and why

UltraFast runs stock reth as its EVM execution client, driven by the consensus layer through the post-Merge Engine API (`engine_newPayloadV*`, `engine_forkchoiceUpdatedV*`, `engine_getPayloadV*`). This is the same architectural shape Tempo (Stripe/Paradigm, announced September 2025) and Monad have converged on: an EVM execution module sitting behind a stable JSON-RPC seam, driven by a separately implemented consensus layer.

The choice is conservative on three axes.

**Tooling inheritance.** Driving stock reth means UltraFast inherits the full Ethereum developer surface without modification: Foundry, Hardhat, every standards-compliant wallet, every block explorer that speaks `eth_*` JSON-RPC, and the Solidity / Vyper / Huff compiler frontends. EVM compatibility level is full Cancun parity. There is no fork of revm, no fork of the JSON-RPC server, and no custom EVM bytecode dialect. Custom precompiles exist only for *reads* — matching-engine state, oracle reads, the aggregator surface from §6.3, and data-marketplace entitlement gating in §9.4. No custom precompile mutates state. That self-imposed constraint is the property whose violation produced the Cosmos-EVM bug class catalogued in advisory GHSA-mjfq-3qr2-6g84 (CVSS 8.3), where `Run` methods were not atomic and a deferred `HandleGasError` could fail to revert StateDB on out-of-gas, enabling partial-state-write claims. UltraFast structurally cannot reproduce that bug.

**Lowest audit surface.** Of the execution paths considered — fork of reth with bespoke modifications, fork of go-ethereum, building a new client from scratch, or running an unrelated EVM dialect — driving stock reth via the Engine API presents the smallest code surface unique to UltraFast and the largest code surface already audited externally. reth itself was audited by Sigma Prime, and revm by Guido Vranken (Ethereum bug-bounty top contributor). UltraFast inherits both audits at no cost.

**QMDB integration via the state-DB shim.** §5.4 of the whitepaper specifies that QMDB replaces reth's stock MDBX + hexary Merkle-Patricia Trie storage. The integration mechanism is a state-DB shim implementing reth's state-DB trait surface — exactly the modular seam reth was designed around. EVM hexary-trie semantics remain exposed to user contracts via `eth_getProof`-style RPCs; the twig storage operates underneath. Ethereum-MPT-root compatibility is *not* a v1 requirement because Foundry, standard wallets, and Solidity tooling depend on EVM execution semantics, not on the state-root format.

Block-STM (§6.2) and Aptos-style aggregator primitives (§6.3) are layered on top of reth's execution path, also at the trait surface rather than via a fork. Speculative execution (§6.4) begins on `engine_newPayload` before the threshold-signature certificate arrives; the QMDB state-root commit gates on finality.

UltraFast does not implement reth; the Phase 0 walking-skeleton (§16, Appendix B) validates the Engine-API + QMDB-shim + Block-STM integration end-to-end before any feature work begins.

---

## Part 2 — Deep research on reth

### What reth is

reth (Rust Ethereum) is a modular, Rust-native Ethereum execution-layer client developed by Paradigm. Source is at `paradigmxyz/reth` under dual MIT / Apache-2.0 licensing. It is "production-ready" in the staking-grade sense: full Ethereum-mainnet parity, completed external audit (Sigma Prime), and zero crash reports across high-uptime deployments since the beta cycle in 2024.

reth is positioned not just as a node binary but as an SDK — a Cargo workspace of 150+ crates intended to be imported individually, mixed and matched, and extended into custom L1s, rollups, and indexing infrastructure.

### The Engine API contract

The Engine API is the post-Merge protocol between an Ethereum consensus client (CL) and an execution client (EL). After Ethereum's transition to proof-of-stake in September 2022, validation responsibility was split: the CL produces blocks and runs the BFT consensus, the EL runs the EVM and maintains state. They communicate over a small authenticated JSON-RPC surface:

- `engine_newPayloadV*` — CL asks EL to validate and execute a candidate payload.
- `engine_forkchoiceUpdatedV*` — CL tells EL which head, safe, and finalised blocks to track; optionally requests building a new payload.
- `engine_getPayloadV*` — CL retrieves the payload the EL has been building.

reth implements this contract fully. Any consensus client that speaks Engine API can drive reth — Ethereum mainnet uses Lighthouse, Prysm, Teku, Nimbus, and Lodestar. UltraFast plugs its Commonware-based Threshold Simplex + Minimmit consensus into the same socket.

### Modular crate layout

The crates UltraFast and other downstream projects most often touch:

- `reth-revm` — reth-specific utilities and integrations atop revm, the Rust EVM Paradigm also maintains. revm is the actual interpreter; reth-revm is the glue.
- `reth-stages` — the staged sync pipeline (headers, bodies, senders, execution, merkle, history, transaction lookup, finish). The pipeline driver and the public API for adding or replacing stages live here.
- `reth-rpc` and `reth-rpc-engine-api` — JSON-RPC server crates. The Engine API lives in `rpc/rpc-engine-api`; the user-facing `eth_*` namespace lives separately.
- `reth-network` — devp2p networking stack, peer management, discovery.
- `reth-db` and `reth-storage` — abstraction over MDBX and the static-files tier. The state-DB trait surface UltraFast targets with the QMDB shim lives in this layer.
- `reth-engine-tree` — the engine subsystem that receives Engine-API payloads, validates them, executes transactions, computes state roots, and persists finalised blocks asynchronously. This is the orchestrator that calls into `reth-stages` and `reth-revm`.

The data layer exposes three tiers: in-memory cache for recent blocks, MDBX for mutable state, and static files for historical data. Reth 2.0 moves historical account and storage changesets to static files by default and stores only hashed state on MDBX.

### Release timeline

- **0.2.0-beta.6** — April 2024. Last beta before 1.0. The cutoff after which Paradigm tracked zero crash reports in production deployments.
- **1.0** — June 2024. "Production-ready" milestone. Sigma Prime audit complete. ~50-hour sync from genesis. Recommended for staking and professional operator infrastructure.
- **1.x line** — through 2024 and 2025. Incremental performance and stability releases. v1.0.x patches, then v1.1 (late 2024), running through v1.5 (mid-2025) and on to v1.8.4 as the last patch before the v2.0 cut.
- **2.0** — April 2026. Major release. Storage V2 default for new nodes (hashed state only on MDBX, changesets in static files); SparseTrieCacheTask for state-root computation; engine backpressure to prevent unbounded in-memory block growth when persistence lags; standard-block persistence in ~40 ms, Gigagas-block in ~400 ms; end-of-block state-root in ≤2 ms; ~1.7 Gigagas/s sustained; mainnet disk footprint under 300 GB.

### Performance characteristics

Reth is competitive with the fastest existing Ethereum execution clients on the dimensions that matter for the UltraFast workload. Block-import throughput on Reth 2.0 reaches ~1.7 Gigagas/s. State-root computation, historically the bottleneck for high-throughput EVM blocks, is reduced to ≤2 ms per block on the SparseTrieCacheTask path. Disk footprint is under 300 GB for an archive-capable mainnet node — well below geth's archive footprint.

For UltraFast's purposes the relevant fact is that these numbers are headroom: UltraFast's perp-derivatives workload is dominated by matching-engine work (FBA solver, §7) and gasless-lane order processing (§6.5), not by EVM execution. The EVM lane (§9.5) inherits whatever performance reth provides; QMDB further compresses state-access latency relative to stock MDBX.

### Comparison to other execution clients

- **geth** (Go). The reference client. Largest market share. Mature but not designed for modular extension; forks are heavy.
- **erigon** (Go, then Erigon 3 in Rust/C++). Optimised for archive nodes. Pioneered the staged-sync architecture reth later adopted.
- **nethermind** (C#). Strong on enterprise and Layer-2 deployments.
- **besu** (Java). Maintained by Consensys / Hyperledger. Common in permissioned and institutional contexts.
- **reth** (Rust). Modular SDK shape; the newest of the production clients and the one explicitly designed to be embedded into other L1s and rollups.

On Ethereum mainnet reth's client-diversity share has grown from ~2 % in early 2024 to ~5–6 % through late 2024 and 2025.

### Adopters beyond Ethereum mainnet

reth is increasingly the default Rust EL behind non-Ethereum EVM chains.

- **OP Stack** — `op-reth`, the Optimism-flavoured reth, is supported across the Superchain. Base operates production infrastructure on op-reth alongside op-geth. Optimism Foundation documents op-reth as a first-class execution-client option.
- **BNB Chain** — `bnb-chain/reth` (BSC and opBNB). Announced July 2024 as a client-diversity initiative; production deployment reported ~690 Mgas/s and ~40 % faster sync than the BSC-Geth baseline.
- **Tempo** — Stripe-and-Paradigm L1 announced September 2025. EVM-compatible, built on reth, targeting ~100 k TPS and sub-second finality for stablecoin payments. Design input from Anthropic, Deutsche Bank, DoorDash, Lead Bank, Mercury, Nubank, OpenAI, Revolut, Shopify, Standard Chartered, Visa. Independent entity, Paradigm and Stripe as early investors, Matt Huang leading. This is the single largest validation that reth's Engine-API + SDK shape is the right pattern for new L1s targeting payment- and trading-grade workloads.
- **Monad** — referenced alongside Tempo in §15 of the whitepaper. Monad does *not* use reth: the Monad team wrote their own C/C++ execution client (MonadDb, MonadBFT, asynchronous execution, parallel execution, JIT). The shared property is the architectural pattern — separate CL and EL modules with a stable JSON-RPC-ish seam between them — not the choice of EL implementation. UltraFast cites Monad as a fellow traveller on the architecture and reth as the specific EL it adopts.
- **MegaETH, RISE, Boundless** — maintain public forks of reth, signalling its acceptance as the default starting point for high-performance EVM L1 and rollup experiments.

### The SDK and ExEx patterns

Two reth subsystems matter to UltraFast and similar projects.

**Node builder.** reth exposes a builder API that lets a downstream project compose a custom node by overriding individual node components (consensus, payload builder, EVM config, RPC modules, state DB). UltraFast's QMDB shim and the eventual Block-STM and aggregator wiring fit this pattern: override the components that need overriding, inherit the rest. Paradigm's own AlphaNet — an OP-Stack-compatible experimental rollup for testing bleeding-edge Ethereum research — is built on node-builder overrides and exists explicitly as a reference for projects in UltraFast's position.

**ExEx (Execution Extensions).** A framework introduced in May 2024 for building post-execution hooks: indexers, MEV infrastructure, rollup sequencers, and similar off-chain consumers. Paradigm reports >10× code reduction relative to bespoke equivalents. ExEx is not on UltraFast's critical path at v1, but it is the natural extension surface for later-phase work (data-marketplace indexing, FBA-tick observability, cross-product margin reporting).

### Why reth and not the alternatives

The decision matrix UltraFast faced is well summarised by the Tempo announcement: in 2025–2026 a new EVM-compatible L1 that wants production-grade execution without writing its own EVM has three real choices — fork geth, fork reth, or drive stock reth through the Engine API. Stock reth wins on audit surface (smallest unique-to-us code), on tooling inheritance (full Ethereum dev stack works), on modularity (state-DB and component overrides at the trait surface rather than the fork level), and on adopter momentum (Base, BNB, Tempo, and the broader reth-SDK ecosystem). The Cosmos-EVM bug class (GHSA-mjfq-3qr2-6g84) is a specific data point against any path that involves bespoke EVM-state-mutation logic; stock reth, with read-only precompiles, structurally avoids it.

---

## Primary sources

- paradigmxyz/reth — https://github.com/paradigmxyz/reth
- reth documentation — https://reth.rs/
- "Releasing Reth 1.0" (Paradigm, June 2024) — https://www.paradigm.xyz/2024/06/reth-prod
- "Releasing Reth 2.0" (Paradigm, April 2026) — https://www.paradigm.xyz/2026/04/releasing-reth-2-0
- reth Execution Extensions (Paradigm, May 2024) — https://www.paradigm.xyz/2024/05/reth-exex
- reth AlphaNet (Paradigm, April 2024) — https://www.paradigm.xyz/2024/04/reth-alphanet
- Ress: stateless reth nodes (Paradigm, March 2025) — https://www.paradigm.xyz/2025/03/stateless-reth-nodes
- reth SDK overview — https://reth.rs/sdk/
- BNB Chain reth integration — https://www.bnbchain.org/en/blog/diversifying-bnb-smart-chain-and-opbnb-execution-clients-with-reth
- Tempo announcement coverage — https://blockworks.co/news/tempo-stripe-paradigm-planned-l1, https://www.coindesk.com/business/2025/09/04/stripe-paradigm-unveil-tempo-as-blockchain-race-for-high-speed-stablecoin-payments-heats-up
- Monad documentation — https://docs.monad.xyz/
- Cosmos-EVM advisory GHSA-mjfq-3qr2-6g84 (cited in whitepaper §6.1) — https://github.com/cosmos/evm
