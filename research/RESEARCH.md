# UltraFast: Perpetual Futures DEX — Research & Strategy Document

> **Date:** 2026-03-24
> **Status:** Research Phase
> **Objective:** Build a fully on-chain perpetual futures DEX on a custom L1 to compete with Hyperliquid, featuring dark pool integration and MEV-resistant execution.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Hyperliquid: Understanding the Incumbent](#2-hyperliquid-understanding-the-incumbent)
3. [Competitive Landscape](#3-competitive-landscape)
4. [Consensus Research](#4-consensus-research)
5. [MEV Mitigation Research](#5-mev-mitigation-research)
6. [Fully On-Chain Order Book Architectures](#6-fully-on-chain-order-book-architectures)
7. [Dark Pool Research](#7-dark-pool-research)
8. [Market Making & Liquidity Partners](#8-market-making--liquidity-partners)
9. [MANTRA Ecosystem Synergies](#9-mantra-ecosystem-synergies)
10. [Proposed Technical Architecture](#10-proposed-technical-architecture)
11. [Competitive Strategy](#11-competitive-strategy)
12. [Go-to-Market Strategy](#12-go-to-market-strategy)
13. [Risks & Mitigations](#13-risks--mitigations)
14. [Open Design Decisions](#14-open-design-decisions)
15. [Next Steps: Research Agenda](#15-next-steps-research-agenda)
16. [Privacy-Preserving Technologies: FHE, Threshold Encryption, TEE & Hybrid Approaches](#16-privacy-preserving-technologies-fhe-threshold-encryption-tee--hybrid-approaches)
17. [Zero-Knowledge Perpetual Futures: Project Landscape](#17-zero-knowledge-perpetual-futures-project-landscape)
18. [ZK Cryptography for Private Trading Systems](#18-zk-cryptography-for-private-trading-systems)
19. [ZK Proof Performance Benchmarks](#19-zk-proof-performance-benchmarks)
20. [Recommended ZK Architecture for UltraFast](#20-recommended-zk-architecture-for-ultrafast)
21. [Updated Research Agenda — ZK Privacy Track](#21-updated-research-agenda--zk-privacy-track)
22. [References](#22-references)

---

## 1. Executive Summary

UltraFast is a fully on-chain perpetual futures DEX built on a custom L1 blockchain. It combines a 2-phase pipelined HotStuff consensus variant with Groundhog's commutative execution model, encrypted mempools, and Frequent Batch Auctions (FBA) to deliver CEX-grade performance with structural MEV elimination.

**Key differentiators vs Hyperliquid:**

| | Hyperliquid | UltraFast |
|---|---|---|
| Consensus | HyperBFT (2-chain HotStuff) | 2-chain HotStuff + MonadBFT tail-fork resistance |
| Matching | Continuous price-time priority | FBA (uniform clearing price, pro-rata) |
| MEV defense | Speed-based only | Encrypted mempool + Groundhog + FBA (structural) |
| Execution | Sequential | Groundhog parallel (commutative) |
| Order privacy | None (public mempool) | Threshold encrypted until consensus |
| Validator set | ~16-25, team-controlled | Open, permissionless DPoS |
| Intervention | Can unilaterally delist/force-settle (JELLY) | Governance-only, no unilateral action |
| Asset types | Crypto only | Crypto + RWA perps |
| Compliance | None | Optional zk-KYC tiers |
| Dark pool | None | Protocol-native MPC+ZK private matching (not a service — built into the chain) |

---

## 2. Hyperliquid: Understanding the Incumbent

### 2.1 Architecture & Technology

- **Custom L1** built on HyperBVM with proprietary consensus (HyperBFT, a modified HotStuff/Jolteon/DiemBFT variant)
- **Written in Rust**, purpose-built for trading workloads
- **Fully on-chain order book** — every order placement, cancellation, match, and liquidation is a blockchain transaction processed by HyperCore
- **Performance:**
  - 200,000 orders/second in production (theoretical ceiling: 2M orders/sec)
  - Median block finality: ~70ms
  - End-to-end order latency: median 0.2s, p99 0.9s
- **Optimistic execution:** Transactions begin executing before block finalization
- **Optimistic responsiveness:** Blocks produced as soon as quorum is reached, not waiting for fixed timeouts

### 2.2 Matching Engine

- Deterministic **price-time priority** (identical to CEX order books)
- Orders placed at integer multiples of tick size
- Clearinghouse validates margin twice: at order submission and immediately before execution
- Cancel transactions reportedly given priority over new orders within the same block

### 2.3 Market Position (as of early 2025)

- **Dominant perps DEX** — commands ~55-65% of on-chain perps volume
- Daily volume: $3-10B+ on peak days
- Open interest: $3-5B+
- TVL: ~$2B+ (HLP vault + staked assets)
- Active traders: 200,000+ unique addresses

### 2.4 Fee Structure

| Tier | Maker | Taker |
|------|-------|-------|
| Base | 0.010% | 0.035% |
| Higher tiers | Rebates | Reduced |

- Very competitive vs CEXes — cheaper than most
- No gas fees for trading operations

### 2.5 Liquidity Model

- **HLP (Hyperliquid Liquidity Pool):** Community vault that acts as counterparty/market maker — users deposit USDC and earn fees + PnL from market making
- **Professional market makers:** API-driven, with dedicated maker programs
- **No token incentive mining** — organic volume (major strength)

### 2.6 HYPE Token

- Launched November 2024, one of the largest airdrops ever (~$1.6B distributed)
- Used for staking, governance, and fee tier benefits
- No VC allocation — community-first distribution narrative

### 2.7 MEV Approach

Hyperliquid relies on:
1. Speed making front-running economically difficult (70ms finality)
2. Deterministic ordering within blocks
3. Full on-chain transparency creating an auditable trail
4. Third-party projects like **Silhouette** using TEEs for order privacy

**Critical weakness:** Speed alone is not structurally MEV-resistant. A co-located validator can still extract value. No encrypted mempool, no FBA, no fair ordering protocol.

### 2.8 Known Vulnerabilities

#### Centralization (Critical)
- **Validator set:** ~16-25 validators, all team-controlled/permissioned at launch
- **Single sequencer:** Trade matching runs through a centralized sequencer
- **Bridge risk:** HyperEVM bridge holds billions secured by a small validator set. Security researchers have warned a compromise of validator keys could drain the entire bridge
- **No slashing mechanism** publicly documented
- **Closed-source** core matching engine — cannot be community-audited

#### The JELLY Incident (March 2025)
- A trader exploited the liquidation engine by manipulating the JELLY memecoin market
- Opened a massive short position, then pumped the spot price on other venues
- Forced the HLP vault to absorb the liquidation at an inflated price (~$10M+ losses)
- **Hyperliquid's response:** Unilaterally delisted JELLY and force-settled positions at a price favorable to the vault
- Widely criticized as centralized intervention indistinguishable from a CEX
- **Exposed:** (a) insufficient oracle/price manipulation safeguards, (b) single-asset risk concentration, (c) willingness to break market rules to protect protocol solvency

#### Regulatory Ambiguity
- No KYC/AML, geoblocks the US via frontend but not at protocol level
- No legal entity or clear jurisdiction
- Potential target for enforcement as regulatory clarity increases

#### Limited Feature Set
- Primarily crypto-only perpetuals — no RWA perps, no FX, no commodity futures
- No native options
- No institutional compliance tooling — no dark pools, no prime brokerage
- No FIX protocol or institutional-grade connectivity
- HyperEVM DeFi ecosystem is still nascent

---

## 3. Competitive Landscape

### 3.1 Market Overview

The on-chain perpetual futures market reached approximately $2-3 trillion in cumulative monthly volume by early 2025.

### 3.2 Tier 1 — Market Leaders

| Protocol | Chain | Market Share | Differentiator |
|---|---|---|---|
| **Hyperliquid** | Custom L1 (HyperEVM) | ~55-65% | CEX-grade orderbook, sub-second latency, no gas fees |
| **dYdX v4** | Cosmos appchain | ~8-12% | First-mover decentralized orderbook, institutional brand |
| **Jupiter Perps** | Solana | ~8-10% | Solana liquidity aggregation, JUP ecosystem |

### 3.3 Tier 2 — Significant Players

| Protocol | Chain | Market Share | Differentiator |
|---|---|---|---|
| **GMX v2** | Arbitrum, Avalanche | ~4-6% | Pool-based model (GLP/GM), real yield narrative |
| **Vertex Protocol** | Arbitrum, Mantle | ~3-5% | Hybrid orderbook+AMM, cross-margin |
| **Drift Protocol** | Solana | ~2-3% | Solana-native, hybrid AMM/orderbook |
| **Aevo** | OP Stack L2 | ~1-2% | Options + perps, pre-launch tokens |

### 3.4 Tier 3 — Emerging/Niche

- **Synthetix Perps v3** (Base/Optimism) — powers Kwenta, Polynomial
- **Gains Network (gTrade)** — Arbitrum/Polygon, synthetic model
- **MUX Protocol** — aggregator across perps DEXes
- **Orderly Network** — infrastructure layer for perps orderbooks
- **RabbitX** — Starknet-based
- **LogX** — multi-chain perps aggregator

### 3.5 Key Lessons from Competitors

| Protocol | Lesson |
|---|---|
| **Hyperliquid** | Superior UX + airdrop promise sustained engagement for 12+ months. No token at launch. Product-first. |
| **dYdX** | Token-first approach attracted mercenary capital that left when rewards dried up. Migrated to Cosmos for sovereignty. |
| **GMX** | Community-driven, "real yield" narrative. Slower growth but extremely loyal user base. Sustainable economics = defensibility. |
| **Jupiter Perps** | Leveraged existing DEX aggregator user base. Distribution advantage is king. |
| **Injective** | FBA model is academically superior for MEV but hasn't translated to market share dominance. UX and liquidity matter more than fairness alone. |

---

## 4. Consensus Research

### 4.1 HotStuff — Original Protocol

HotStuff (Yin, Malkhi, Reiter, Gueta, Abraham, 2018) is a leader-based BFT consensus protocol for the partially synchronous model. Tolerates f < n/3 Byzantine faults.

**Three phases:** Prepare → Pre-Commit → Commit (6 message delays, 3 round-trips)

**Pipelined HotStuff:** Overlaps phases — each new proposal carries the QC from the previous round. Block committed after 3 consecutive QCs (3-chain rule). Commit latency = 3 round-trips.

**Key innovation:** Linear view-change O(n), vs PBFT's O(n³) and Tendermint's O(n²).

| Protocol | Phases | Happy-Path | View-Change | Responsive |
|----------|--------|-----------|-------------|------------|
| PBFT | 2 | O(n²) | O(n³) | Yes |
| Tendermint | 2 | O(n²) | O(n) | No (waits delta) |
| HotStuff | 3 | O(n) | O(n) | Yes |
| HotStuff-2 | 2 | O(n) | O(n²) worst | Yes |

### 4.2 HotStuff-2 (Malkhi, 2023)

Two phases are sufficient. Eliminates the third phase using a dual-mode view change:
- If new leader receives the lock from previous view → proceeds responsively
- Otherwise → waits Θ(δ) for complete information

| Metric | HotStuff | HotStuff-2 |
|--------|----------|------------|
| Phases | 3 | **2** |
| Commit latency | 3 round-trips | **2 round-trips** |
| Happy-path msgs | O(n) | O(n) |
| Worst-case view change | O(n) | O(n²) |
| Responsive | Yes | Yes |

**33% latency reduction** — significant for trading.

### 4.3 Fast-HotStuff (Jalalzai et al., 2020)

Reduces HotStuff to two rounds while maintaining responsiveness. Modified locking rule avoids extra phase. More resilient against performance attacks.

### 4.4 Jolteon (Gelashvili et al., 2021)

2-chain HotStuff with PBFT-style quadratic view-change. **Aptos (AptosBFT v4) is based on Jolteon.** 200-300ms lower commit latency than 3-chain HotStuff.

### 4.5 Ditto (Gelashvili et al., 2021)

Extends Jolteon with an **asynchronous fallback:**
- Normal conditions: runs Jolteon for low latency
- Network partition/DDoS: falls back to async BFT that guarantees liveness without timing assumptions

### 4.6 HotStuff-1 (2024)

Single-phase speculative commit — clients receive execution responses after just 1 QC. Introduces the "prefix speculation dilemma."

### 4.7 MonadBFT (2025)

Pipelined HotStuff-family with unique properties:
- **2 phases** with linear message complexity on happy path
- **Tail-forking resistance:** Prevents a malicious leader from forking away its predecessor's block using Timeout Certificates with `high_tip` metadata and No-Endorsement Certificates (NEC)
- **Speculative finality** in 1 slot (400ms), **full finality** in 2 slots (800ms)
- **Fast recovery:** Single failed leader causes only one timeout delay

### 4.8 HotStuff Variants in Production

| Chain | Consensus | TPS | Finality | Median Latency |
|-------|-----------|-----|----------|----------------|
| **Hyperliquid** | HyperBFT (2-chain) | 200K orders/s | Sub-second | **0.07-0.1s** |
| **Aptos** | AptosBFT v4 (Jolteon) | 160K | Sub-second | ~0.5s |
| **Monad** | MonadBFT | 10K+ target | 0.8s | 0.4s (speculative) |
| **Sei** | Twin-Turbo (Tendermint) | 20K | ~0.4s | ~0.4s |
| **Flow** | HotStuff (Go) | Moderate | ~2.5s | ~2.5s |

### 4.9 DAG-Based Alternatives (Narwhal/Bullshark/Mysticeti)

| Property | Leader-Based (HotStuff-2/Jolteon) | Certified DAG (Narwhal-Bullshark) | Uncertified DAG (Mysticeti) |
|----------|-----------------------------------|-----------------------------------|-----------------------------|
| Commit latency | **2 RTTs (~200ms)** | 4-6 RTTs (~800ms+) | 3 msg delays (~500ms) |
| Throughput | Moderate (leader bottleneck) | **Very high** (parallel) | **Very high** (parallel) |
| Ordering determinism | **Strict total order** | Less predictable | Less predictable |
| Price-time priority | **Native** | Requires additional layer | Requires additional layer |
| Fair ordering integration | **Easy** (Themis) | Hard | Hard |
| Fault latency impact | View change adds delta | Graceful degradation | Graceful degradation |

**Verdict:** Leader-based 2-chain HotStuff (Jolteon/HyperBFT family) is the clear winner for on-chain order book trading due to deterministic total ordering and lower commit latency.

### 4.10 Recommended Consensus: 2-Phase Pipelined HotStuff + MonadBFT Enhancements

- 2-chain commit rule (~100-200ms finality)
- Linear O(n) message complexity on happy path
- MonadBFT-style tail-forking resistance
- VRF-based leader rotation
- Optimistic responsiveness (no fixed timeouts)

---

## 5. MEV Mitigation Research

### 5.1 Groundhog (Stanford, 2024)

**Paper:** "Groundhog: Linearly-Scalable Smart Contracting via Commutative Transaction Semantics" (arXiv:2404.03201)

**Authors:** Geoffrey Ramseyer and David Mazieres (Stanford SCS Lab / Stellar Development Foundation)

**Core Innovation:** Eliminates intra-block transaction ordering entirely through commutative semantics.

**How it works:**

1. **Snapshot reads:** All transactions in a block read from the same state snapshot (block-start state). No read-after-write dependency between transactions in the same block.

2. **Commutative semantics:** Transactions produce typed modifications using data types whose concurrent modifications commute:
   - **Nonnegative integers:** Concurrent additive modifications combine (e.g., two deposits)
   - **Bytestrings:** Concurrent identical writes commute; differing writes conflict
   - **Ordered sets:** Insertions applied before concurrent clears

3. **Reserve-commit process:** For potentially conflicting operations (e.g., withdrawals exceeding balance), a two-phase approach. Reserve phase checks feasibility using atomic counters; commit phase applies modifications.

**Performance:** 500,000+ payment TPS across 10M accounts on a 96-core AMD EPYC machine (73-78x speedup, near-linear scaling). Throughput is **identical** under extreme contention and zero contention — unlike Block-STM (Aptos) which collapses under contention.

**MEV Implications:** Since transactions in a block have no relative order, block producers **cannot extract value by reordering transactions**. MEV from ordering is structurally eliminated.

**Limitations:**
- AMMs cannot be implemented natively with commutative semantics; require a sequencer fallback
- Write-skew anomalies possible; contracts must handle their own locks
- Leader-based consensus only (compatible with HotStuff)
- Development complexity higher than sequential programming

**Implementation:** ~30,000 lines of C++, contracts compiled to WebAssembly. Apache 2.0 license. GitHub: `scslab/smart-contract-scalability`

### 5.2 Encrypted Mempools / Threshold Encryption

#### TrX (Aptos Labs, 2025)

**Paper:** "TrX: Encrypted Mempools in High Performance BFT Protocols" (ePrint 2025/2032)

First integration of encrypted mempools with high-performance BFT consensus.
- Uses **batched threshold encryption** to hide transaction contents until after ordering
- **Only 27ms (14%) overhead** over baseline BFT
- Shows that "robust MEV protection and high performance can coexist"

#### Aptos Encrypted Mempool (Production)

- Batched threshold decryption: validators collectively decrypt entire batches in a single operation
- Orders of magnitude reduction vs per-transaction decryption
- Production-deployed on Aptos

#### Ferveo (Anoma/Namada)

- Threshold decryption scheme specifically designed for BFT networks

**Trade-off:** Collusion of 2/3+ voting power could still decrypt early. But this is a much higher bar than a single proposer.

### 5.3 Masquerade (Ohio State University, 2025)

**Paper:** "Masquerade: Simple and Lightweight Transaction Reordering Mitigation in Blockchains" (arXiv:2308.15347, ACM DLT 2025)

**Authors:** Arti Vedula, Shaileshh Bojja Venkatakrishnan, Abhishek Gupta

**Approach:** Token-based ordering mechanism — no encryption, no cryptographic overhead:
- Users purchase sequentially-numbered ordering tokens
- Embed token numbers in transactions
- Block builder **must** order transactions strictly by token number
- Game-theoretic analysis shows rational adversaries lose reordering profit

**Result:** ~70% reduction in successful MEV attacks with zero cryptographic overhead.

**Status:** Published in ACM DLT journal (2025). No public implementation found. Consensus-agnostic.

### 5.4 Fair Ordering Protocols

#### Themis (Kelkar et al., 2021)

- Defines **order-fairness**: if sufficiently many honest nodes receive tx1 before tx2, tx1 must be ordered first
- **Bootstrapped from HotStuff** — minimal code changes
- Leader collects ordering metadata, executes ordering algorithm, proposes fair batch
- Strong fairness guarantee with guaranteed liveness

#### Aequitas (Kelkar, Zhang et al., 2020)

- First protocol to define order-fairness
- Tolerates up to n/4 Byzantine faults (weaker than HotStuff's n/3)
- Liveness issues fixed by Themis

### 5.5 Frequent Batch Auctions (FBA)

All orders within a time window are matched at a **uniform clearing price.** Eliminates front-running because:
- All orders in a batch get the same price
- No advantage to being first within a batch
- Sequential price differences don't exist for sandwiching

**Injective's implementation:**
1. Orders accumulate during block interval (sealed, invisible)
2. At block end, uniform clearing price computed to maximize volume
3. Market orders execute against resting book at this price
4. Same-price orders filled **pro-rata** (not time-priority)

**For perps:** Largely solves MEV with caveats:
- Eliminates reordering MEV (sandwich, front-running) ✓
- Eliminates speed-based MEV ✓
- Does NOT eliminate information-based MEV (superior oracle data)
- Introduces discrete-time risk between batches

### 5.6 MEV Strategy Comparison

| Strategy | Used By | MEV Reduction | Latency Overhead | Complexity |
|----------|---------|---------------|------------------|------------|
| **Speed-based** | Hyperliquid | Low-moderate | None | Low |
| **Encrypted mempool (TrX)** | Aptos | High | 27ms (14%) | Medium |
| **Groundhog (no ordering)** | Research | Very high | None | High |
| **FBA (batch auctions)** | Injective | Very high | 1 block interval | Medium |
| **Masquerade (token ordering)** | Research | ~70% | None | Low |
| **Themis (fair ordering)** | Research | High | Moderate | Medium |
| **TEE-based** | Silhouette | High | Moderate | Medium |

### 5.7 Recommended MEV Stack: Groundhog + FBA + Encrypted Mempool

The three mechanisms are complementary:

```
Order Lifecycle:

1. Trader encrypts order with threshold public key
2. Encrypted order enters mempool (proposer can't read it)
3. Proposer includes encrypted orders in block proposal
4. Validators reach consensus on block (2-phase HotStuff)
5. Threshold decryption reveals orders
6. Groundhog execution: all orders read same state snapshot
7. FBA matching engine runs as block-level operation:
   - Compute uniform clearing price per market
   - Match orders at clearing price (pro-rata at same price)
   - Apply commutative balance updates
8. State committed — instant finality
```

**Result:**
- Pre-trade privacy (encrypted mempool) — can't see orders before inclusion
- No ordering advantage (Groundhog) — no intra-block transaction order
- Fair execution (FBA) — uniform price, pro-rata fills
- Sub-200ms finality (2-phase HotStuff)

---

## 6. Fully On-Chain Order Book Architectures

### 6.1 Hyperliquid — Continuous Matching

- Matching engine embedded in consensus layer
- Every order/cancel/match is a blockchain transaction
- Price-time priority, continuous matching
- 200K orders/sec, 70ms finality
- **MEV defense:** Speed-based only

### 6.2 Sei Network — Twin-Turbo Consensus

**Two optimizations on Tendermint BFT:**

1. **Intelligent block propagation:** Proposers send only transaction hashes; validators reconstruct from local mempool cache
2. **Optimistic block processing:** Validators execute transactions before prevote/precommit rounds complete

**Parallel Execution (OCC):**

| Workload | Sequential | Parallel | Speedup |
|---|---|---|---|
| Simple transfers | 3,000 TPS | 15,000+ TPS | 5x |
| ERC-20 transfers | 2,200 TPS | 9,500+ TPS | 4.3x |
| DEX swaps | 800 TPS | 2,800+ TPS | 3.5x |

- Native order-matching engine at the base layer (not a smart contract)
- ~400ms finality
- **Sei Giga:** 5 gigagas/second, targeting ~200K TPS

### 6.3 Injective — Frequent Batch Auctions

Exchange module built into Cosmos SDK appchain. Orders NOT matched continuously:

1. During block interval, incoming orders are **queued and invisible**
2. At block end, batch auction executes:
   - Market orders execute against resting book at **uniform clearing price**
   - Limit orders match against each other and resting book
   - Clearing price chosen to **maximize traded volume**
3. Same-price orders filled **pro-rata** (not time-priority)

**MEV elimination:** Sealed bid + discrete time + uniform price = no reordering profit.

**Skip Protocol integration** for additional MEV monitoring.

### 6.4 dYdX v4 — Hybrid In-Memory + On-Chain Settlement

- Cosmos appchain (CometBFT + Cosmos SDK)
- Order book lives **in-memory on each validator** (NOT committed to consensus state)
- Order placement/cancellation: gossipped P2P, **zero gas fees**
- Matching: each validator runs deterministic matching engine (memclob)
- **Only fills go to consensus** — order book itself is ephemeral

**Proposed FBA with ABCI++ Vote Extensions:**
1. Validators sign vote extensions containing order hashes for next FBA
2. Proposer must include orders referenced by ≥2/3 of stake-weighted vote extensions
3. Uniform-price batch auction on included orders
4. Validators verify auction results

### 6.5 Monad — Parallel EVM Execution

Not a DEX but an execution layer enabling on-chain CLOBs on EVM:
- MonadBFT: 400ms blocks, 800ms finality
- Deferred (async) execution: consensus and execution decoupled
- Optimistic parallel execution with OCC conflict detection
- Full EVM bytecode compatibility
- Target: 10,000+ TPS

### 6.6 Order Cancellation at Scale

| Approach | Used By | Mechanism |
|---|---|---|
| Cancels never touch consensus | dYdX v4 | In-memory only; zero gas. Only fills go on-chain. |
| Ultra-high-throughput chain | Hyperliquid | 200K ops/sec makes cancel spam feasible. Cancels prioritized. |
| Batch auctions absorb cancels | Injective | Orders queued per block. Cancel before auction = trivial. |

Market makers cancel 10-100x more than they fill. This is a critical design consideration.

### 6.7 Minimum Latency Requirements

| Protocol | Finality | Assessment |
|---|---|---|
| Hyperliquid | 70ms block, 200ms e2e | Closest to CEX |
| Sei | 400ms | Adequate for most DeFi |
| Injective | ~1-2s (intentional for FBA) | Acceptable — fairness > speed |
| dYdX v4 | ~1s blocks (orders match instantly in memory) | Hybrid approach |
| Monad | 400ms blocks, 800ms finality | Competitive |

**Threshold for competitive perp trading:** Sub-500ms finality. Below 200ms approaches CEX-level.

---

## 7. Dark Pool Research

### 7.1 What Are Dark Pools?

Private trading venues where orders are not displayed on a public order book before execution:
- **Pre-trade opacity:** Order size and price hidden until after execution
- **Post-trade reporting:** Trades reported after execution
- **Price discovery:** Reference prices from public ("lit") markets
- **Participants:** Primarily institutional traders executing large block orders

### 7.2 Benefits for a Perps DEX

| Benefit | Description |
|---|---|
| **Reduced price impact** | Large orders ($1M+) don't move the public order book |
| **Institutional appeal** | Table stakes for serious trading desks — hedge funds, prop firms won't trade where flow is fully transparent |
| **MEV protection** | Eliminates pre-trade information leakage |
| **Better execution** | Market makers offer tighter spreads (less adverse selection) |
| **Increased liquidity** | Dark pool volume complements public book |
| **Liquidation protection** | Unwind large positions without cascading price impact |

**Perps-specific use cases:**
- Basis trades (spot vs perp)
- Portfolio rebalancing across multiple perps
- Funding rate manipulation prevention (large visible positions)

### 7.3 DeFi Dark Pool Technologies

| Approach | Privacy | Latency | Complexity | Trust Model |
|----------|---------|---------|------------|-------------|
| **Off-chain RFQ + on-chain settlement** | Moderate | Low (~1s) | Low | Trust market makers |
| **MPC Matching (Renegade-style)** | High | Medium (~5-10s) | High | Trustless |
| **ZK Commit-Reveal** | High | Medium (2 blocks) | Medium | Trustless |
| **Intent/Solver Architecture** | Moderate | Low (~1-5s) | Medium | Trust solvers + competition |
| **FHE Matching** | Highest | High (~30s+) | Very High | Trustless |

### 7.4 Key DeFi Dark Pool Projects

| Project | Approach | Status |
|---------|----------|--------|
| **Renegade** | MPC-based, collaborative ZK-SNARKs | Live on Arbitrum |
| **Penumbra** | Privacy-focused Cosmos chain, ZK proofs, batch auctions | Mainnet 2024 |
| **Railgun** | Privacy system, shields balances via ZK proofs | Live, multi-chain |
| **Portal Gate** | ZK-based order book with hidden orders | In development |
| **Panther Protocol** | ZK-based compliance-focused privacy | Testnet |
| **Tristero** | MPC matching on Solana | Early stage |

### 7.5 Dark Pool Integration Architecture

The dark pool is **protocol-level technology**, not a third-party service. It is built into UltraFast's consensus and execution layer using cryptographic primitives:

```
┌──────────────────────────────────────────────────────────┐
│                    UltraFast L1 Protocol                   │
│                                                            │
│  ┌────────────────────┐     ┌──────────────────────────┐  │
│  │  Public FBA Book    │     │  Dark Pool Module        │  │
│  │  (Threshold-        │     │  (Protocol-native:       │  │
│  │   encrypted orders, │◄───►│   MPC+ZK matching,       │  │
│  │   batch auction)    │     │   collaborative SNARKs,  │  │
│  │                     │     │   ZK settlement proofs)  │  │
│  └──────────┬─────────┘     └──────────┬───────────────┘  │
│             │                          │                    │
│             ▼                          ▼                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │       Consensus + Settlement Layer (HotStuff)         │  │
│  │       (All proofs verified on-chain)                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  Liquidity providers (market makers) participate on both:  │
│  ┌────────────────────┐     ┌──────────────────────────┐  │
│  │  Retail + Algo Flow │     │  Institutional MMs       │  │
│  │  (public book)      │     │  (DWF, Wintermute, GSR)  │  │
│  └────────────────────┘     └──────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Order flow logic:**
1. Orders above size threshold or with "dark" flag route to dark pool
2. **RFQ:** Designated market makers (DWF, Wintermute, GSR) provide private quotes
3. **Intent/solver auction:** Multiple solvers compete to fill (UniswapX-style)
4. Unfilled remainder optionally routes to public FBA book
5. All trades settle on-chain — pre-trade privacy only

**Price protection mechanisms:**
- Minimum execution size (MES) — prevents info leakage from small partial fills
- Price collars — only execute within X% of public market price
- Time limits — orders expire to prevent stale execution

### 7.6 Phased Dark Pool Rollout

1. **Phase 1:** RFQ system — designated MMs provide private quotes for large orders. Minimal cryptography needed.
2. **Phase 2:** Intent/solver auction — multiple solvers compete to fill dark orders, improving execution quality.
3. **Phase 3:** ZK/MPC-based matching for fully trustless dark pool (Renegade-style).

### 7.7 Regulatory Considerations

| Risk | Mitigation |
|------|-----------|
| Securities classification | CFTC jurisdiction for perps (not SEC) |
| Market manipulation concerns | On-chain settlement provides audit trail |
| MiCA transparency requirements | Post-trade transparency (on-chain) |
| KYC/AML tension | ZK-based KYC (prove compliance without revealing identity) |
| Best execution requirements | Oracle-based price benchmarking vs public markets |

### 7.8 ZK Dark Pool Deep Dive: Protocol-Level Research

> **Research date:** 2026-03-24
> **Scope:** Technical deep dive into Renegade, Penumbra, Aztec, and emerging ZK-based dark pool protocols, with analysis of applicability to perpetual futures.

---

#### 7.8.1 Renegade Protocol -- Technical Deep Dive

**Overview:** Renegade is a non-custodial, fully on-chain dark pool live on Arbitrum (launched September 3, 2024). It uses a hybrid MPC + ZK-SNARK architecture to achieve both pre-trade and post-trade privacy. All trades match at the midpoint of Binance's bid-ask spread (no spread, no price impact).

**Proof System: Collaborative PLONKs via MPC-Jellyfish**

| Property | Detail |
|---|---|
| **Base proof system** | PLONK (via custom `mpc-jellyfish` library) |
| **MPC wrapping** | Collaborative SNARK framework (Ozdemir et al., USENIX Security 2022) |
| **Curve** | BN254 (for EVM verification compatibility) |
| **Implementation** | Rust, `no_std` compliant, WASM-compatible |
| **Settlement contracts** | Solidity on Arbitrum (Stylus for gas-efficient verification) |
| **Smart contract verifier** | On-chain PlonK verifier enforces predicates on Merkle tree commitments |

**How Collaborative SNARKs Work:**

The key innovation is wrapping zero-knowledge proof generation inside an MPC protocol. Rather than a single prover generating a proof, two relayers (one per trader) collaboratively generate a single PLONK proof without either party revealing their private witness (order details, balances) to the other.

1. Each trader's relayer holds a **secret share** of the combined witness (order + balance state)
2. The proof generation algorithm (PLONK prover) is run as a **2-party MPC** between the two relayers
3. The output is a single, valid PLONK proof that can be verified by anyone (including the on-chain contract)
4. Neither relayer learns the other party's order details, balances, or trading history

**Performance (Ozdemir et al. benchmarks):**
- Over a 3 Gb/s link, malicious-minority security = ~same runtime as single prover
- Malicious-majority (N-1 corrupt) security = ~2x slowdown vs single prover
- Subsequent work (2024): 128 machines + 4 Gbps network -> proof for 2^23 gate circuit in ~2.5 seconds
- A new MPC-friendly permutation check for PLONK arithmetization enables 30x speedup with 128 distributed servers on 2^21 gate circuits

**Renegade Production Performance:**

| Metric | Value |
|---|---|
| **Matching latency** | < 1 second |
| **Gas cost per trade** | < $1 (Arbitrum, ~$0.30 with Stylus) |
| **Protocol fee** | 2 basis points (0.02%) |
| **Price source** | Binance midpoint (best bid + best ask / 2) |
| **Proof verification** | On-chain PlonK verifier on Arbitrum |

**Architecture: Relayers, Matching Engine, Settlement**

```
Trader A                          Trader B
   |                                 |
   v                                 v
Relayer A <---- P2P Gossip -----> Relayer B
   |          (encrypted order       |
   |           state gossip)         |
   |                                 |
   +--------- 2-Party MPC ----------+
              |
              v
        VALID MATCH MPC
        (collaborative PLONK proof)
              |
              v
    +---------------------+
    |  Arbitrum L1 (Stylus)|
    |  - PlonK verifier    |
    |  - Merkle state tree |
    |  - Balance updates   |
    +---------------------+
```

**Proof Statements (NP statements proven in zero-knowledge):**

| Statement | Purpose |
|---|---|
| `VALID WALLET CREATE` | Proves correct initialization of a new wallet commitment in the Merkle tree |
| `VALID WALLET UPDATE` | Proves a wallet state transition (deposit, withdraw, order placement) is valid |
| `VALID COMMITMENTS` | Proves a relayer knows valid order/balance data matching public commitments (gossiped to network) |
| `VALID MATCH MPC` | Core matching proof: both traders have valid orders + balances, matching engine executed correctly, token outputs correctly encrypted |
| `VALID RELAYER FEE SETTLEMENT` | Proves correct fee distribution to relayers |

**State Model:**
- On-chain: Merkle tree of **opaque, blinded commitments** to user "wallets" (containing balances, orders, keys)
- Off-chain: Each relayer maintains plaintext state of its own users' wallets
- The on-chain contract never sees wallet contents -- only verifies ZK proofs of valid state transitions

**Trade Lifecycle:**
1. Wallet creation -> `VALID WALLET CREATE` proof submitted, commitment inserted into Merkle tree
2. Deposit/order placement -> `VALID WALLET UPDATE` proof transitions wallet state
3. Relayers gossip encrypted order state, broadcast `VALID COMMITMENTS` proofs
4. When a potential match is found, relayers execute **2-party MPC** to run the matching engine
5. MPC output = collaborative `VALID MATCH MPC` proof
6. Proof submitted on-chain -> Arbitrum verifies, updates Merkle state atomically
7. Settlement is atomic: neither party can exit after MPC execution begins

**Open Source:**
- Main repo: [renegade-fi/renegade](https://github.com/renegade-fi/renegade) -- Rust, 2,250+ commits, 7 contributors
- MPC-Jellyfish: [renegade-fi/mpc-jellyfish](https://github.com/renegade-fi/mpc-jellyfish) -- Custom PLONK with MPC extensions
- Contracts: [renegade-fi/renegade-contracts](https://github.com/renegade-fi/renegade-contracts) -- Solidity (Stylus)
- Bug bounty: Active on Code4rena
- Whitepaper: [whitepaper.renegade.fi](https://whitepaper.renegade.fi) (v0.6, by Christopher Bender)

**Can Renegade's Approach Extend to Perpetual Futures?**

| Challenge | Difficulty | Notes |
|---|---|---|
| **Margin calculations in ZK** | High | Need to prove sufficient margin without revealing position size or leverage -- requires additional ZK circuits for margin validation |
| **Funding rate computation** | High | Funding rates depend on aggregate open interest -- contradicts per-trade privacy model |
| **Liquidation triggers** | Very High | Core problem CZ identified: if liquidation prices are private, who triggers liquidation? Requires a private oracle or threshold mechanism |
| **Mark price oracle** | Medium | Already uses Binance midpoint; extending to funding/mark price is feasible |
| **Multi-leg positions** | High | Perps require position netting, PnL tracking -- significantly more complex wallet state |
| **Insurance fund interaction** | Medium | Socialized losses need aggregate data that conflicts with per-wallet privacy |

**Assessment:** Renegade's architecture is **theoretically extensible** to perps but would require substantial new circuit development. The fundamental tension is that perpetual futures require **system-level aggregate state** (total open interest, funding rates, insurance fund) that is at odds with per-wallet privacy. A hybrid approach -- private order flow + matching (Renegade-style) with public aggregate metrics -- is the most realistic path.

**2025-2026 Updates:**
- Live on Arbitrum One and Base
- Stylus integration for gas-efficient settlement (~$0.30 per trade)
- Active development (2,250+ commits on main branch)
- Bug bounty program active on Code4rena
- No announced plans for perpetual futures support

---

#### 7.8.2 Penumbra -- Shielded DEX Architecture

**Overview:** Penumbra is a privacy-focused Layer 1 Cosmos appchain with a built-in shielded DEX called ZSwap. Mainnet launched in 2023. Uses a UTXO model with ZK proofs for all state transitions.

**Proof System:**

| Property | Detail |
|---|---|
| **Proof system** | Groth16 (via Arkworks) |
| **Curve** | BLS12-377 (pairing-friendly) |
| **Group** | decaf377 (prime-order group from Decaf construction on BLS12-377 Edwards curve) |
| **Key hierarchy** | Based on Zcash Sapling design (modified) |
| **Proving time** | < 1.3 seconds for 3-action transaction on M1 MacBook (concurrent proving) |
| **Proof size** | ~200 bytes (Groth16 advantage) |
| **Design rationale** | Chose Groth16 over PLONK for smaller proofs and mature production track record |

**How Shielded Swaps Work:**

1. **Client-side proving:** Users generate ZK proofs locally (spend proofs, output proofs) -- the chain never sees plaintext amounts or addresses
2. **State commitment tree:** Incremental Merkle tree of public commitments to private notes (similar to Zcash)
3. **Swap intents:** Users submit encrypted swap intents (not visible on-chain as individual orders)
4. **Sealed-bid batch auction:** All swap intents for a trading pair are batched per block and executed at a single clearing price
5. **No intra-block ordering:** Eliminates time-based MEV (front-running, sandwich attacks)
6. **Private outputs:** Claimed swap outputs are minted directly into the shielded pool -- values never revealed to the network

**Concentrated Liquidity Model:**
- Each LP position = its own **constant-sum (fixed-price) AMM**
- Positions are anonymous (no identity linkage)
- Many individual positions approximate arbitrary trading functions
- Similar to an order book: each position is a limit order at a fixed price
- Fee tiers are per-position (like Uniswap v3)

**Privacy Properties:**

| Property | Status |
|---|---|
| Swap intent amounts | Hidden (ZK) |
| Trader identity | Hidden (shielded pool) |
| Net flow per pair per block | **Public** (revealed by batch execution) |
| Individual trade details | Hidden |
| LP position amounts | Public (trading function disclosed) |
| LP identity | Hidden |

**Could Penumbra Support Perpetual Futures?**

- **Pro:** Sealed-bid batch auctions eliminate front-running and MEV structurally -- ideal for perps
- **Pro:** Client-side proving keeps positions private
- **Pro:** Cosmos/IBC interoperability for cross-chain collateral
- **Con:** Groth16 requires per-circuit trusted setup -- new circuits for margin, liquidation, funding would each need ceremonies
- **Con:** Batch-per-block execution (5-6 second blocks) may be too slow for perps traders expecting sub-second
- **Con:** No existing margin engine, liquidation system, or funding rate mechanism
- **Con:** Constant-sum LP positions don't naturally support leveraged instruments

**Assessment:** Penumbra's batch auction + privacy model is conceptually aligned with a private perps DEX, but the protocol would need fundamental extensions. The Groth16 per-circuit setup requirement makes rapid iteration on new circuit types (margin, liquidation, funding) difficult. More suitable as **inspiration for the privacy model** than as a direct technical foundation.

**Current Stats (as of 2026):**
- ~$3.77M shielded value across IBC
- ~$3.77M 30-day trading volume
- Modest adoption but proving the shielded DEX concept works in production

---

#### 7.8.3 Aztec Network -- Private DeFi Infrastructure

**Overview:** Aztec is a ZK-rollup privacy L2 on Ethereum. The Aztec Ignition Chain launched in November 2025 as the first decentralized privacy-preserving L2, with 185+ operators across 5 continents and 3,400+ sequencers.

**Noir Language:**

| Property | Detail |
|---|---|
| **Language** | Noir -- Rust-like syntax for ZK circuit development |
| **Status** | Noir 1.0 pre-release (stable, production-grade) |
| **Abstraction** | Hides cryptographic complexity; any developer can write ZK apps |
| **Backend** | Compiles to arithmetic circuits; supports multiple proof backends |
| **Framework** | Aztec.nr -- private smart contract framework built on Noir |
| **Proving** | CHONK: HyperNova-style folding scheme for chains of private function calls |
| **Recursion** | Goblin: recursion acceleration scheme |

**Private DeFi Primitives:**
- Private state: encrypted contract storage only accessible to authorized parties
- Private functions: execution proofs generated client-side, verified on-chain
- Public/private composability: contracts can have both public and private methods
- Aztec Connect (predecessor): enabled private interactions with Aave, Compound, Uniswap

**Could Aztec Support a Private Perps DEX?**

| Aspect | Assessment |
|---|---|
| **Private order submission** | Yes -- Noir circuits can encode order validation logic with private inputs |
| **Private matching** | Partially -- matching requires comparing orders, which needs either MPC or a trusted sequencer |
| **Margin computation** | Yes -- Noir can encode margin checks as private functions, proving sufficient collateral without revealing amounts |
| **Liquidation** | Challenge -- requires someone to observe when margin is insufficient; private positions make this hard |
| **Funding rates** | Challenge -- requires aggregate position data that conflicts with per-position privacy |
| **Performance** | Concern -- L2 block times and ZK proving overhead may not meet perps latency requirements |
| **Ecosystem** | Strong -- 185+ operators, mature tooling, Ethereum settlement security |

**Assessment:** Aztec/Noir provides the **best general-purpose ZK development framework** for building private DeFi. If building a private perps DEX as an app (rather than a custom L1), Aztec is the strongest platform candidate. The Noir language significantly reduces development friction compared to raw circuit development. However, the L2 model imposes latency constraints that may not meet institutional perps requirements. Best suited for a **Phase 3 ZK dark pool module** that could be deployed on Aztec and bridged to UltraFast.

---

#### 7.8.4 Emerging ZK Dark Pool Projects (2025-2026)

**Defx -- Purpose-Built Dark Pool L1 for Perpetual Futures**

| Property | Detail |
|---|---|
| **Type** | Custom Layer 1 blockchain for perps |
| **Funding** | $2.5M seed (Pantera Capital, CMT Digital, Gumi Cryptos, CoinShares, Robot Ventures) |
| **Announced** | June 2025 |
| **Matching** | Sub-millisecond CLOB |
| **Privacy** | ZK proofs encrypt orderbooks: size, leverage, liquidation levels hidden; only execution proof revealed |
| **Settlement** | On-chain, cross-chain deposits from Solana, Ethereum, Arbitrum, Base, Berachain |
| **Assets** | Crypto, FX, commodities, TradFi indices, interest rate perps |
| **Collateral** | Stablecoins, top crypto, yield-generating tokens |
| **Closest competitor to UltraFast concept** | **Yes -- this is the most directly comparable project** |

> **Key insight:** Defx validates the UltraFast thesis -- a purpose-built L1 for private perps is now an active competitive category. Their $2.5M seed from top-tier investors (Pantera, CoinShares) confirms market demand.

**Polyhedra Network -- Fully On-Chain Dark Pool DEX Proposal**

Polyhedra proposed a 3-phase approach to building a fully private on-chain DEX:
1. **Phase 1:** Spot + basic perps, trader identities hidden but trade details (price, size, liquidation) public
2. **Phase 2:** Orders encrypted with public-key crypto, stored encrypted on-chain. Matching engine sees plaintext but is ZK-constrained for fairness
3. **Phase 3:** Matching engine operates entirely on ciphertext (threshold encryption + MPC). No party sees plaintext order details

Uses Polyhedra's proprietary **Expander** ZK framework. Scheduled for Q3 2025.

**Portal Gate -- FHE-Based Dark Pool**

| Property | Detail |
|---|---|
| **Matching** | Off-chain nodes run order matching inside **FHE environment** |
| **Privacy** | API node encrypts orders, generates ZK proof, relays to matching "Book" |
| **Result** | Only aggregate matched result revealed; individual order details hidden |
| **Compliance** | ZK-KYC/KYB via Keyring partnership |
| **Funding** | $1.1M seed |
| **Limitation** | FHE matching is orders of magnitude slower than MPC (~30s+ for 100 participants) |

**Tristero -- TEE-Based Dark Pool**

| Property | Detail |
|---|---|
| **Approach** | TEE (Trusted Execution Environment) for order matching |
| **Matching** | Encrypted orders matched inside TEE with remote attestation |
| **Latency target** | < 100 ms matching (Q1 2025 target) |
| **Funding** | $4.8M seed (General Catalyst, Steel Perlot) |
| **Trust model** | Hardware trust assumptions (Intel SGX / AMD SEV) |
| **Pricing target** | Better-than-Binance execution pricing |
| **Limitation** | TEE hardware vulnerabilities (side-channel attacks), not fully trustless |

**Panther Protocol -- Compliance-Focused Privacy**

| Property | Detail |
|---|---|
| **Approach** | Multi-Asset Shielded Pools (MASPs) with ZK proofs |
| **Key feature** | "Panther Zones" -- institutional trading environments with custom asset lists, user lists, transaction limits |
| **Compliance** | ZK-KYC built in; partnerships with Eurobit (VASP license), PureFi (KYC/KYT) |
| **MEV protection** | zTrade: direct maker-taker execution via ZK proofs |
| **Audit** | Veridise audit of smart contracts and ZK circuits completed |
| **Status** | Approaching mainnet launch |
| **Relevance** | Compliance model for institutional dark pool access tiers on UltraFast |

**Spectre (0x0.ai) -- Privacy Perpetuals DEX**

| Property | Detail |
|---|---|
| **Type** | Privacy-focused perpetual futures DEX |
| **Privacy tech** | ZK proof circuits optimized for BSC gas structure |
| **Features** | Cross-chain relayer logic for anonymous transaction routing |
| **Status** | Scheduled Q4 2025 |
| **Risk** | Regulatory scrutiny, competition from established DEXs |

**ZK-DEX (Independent Project)**

| Property | Detail |
|---|---|
| **Type** | Privacy-preserving dark pool perpetual exchange |
| **Privacy** | ZK proofs for orders, trades, collateral management |
| **Roadmap** | Testnet Q3 2025, security audits Q4 2025, mainnet Q4 2025 |
| **Status** | Early development |

**CZ's Dark Pool Perp DEX Proposal (June 2025)**

Changpeng Zhao publicly called for a dark pool-style perpetual DEX, catalyzing significant industry activity:
- **Problem:** On perp DEXs, liquidation points are visible on-chain -> adversarial liquidation hunting
- **Proposal:** Hide order book entirely or delay visibility of deposits; use ZK proofs for privacy
- **Impact:** Triggered Polyhedra's proposal, accelerated Defx fundraise, inspired multiple new projects
- **Significance:** Validated the thesis that private perps is a major unmet market need

---

#### 7.8.5 Privacy Technology Comparison for Perpetual Futures

| Technology | Privacy Level | Latency | Trust Model | Perps Feasibility | Maturity |
|---|---|---|---|---|---|
| **MPC matching (Renegade)** | High | ~1s (2-party) | Trustless | Medium -- needs margin/liquidation circuits | Production |
| **Collaborative SNARK** | High | ~2.5s (distributed) | Trustless | Medium -- same circuit challenges | Research/Production |
| **TEE matching (Tristero)** | High* | < 100 ms | Hardware trust | High -- fast enough for perps | Early production |
| **FHE matching (Portal Gate)** | Highest | ~30s+ (100 participants) | Trustless | Low -- too slow for active perps trading | Experimental |
| **Sealed-bid batch (Penumbra)** | High | Per-block (~5-6s) | Trustless | Medium -- eliminates MEV but slow | Production |
| **ZK commit-reveal** | High | 2 blocks | Trustless | Medium -- latency acceptable for FBA model | Mature |
| **Threshold encryption (TrX)** | Medium-High | < 500 ms overhead | n/3+1 threshold | High -- compatible with fast consensus | Research |
| **Noir/Aztec private contracts** | High | L2 block time | L2 trust model | Medium -- flexible but latency constrained | Production (Nov 2025) |

*TEE privacy depends on hardware security assumptions; vulnerable to side-channel attacks.

**Flashbots Dark Pool Design Playbook findings (2024):**
- FHE: 4-6 orders of magnitude latency overhead currently; hardware acceleration may reduce by 2 OOM in coming years
- MPC: ~30 seconds for 100 participants (but Renegade's 2-party optimization brings this to <1s)
- TEE: Fastest practical option but not fully trustless
- Recommendation: Hybrid approaches (e.g., TEE for speed + ZK for verification) emerging as practical middle ground

---

#### 7.8.6 The Core Challenge: Private Perpetual Futures

Extending dark pool technology from spot trading to perpetual futures introduces several fundamental challenges that no existing protocol has fully solved:

**1. Private Liquidation Mechanism**

The central unsolved problem. In perpetual futures:
- Positions must be liquidated when margin is insufficient
- Someone must observe margin ratios to trigger liquidation
- But if positions are private, no one can observe margin ratios

**Potential approaches:**
- **Self-reporting with ZK penalties:** Traders periodically submit ZK proofs that their margin is sufficient. Failure to submit = automatic liquidation. Challenge: timing, incentive to delay
- **Threshold-decrypted liquidation checks:** Position data encrypted under threshold key. Validators can decrypt only to check liquidation conditions (not balances/sizes). Requires careful circuit design
- **MPC-based margin oracle:** Dedicated MPC committee continuously evaluates margin conditions against price feeds without seeing individual positions
- **TEE-based liquidation engine:** Liquidation logic runs inside TEE, sees positions in plaintext but cannot leak. Fastest but hardware-trust dependent

**2. Private Funding Rate Computation**

Funding rates require aggregate data (total long OI vs short OI). With private positions:
- Cannot compute funding rate without knowing aggregate open interest
- **Approach:** Homomorphic aggregation -- each position contributes an encrypted OI delta; system sums encrypted values, decrypts only the aggregate

**3. Private Insurance Fund / Socialized Loss**

When a position is liquidated at a loss beyond margin:
- Insurance fund covers the gap
- If insurance fund depleted -> socialized losses across winning positions
- Both require knowing position details

**Approach:** Same homomorphic/MPC aggregate techniques as funding rate, but more complex for loss allocation

**4. Mark Price with Privacy**

Mark price typically combines index price (external oracle) + funding premium:
- Index price: Can be public (external oracle feed)
- Funding premium: Depends on aggregate private state
- Needs careful design to avoid information leakage through mark price changes

---

#### 7.8.7 Academic Papers & Foundational Research

**Collaborative ZK-SNARKs:**

| Paper | Authors | Venue/Year | Key Contribution |
|---|---|---|---|
| [Experimenting with Collaborative zk-SNARKs](https://www.usenix.org/conference/usenixsecurity22/presentation/ozdemir) | Ozdemir, Boneh | USENIX Security 2022 | Foundational paper: lifts Groth16, Marlin, PLONK into MPC for distributed witness proving. Renegade's theoretical basis |
| [Scalable Collaborative zk-SNARK](https://eprint.iacr.org/2024/143) | Liu et al. | ePrint 2024 / USENIX 2025 | 128-server distributed proving, 2^23 gates in 2.5s, MPC-friendly permcheck for PLONK, 30x speedup over local prover |
| [Scalable Collaborative zk-SNARK: Proof Delegation](https://eprint.iacr.org/2024/940) | Liu et al. | ePrint 2024 | HyperPlonk-based, sublinear communication for data-parallel circuits |
| [Malicious Security in Collaborative zk-SNARKs](https://link.springer.com/chapter/10.1007/978-3-032-01907-3_13) | Various | Springer 2024 | Security analysis of malicious-adversary setting for collaborative SNARKs |
| [Jigsaw: Doubly Private Smart Contracts](https://eprint.iacr.org/2025/1147) | Garg, Goel | ePrint 2025 | Privacy for both function and data in smart contracts -- relevant to private matching engines |

**Private Auctions & Sealed-Bid Mechanisms:**

| Paper | Authors | Year | Key Contribution |
|---|---|---|---|
| [Cryptobazaar: Private Sealed-bid Auctions at Scale](https://eprint.iacr.org/2024/1410) | Novakovic, Kavousi, Gurkan, Jovanovic | 2024 | 128 bidders, 1024 price range, < 0.5 sec, ~32 KB per bidder. Distributed logical-OR on unary-encoded bids + novel ZK succinct arguments. Supports 1st, 2nd, (p+1)st-price auctions |
| [zk-STARKs based sealed auctions](https://ietresearch.onlinelibrary.wiley.com/doi/10.1049/blc2.12090) | Wei | 2024 | zk-STARK approach (no trusted setup) for on-chain sealed auctions |
| [Zk-Auction: Cross-Blockchain System](https://dl.acm.org/doi/10.1145/3654522.3654589) | Various | ACM 2024 | Cross-chain auction combining ZK proofs with NFTs for bid verification |
| [Zero-Deposit Sealed-bid Auction](https://eprint.iacr.org/2024/189) | Various | 2024 | Removes deposit requirement while maintaining bid credibility |
| [Fast and Gas-efficient Private Sealed-bid Auctions](https://hal.science/hal-05061427/document) | Various | 2024 | Optimized for on-chain gas costs |

**Private Set Intersection (PSI) -- Relevant to Order Matching:**

| Paper | Authors | Key Contribution |
|---|---|---|
| [Privacy-Preserving Set Operations](https://www.cs.cmu.edu/~leak/papers/set-tech-full.pdf) | Kissner, Song (CMU) | ZK proofs for set operations; foundational for private order matching |
| [Multi-Party Privacy-Preserving Set Intersection](https://eprint.iacr.org/2010/512) | Various | Quasi-linear complexity PSI; scalable multi-party version |
| [PSI: A Systematic Literature Review](https://www.sciencedirect.com/science/article/pii/S1574013723000345) | Various (2023) | Comprehensive survey of PSI techniques; taxonomy applicable to order book matching |

**MEV and Private Order Flow:**

| Paper | Authors/Source | Year | Key Contribution |
|---|---|---|---|
| [The Crypto Dark Pool Design Playbook](https://collective.flashbots.net/t/the-crypto-dark-pool-design-playbook/3752) | Flashbots | 2024 | Comprehensive comparison of TEE, MPC, FHE, ZK for dark pools |
| [Formalization of MEV](https://www.sciencedirect.com/science/article/pii/S2096720926000321) | Various | 2025 | Taxonomy of MEV mitigation: PBS, threshold encryption, VDF, mempool secrecy, auction mechanisms, L2 sequencing |
| [ZK Proof Frameworks Survey](https://arxiv.org/html/2502.07063v1) | Various | 2025 | Comprehensive survey of ZK proof frameworks; useful for proof system selection |

---

#### 7.8.8 Recommendations for UltraFast Dark Pool Design

Based on this research, the recommended approach for UltraFast's dark pool module:

**Phase 1 (Launch): RFQ + Intent/Solver -- No ZK Required**
- Designated MMs provide private quotes for large orders
- Solvers compete to fill (UniswapX-style)
- On-chain settlement with pre-trade privacy only
- **Rationale:** Fastest to market, proven model, sufficient for initial institutional adoption

**Phase 2 (6 months post-launch): Threshold-Encrypted Dark Orders**
- Dark orders encrypted under threshold key (validators hold shares)
- Decrypted only at execution time within FBA batch
- Compatible with UltraFast's existing encrypted mempool (TrX) infrastructure
- ZK proofs for margin sufficiency submitted with encrypted orders
- **Rationale:** Leverages existing infrastructure (encrypted mempool), moderate additional complexity

**Phase 3 (12-18 months): Full ZK/MPC Dark Pool**
- Renegade-style collaborative SNARK matching for the dark pool module
- Noir/Aztec circuits for margin verification, position privacy
- MPC-based liquidation checking (dedicated committee)
- Homomorphic aggregation for funding rate computation on private positions
- **Rationale:** Highest privacy guarantees, but requires significant circuit development

**Key Technical Decisions:**

| Decision | Recommended Choice | Rationale |
|---|---|---|
| **Proof system** | PLONK (universal setup) | No per-circuit trusted setup; Renegade has proven MPC-PLONK in production |
| **MPC protocol** | 2-party for matching; n-party threshold for liquidation | 2-party is fast (<1s); threshold for aggregate functions |
| **Liquidation mechanism** | TEE-based initially; migrate to MPC-ZK | TEE provides speed; ZK provides trustlessness |
| **Funding rate** | Homomorphic aggregation of encrypted OI deltas | Preserves privacy while computing aggregate metrics |
| **Compliance** | Panther-style ZK-KYC Zones | Institutional adoption requires compliance; ZK-KYC preserves privacy |
| **Reference implementation** | Study Renegade codebase (Rust, open source) | Most mature ZK dark pool; same language as UltraFast |

**Watch List -- Projects to Monitor:**
1. **Defx** -- Most direct competitor; purpose-built L1 for private perps (Pantera-backed)
2. **Polyhedra dark pool DEX** -- If their Expander-based approach delivers, could set new performance benchmarks
3. **Aztec Noir 1.0** -- Stable ZK language could accelerate circuit development for Phase 3
4. **Collaborative SNARK research** -- Scalable variants (128+ provers, sublinear communication) could enable new architectures
5. **Cryptobazaar** -- Their sealed-bid auction protocol (128 bidders, <0.5s) could be adapted for dark pool batch auctions

---

## 8. Market Making & Liquidity Partners

### 8.1 Dark Pools Are Protocol Technology, Not a Service

**Critical distinction:** A dark pool is a **protocol-level architectural pattern** — encrypted order matching built into the chain's consensus and execution layer using cryptographic primitives (MPC, ZK proofs, threshold encryption, FBA). It is not a product or service purchased from a third party.

UltraFast's dark pool is **native protocol infrastructure:**
- **Encrypted order submission** via threshold encryption (TrX-style)
- **Private matching** via collaborative SNARKs (MPC+ZK, Renegade-style) or sealed-bid FBA
- **ZK settlement proofs** verified on-chain
- **No single party** (including the protocol team) ever sees order details

Market makers like DWF Labs, Wintermute, and GSR are **liquidity participants** on this infrastructure — they provide quotes and fill orders within the dark pool, but they don't build or operate it.

### 8.2 DWF Labs Overview

DWF Labs is one of the largest Web3 market makers and investment firms:
- Founded 2022, spun from Digital Wave Finance (est. 2018)
- Headquartered in Singapore, offices in Dubai, Zurich, Hong Kong
- Trades on 60+ exchanges; top-5 crypto market maker by volume
- Invested in 700+ projects
- Three pillars: Market Making, Venture Investment, OTC Trading

### 8.3 Market Maker Integration Model

Market makers interact with UltraFast as **liquidity providers**, not technology partners:

| Role | Description |
|------|-------------|
| **Public book MM** | Runs bots on UltraFast's public FBA order book, providing liquidity |
| **Dark pool RFQ responder** | Responds to institutional RFQ requests within the protocol's dark pool module |
| **Liquidity seed** | Provides initial market-making capital at launch ($50-100M+) |
| **Token investment** | Invests in UltraFast (typical model: discounted tokens for liquidity commitments) |
| **OTC desk** | Large bilateral trades settled through the dark pool's MPC+ZK matching |

### 8.4 Notable DWF Partnerships

Synthetix ($20M), Fetch.ai, EOS ($60M commitment), Conflux, Mask Network, TON ecosystem, YGG, and hundreds more.

### 8.5 DWF Risks

- Allegations of market manipulation (leaked Binance surveillance report, 2023)
- Token model (discounted tokens → sell pressure after lockup)
- Some projects reported increased volatility rather than stability
- Reputational risk by association

### 8.6 Recommended Multi-Market-Maker Strategy

Don't rely solely on DWF. Target 3-5 market makers:
- **DWF Labs** — aggressive liquidity, OTC network, investment
- **Wintermute** — highest reputation, algorithmic MM
- **GSR** — institutional-grade, derivatives expertise
- **Flow Traders** — traditional finance pedigree
- **Amber Group** — Asia-focused liquidity

---

## 9. MANTRA Ecosystem Synergies

### 9.1 MANTRA Chain Overview

- **Status:** Mainnet live (chain ID: `mantra-1`, launched October 2024)
- **Tech stack:** Cosmos SDK + CometBFT consensus
- **Block time:** ~5-6 seconds
- **Finality:** Instant (CometBFT single-slot)
- **VM:** Dual — CosmWasm (Rust) + EVM compatibility (ethermint)
- **IBC:** Full support for cross-chain asset transfers
- **Focus:** RWA (Real World Asset) tokenization with regulatory compliance

### 9.2 RWA Advantage

MANTRA's RWA infrastructure enables UltraFast to offer unique perpetual markets:

| Asset Class | Examples | Advantage |
|---|---|---|
| **Tokenized commodities** | Gold, oil, carbon credits | Novel on-chain derivatives market |
| **Tokenized equities** | Stocks, indices (SPY, QQQ) | 24/7 trading, global access |
| **FX pairs** | USD/EUR, emerging market currencies | Institutional demand |
| **Real estate indices** | Dubai, Singapore, US markets | Unique to MANTRA ecosystem |
| **Treasury yields** | T-bill rate perps | Interest rate derivatives on-chain |

**Key partnerships:** MAG Group ($1B+ real estate tokenization), DAMAC, Google Cloud (validator infrastructure)

### 9.3 Regulatory Moat

- **VARA license** (Dubai Virtual Assets Regulatory Authority)
- Built-in compliance modules for KYC/AML (permissioned access where needed)
- Security Token Offering (STO) support
- This creates a structural advantage vs Hyperliquid for institutional participation

### 9.4 Integration Points

UltraFast as a custom L1 can integrate with MANTRA ecosystem via:
- **IBC:** Accept MANTRA RWA tokens as collateral, bring in OM stakers
- **Oracle feeds:** Use MANTRA RWA price data for perps settlement
- **Shared compliance:** Leverage MANTRA's KYC infrastructure
- **Cross-chain liquidity:** Tap into MANTRA DEX spot liquidity for oracle TWAP

### 9.5 Collateral Types

| Collateral | Source | Yield |
|---|---|---|
| USDC | Noble (IBC) | Base stablecoin |
| OM | MANTRA | Staking yield as collateral |
| stATOM, stETH | IBC / Bridge | Yield-bearing |
| Tokenized T-bills | MANTRA RWA | ~4-5% yield |
| RWA tokens | MANTRA | Asset-specific |

---

## 10. Proposed Technical Architecture

### 10.1 System Overview

```
UltraFast L1
├── Consensus Layer (Rust)
│   ├── 2-phase pipelined HotStuff (Jolteon-family)
│   ├── MonadBFT tail-forking resistance
│   ├── Threshold encryption (TrX-style, batched)
│   └── VRF leader rotation
│
├── Execution Engine (Rust)
│   ├── Groundhog Commutative Execution
│   │   ├── Snapshot reads (all txs read block-start state)
│   │   ├── Commutative balance updates
│   │   └── Reserve-commit for withdrawals
│   ├── FBA Matching Engine (per-market)
│   │   ├── Uniform clearing price computation
│   │   ├── Pro-rata fills at same price level
│   │   └── Partial fill support
│   └── Risk Engine
│       ├── Portfolio margin calculation
│       ├── Gradual liquidation engine
│       └── Insurance fund management
│
├── State Layer
│   ├── Accounts & balances (commutative integers)
│   ├── Order book state (per-market resting orders)
│   ├── Position state (per-account per-market)
│   └── Oracle price feeds (Pyth + custom TWAP)
│
├── Dark Pool Module
│   ├── RFQ engine (designated market makers)
│   ├── Intent/solver auction for block trades
│   └── Settlement through same FBA engine
│
├── Compliance Layer (optional)
│   ├── zk-KYC (Privado ID / Polygon ID)
│   ├── Permissioned pools (institutional tier)
│   └── Geofencing
│
└── Networking
    ├── IBC module (Cosmos interop, Noble USDC)
    ├── EVM bridge (Ethereum/Arbitrum deposits)
    └── P2P gossip (libp2p)
```

### 10.2 Performance Targets

| Metric | Target | Hyperliquid Benchmark |
|--------|--------|-----------------------|
| Order throughput | 200K+ ops/sec | 200K ops/sec |
| Block finality | <200ms | ~70ms |
| E2E order latency | <500ms | ~200ms median |
| Markets supported | 100+ | 100+ |
| Max leverage | 50x (crypto), 20x (RWA) | 50x |

### 10.3 Block Lifecycle

```
Time 0ms:     Traders submit encrypted orders
Time 0-100ms: Orders propagate through P2P gossip
Time 100ms:   Leader proposes block with encrypted order batch
Time 100-150ms: Validators vote (round 1)
Time 150ms:   QC formed — block ordered
Time 150-177ms: Threshold decryption (batched, ~27ms overhead)
Time 177ms:   Orders revealed
Time 177-190ms: Groundhog execution (snapshot reads, commutative updates)
Time 190ms:   FBA matching engine runs per-market
Time 190-200ms: State committed — instant finality
```

### 10.4 Matching Engine Design

**FBA per block:**
1. Collect all new orders (decrypted) for each market
2. Combine with resting limit orders from previous blocks
3. Compute uniform clearing price that maximizes traded volume
4. Execute matches:
   - Market orders fill at clearing price
   - Limit orders at or better than clearing price fill
   - Same-price-level orders filled pro-rata
5. Unfilled limit orders become resting orders for next block
6. Apply commutative balance updates (Groundhog)

**Cancellation handling:**
- Cancels processed before matching in each block
- Since FBA matches once per block, cancels before auction execution are trivial
- No gas cost for cancels (part of block-level batch operation)

---

## 11. Competitive Strategy

### 11.1 Three Pillars of Differentiation

#### Pillar 1: Structural MEV Elimination
- Hyperliquid relies on speed alone — UltraFast structurally eliminates MEV
- Encrypted mempool + Groundhog + FBA = no front-running, no sandwiching, no reordering profit
- **Narrative:** "The only perps DEX where the protocol can't front-run you"

#### Pillar 2: RWA Perpetuals
- First perps DEX offering derivatives on tokenized real-world assets
- FX, commodities, equity indices, treasury yields
- Blue ocean market — Hyperliquid can't replicate due to regulatory requirements
- **Narrative:** "Trade everything, 24/7, on-chain"

#### Pillar 3: Institutional-Grade Features
- Dark pools (RFQ + intent/solver)
- Optional zk-KYC for compliance
- Multi-collateral including yield-bearing assets
- Custodian integration (Fireblocks, Copper, BitGo)
- FIX protocol connectivity
- **Narrative:** "Built for institutions, accessible to everyone"

### 11.2 Institutional Features Gap

| Feature | Hyperliquid | dYdX | UltraFast |
|---|---|---|---|
| KYC/KYB | None | Optional | zk-KYC tiers |
| Sub-accounts | Basic | Yes | Full portfolio margin |
| Dark pools | None | None | RFQ + solver auction |
| RFQ system | None | None | Yes |
| FIX connectivity | None | None | Planned |
| Prime brokerage | None | None | Sub-accounts + delegation |
| Custodian integration | None | None | Fireblocks, Copper |
| Audit trail | Limited | Moderate | Full on-chain |
| Multi-collateral | USDC only | USDC | USDC, OM, RWA tokens, IBC assets |
| RWA perps | None | None | Full suite |

### 11.3 Anti-Hyperliquid Positioning

Exploit Hyperliquid's JELLY incident and centralization:
- "Open-source matching engine" (Hyperliquid is closed-source)
- "Governance-only intervention" (no unilateral delisting)
- "Permissionless validator set" (vs Hyperliquid's ~16-25 team-controlled)
- "Structurally fair" (FBA + encrypted mempool vs speed-based)
- "We can't front-run you, even if we wanted to"

---

## 12. Go-to-Market Strategy

### Phase 1: Foundation (Months -6 to -3)

- Position as "The Institutional-Grade, MEV-Resistant, RWA-Native Perps DEX"
- Secure 3-5 market maker partnerships (DWF, Wintermute, GSR, Flow Traders, Amber)
- Secure 1-2 RWA issuers on MANTRA
- Launch public testnet with trading competitions
- Build core community: 5,000-10,000 engaged users
- Complete audits from 2+ top firms (Trail of Bits, OtterSec, Zellic)

### Phase 2: Incentivized Pre-Launch (Months -3 to 0)

- Points-based pre-deposit campaign (USDC, OM, yield-bearing collateral)
- Ambassador program: 50-100 crypto influencers/traders
- Targeted outreach to Hyperliquid/dYdX power users
- API documentation and SDK release for algo traders

### Phase 3: Mainnet Launch (Month 0)

- **Launch assets:** BTC-PERP, ETH-PERP, SOL-PERP, OM-PERP + 2-3 RWA perps (GOLD-PERP, SPY-PERP, T-BILL-PERP)
- **Fee structure:** Maker: -0.01% (rebate), Taker: 0.03%
- **Trading rewards:** Points/tokens per $1 volume with anti-wash-trade mechanisms

### Phase 4: Differentiation (Months 1-6)

- RWA perps expansion: FX pairs, commodities, equity indices
- Institutional onboarding: KYC-gated pools with higher leverage and lower fees
- Dark pool launch: RFQ system for block trades
- Cross-collateral: Accept MANTRA RWA tokens as margin
- Copy trading / social trading features

### Phase 5: Scale (Months 6-18)

- Token launch / TGE with staking for fee sharing
- Ecosystem grants for builders
- Cross-chain expansion via IBC and bridges
- Options market launch
- Prediction markets on RWA events

---

## 13. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Hyperliquid's network effects | High | Target underserved institutional segment + unique RWA assets |
| Low initial liquidity | High | DWF seeding + aggressive maker rebates + points campaign |
| Custom L1 development complexity | High | Leverage existing open-source (Groundhog, HotStuff implementations) |
| Dark pool regulatory scrutiny | Medium | Pre-emptive legal opinions, optional KYC, post-trade transparency |
| DWF Labs counterparty risk | Medium | Multi-market-maker strategy, insurance fund |
| FBA latency vs continuous matching | Medium | Sub-200ms blocks make FBA feel near-real-time |
| Smart contract / consensus bugs | Critical | Multiple audits, formal verification, bug bounty ($5M+) |
| RWA oracle manipulation | Medium | Multi-source oracles (Pyth + Chainlink + custom TWAP) |
| OM token volatility | Medium | USDC as primary collateral, OM as optional |
| Regulatory enforcement | Medium | VARA license via MANTRA, geofencing, compliance layer |
| Groundhog immaturity | Medium | AMM/matching as block-level privileged ops, not general contracts |

---

## 14. Open Design Decisions

These require further analysis and team alignment before implementation:

### 14.1 FBA vs Continuous Matching

| | FBA | Continuous |
|---|---|---|
| MEV resistance | Structurally eliminates | Speed-based only |
| Latency | 1 block interval (~200ms) | Instant within block |
| UX feel | Slightly discrete | CEX-like |
| Market maker preference | Pro-rata (less toxic flow) | Price-time (rewards speed) |
| Academic support | Strong (Budish et al.) | Traditional |

**Decision needed:** Prioritize fairness (FBA) or speed (continuous)?

### 14.2 Groundhog's AMM/Matching Limitation

Order matching is inherently sequential per market. Groundhog handles this via block-level batch operation — the matching engine is a privileged operation, not a general smart contract.

**Decision needed:** Accept this constraint, or explore alternative parallel execution models?

### 14.3 Validator Set Size

More validators = more decentralized but higher latency. HotStuff's O(n) complexity scales well to ~100 validators.

**Decision needed:** Target validator count? Start permissioned and open over time (like Hyperliquid) or permissionless from day 1?

### 14.4 Smart Contract Support

| Option | Pros | Cons |
|---|---|---|
| Pure matching engine L1 (Hyperliquid-style) | Maximum performance, simpler | No composability |
| General smart contracts (CosmWasm/WASM) | Composability, ecosystem | Performance overhead |
| Hybrid (native matching + limited contracts) | Best of both | Complexity |

**Decision needed:** Composability vs performance?

### 14.5 Implementation Language

Rust is the clear industry standard (Hyperliquid, Aptos, Sui, Monad all use Rust).

**Decision needed:** Confirm Rust. Consider C++ for Groundhog components (existing impl is C++)?

---

## 15. Next Steps: Research Agenda

### Priority 1: Core Consensus & Execution (Weeks 1-4)

| # | Research Item | Goal | Resources |
|---|---|---|---|
| 1.1 | **Groundhog deep dive** | Understand commutative semantics limitations for CLOB matching. Can the FBA matching engine be cleanly integrated as a block-level batch operation? | Read paper (arXiv:2404.03201), study GitHub repo (`scslab/smart-contract-scalability`), contact Geoffrey Ramseyer at Stanford |
| 1.2 | **HotStuff-2 / Jolteon implementation study** | Evaluate existing open-source implementations. Assess effort to build custom variant with MonadBFT tail-forking resistance. | Study Aptos flow-go HotStuff impl, LibraBFT papers, MonadBFT paper (arXiv:2502.20692) |
| 1.3 | **TrX encrypted mempool integration** | Prototype threshold encryption with batched decryption. Measure actual latency overhead in our consensus context. | Read TrX paper (ePrint 2025/2032), study Aptos encrypted mempool code, evaluate Ferveo (Anoma) |
| 1.4 | **FBA vs continuous matching simulation** | Simulate both models with real Hyperliquid order flow data. Compare execution quality, latency, MEV exposure. | Build simulator, source Hyperliquid historical data via API |
| 1.5 | **Cancel-heavy workload benchmarking** | Market makers cancel 10-100x more than fill. Benchmark Groundhog's handling of cancel-heavy workloads. | Extend Groundhog prototype with order cancel semantics |

### Priority 2: Dark Pool & Institutional (Weeks 3-6)

| # | Research Item | Goal | Resources |
|---|---|---|---|
| 2.1 | **Renegade MPC protocol study** | Evaluate whether Renegade's MPC matching can be adapted for our dark pool module. Assess latency and trust assumptions. | Study Renegade docs and code (Arbitrum deployment), contact team |
| 2.2 | **RFQ system design** | Design the RFQ protocol: how market makers receive requests, respond with quotes, and settle on-chain. | Study Hashflow, 0x RFQ, Bebop architectures |
| 2.3 | **Intent/solver auction design** | Design the solver auction for dark pool orders. How do solvers compete? What's the auction mechanism? | Study UniswapX, CoW Protocol, 1inch Fusion |
| 2.4 | **zk-KYC integration** | Evaluate Privado ID, Polygon ID, and Panther Protocol for privacy-preserving KYC. How does this interact with dark pool access tiers? | Review Privado ID SDK, Polygon ID docs |
| 2.5 | **Custodian integration requirements** | What do Fireblocks, Copper, and BitGo need for integration? API requirements, signing protocols, MPC wallet support. | Contact custodian business development teams |

### Priority 3: RWA Perpetuals (Weeks 4-8)

| # | Research Item | Goal | Resources |
|---|---|---|---|
| 3.1 | **Oracle design for RWA perps** | How to get reliable, manipulation-resistant price feeds for gold, equities, FX, treasuries on-chain. | Evaluate Pyth, Chainlink, RedStone for RWA feeds. Study MANTRA's existing oracle infrastructure. |
| 3.2 | **Funding rate design for RWA perps** | Perpetual funding rates for RWA assets should reflect real-world interest rate differentials (carry cost). | Study traditional futures basis, adapt for on-chain. |
| 3.3 | **Regulatory framework for RWA derivatives** | What licenses are needed to offer perps on tokenized equities, commodities, FX? VARA, MiCA, CFTC implications. | Engage crypto-native law firm (e.g., DLA Piper, Latham & Watkins) |
| 3.4 | **MANTRA RWA token integration** | Technical requirements for accepting MANTRA RWA tokens as collateral via IBC. Liquidation mechanics for RWA collateral. | Study MANTRA IBC modules, CosmWasm contracts |
| 3.5 | **Market sizing** | What's the TAM for on-chain RWA derivatives? Who are the first adopters? | Analyze traditional derivatives market data, survey institutional crypto desks |

### Priority 4: Implementation Planning (Weeks 6-10)

| # | Research Item | Goal | Resources |
|---|---|---|---|
| 4.1 | **Rust BFT framework evaluation** | Evaluate existing Rust BFT implementations to build on vs building from scratch. | Survey: `aptos-core`, `narwhal`, `mysticeti`, `tendermint-rs`, `hotstuff-rs` |
| 4.2 | **Groundhog Rust port feasibility** | Groundhog is C++/WASM. Assess effort to port commutative execution engine to Rust. | Analyze Groundhog C++ codebase (~30K lines) |
| 4.3 | **Networking layer selection** | libp2p vs custom networking. Evaluate for gossip, block propagation, threshold encryption key distribution. | Benchmark libp2p-rs, study Aptos/Hyperliquid networking choices |
| 4.4 | **State storage design** | Custom state DB for commutative types. Evaluate RocksDB, custom B-tree, MonadDB-style approach. | Profile Groundhog's existing storage, benchmark alternatives |
| 4.5 | **Formal verification scope** | Which components warrant formal verification? Matching engine, margin calculation, liquidation logic? | Evaluate TLA+, Coq, or Lean for consensus. Property-based testing for matching engine. |

### Priority 5: Market Making & Liquidity (Weeks 6-10)

| # | Research Item | Goal | Resources |
|---|---|---|---|
| 5.1 | **DWF Labs term sheet** | Negotiate market making agreement: liquidity commitments, fee tier, token allocation, dark pool participation. | DWF Labs BD team |
| 5.2 | **Market maker API requirements** | What do professional MMs need? WebSocket feeds, FIX protocol, co-location, order types. | Survey Wintermute, GSR, Flow Traders requirements |
| 5.3 | **Liquidity bootstrapping simulation** | Model different incentive structures (maker rebates, LP vaults, points) and project liquidity depth over time. | Build economic model |
| 5.4 | **Insurance fund design** | How large? How funded? Reinsurance options? Backstop mechanism during black swan events? | Study Hyperliquid HLP losses, GMX GLP model, traditional clearing house design |
| 5.5 | **Points/airdrop program design** | Design anti-sybil, anti-wash-trade incentive program. Learn from Hyperliquid's success and dYdX's mercenary capital problem. | Analyze Hyperliquid points distribution, Blur/Blast points programs |

### Priority 6: Competitive Intelligence (Ongoing)

| # | Research Item | Goal | Resources |
|---|---|---|---|
| 6.1 | **Hyperliquid roadmap monitoring** | Track HyperEVM development, new features, validator set changes. | Monitor Hyperliquid Discord, Twitter, governance proposals |
| 6.2 | **dYdX FBA implementation tracking** | Monitor dYdX's FBA + ABCI++ vote extensions rollout. Learn from their experience. | dYdX governance forum, GitHub |
| 6.3 | **Sei Giga benchmarking** | Monitor Sei's 200K TPS claims. If validated, evaluate Sei as potential deployment target. | Sei testnet, documentation |
| 6.4 | **Monad mainnet launch analysis** | Evaluate MonadBFT in production. Benchmark parallel EVM execution. | Monad testnet/mainnet when available |
| 6.5 | **Regulatory landscape monitoring** | Track CFTC, MiCA, VARA developments related to on-chain derivatives and dark pools. | Legal counsel, industry reports |

---

## 16. Privacy-Preserving Technologies: FHE, Threshold Encryption, TEE & Hybrid Approaches

> Research into alternatives and complements to ZK proofs for solving front-running and enabling private on-chain trading.

### 16.1 FHE-Based Trading Systems

#### Can a Matching Engine Operate on Encrypted Orders Using FHE?

**Yes, but with severe performance caveats today.** FHE allows computation on ciphertexts — orders encrypted under a public key can be matched by an operator who never sees the plaintext. Threshold FHE adds decentralization: the secret key is split among multiple parties, and matched orders are decrypted only by the clients using their decryption shares.

**Practical implementations exist:**

- **Sunscreen** built a private double auction (dark pool) using threshold FHE. Orders are matched via a periodic volume match every 5 seconds, with price from an external source. The operator learns order details *only after matching*; unsuccessful orders are never revealed. Quantity/price are currently restricted to a 2^16 bit range.
- **Fhenix CoFHE** deployed on Base reports that one DeFi protocol encrypted their order book with just 47 lines of modified Solidity, preserving full composability with existing liquidity pools.
- **Optalysys** is developing FHE-specific hardware accelerators targeting private on-chain dark pools.

**The core bottleneck is performance:**

| Implementation | Performance | Notes |
|---|---|---|
| Zama Concrete FHE (naive, 2023) | 10 buyers + 10 sellers = **204 minutes** | Completely impractical |
| Sunscreen dark pool (2024-2025) | ~5s auction cycles on 64-core machine | Viable for batch auctions, not continuous matching |
| Newer FHE approaches (2025) | **600-850 orders/second** | Dramatic improvement, uses differential privacy hybrid |
| Non-FHE baseline | 200,000+ ops/sec (Hyperliquid) | 250-300x gap remains |

**Assessment for perps DEX:** Pure FHE matching is not viable for continuous order books at trading-grade latency. However, FHE is practical for:
- Batch auctions with 1-5 second intervals
- Dark pool periodic crossings
- Sealed-bid auctions (Zama conducted first FHE sealed-bid Dutch auction on Ethereum mainnet, Jan 2026: 11,103 bidders, $118.5M committed)

#### Current State of FHE Performance (2025-2026)

| Metric | Value | Source |
|---|---|---|
| TFHE bootstrapping latency (2022) | 53ms | Zama |
| TFHE bootstrapping latency (2025, H100 GPU) | **<1ms** | Zama |
| Bootstrap throughput (8x H100s) | **189,000/sec** | Zama |
| Confidential ERC-20 transfers (CPU) | ~20 TPS | Zama fhEVM |
| Confidential ERC-20 transfers (GPU) | 20-30 TPS | Inco Network |
| Speed improvement since 2022 | **2,300x** | Zama |
| Public decryption improvement (fhEVM v0.7) | 6.6x | Zama Feb 2026 |
| User decryption improvement (fhEVM v0.7) | 19.2x | Zama Feb 2026 |
| GPU acceleration over CPU | up to 784x | Zama benchmarks |

**Roadmap:**
- 2026 target: 500-1,000 TPS per chain (GPU migration) — Zama
- 2027-2028: 100,000+ TPS (dedicated ASIC hardware) — Zama
- Fhenix CoFHE: claims 5,000x throughput improvement over earlier systems

#### Zama fhEVM — Could It Support a Perps DEX?

**Zama's fhEVM** is a full-stack framework for FHE on EVM chains. Key facts:

- **Mainnet launched December 30, 2025** on Ethereum
- Operates as a coprocessor model: FHE computation offloaded from the main chain
- Supports confidential transfers, token swaps, sealed-bid auctions
- Solidity-compatible: developers write standard Solidity with FHE types (euint32, ebool, etc.)
- First real-world use: confidential USDT transfers on Ethereum mainnet

**For a perps DEX specifically:** fhEVM could handle encrypted position sizes, hidden liquidation levels, and private margin balances. However, the matching engine itself would be bottlenecked by FHE computation speed. A hybrid approach — FHE for state privacy + non-FHE matching — is more realistic.

**Architecture pattern for perps:**
```
Order submission → Threshold/ZK encryption (fast)
Matching engine  → Plaintext inside TEE or after threshold decryption (fast)
Position state   → FHE-encrypted on-chain (hides sizes, leverage, liquidation levels)
Liquidation      → FHE computation checks margin ratios on encrypted state
```

#### Fhenix Network

- Originally an FHE-powered L2, pivoted to **confidential DeFi infrastructure company**
- Core product: **CoFHE** (FHE Coprocessor), deployed on Base (Feb 2026)
- CoFHE is stateless and lightweight — addresses the "FHE is too slow" criticism
- Raised $22M+ total; strategic investment from BIPROGY (Japan's largest IT services) in Oct 2025
- Developer experience: "adding encryption to existing contracts took hours rather than weeks"
- Institutional adoption signal: $2.3B moved through private DeFi channels in Q3 2025 alone

#### Inco Network

- Modular confidential computing network — "the confidentiality layer of Web3"
- $5M strategic round led by a16z CSX (April 2025), with Coinbase Ventures participation
- $4.7B in restaked ETH backing security via Ethos integration
- Co-authored **Confidential ERC-20 Framework** with Circle Research
- Key DeFi primitives: private AMMs, dark pools, under-collateralized lending, blind auctions
- Offers **dual modes**: TEE-fast and FHE+MPC-secure, letting apps choose per-operation
- GPU acceleration: 20-30 TPS for confidential operations

#### FHE-Based Order Book Implementations

| Project | Approach | Status | Performance |
|---|---|---|---|
| Sunscreen dark pool | Threshold FHE periodic volume match | Demo/research | ~5s cycles, 64-core |
| Fhenix CoFHE on Base | FHE coprocessor for encrypted order state | Live (Feb 2026) | 5,000x improvement claimed |
| Optalysys | Hardware-accelerated FHE for dark pools | R&D | Targeting real-time |
| Zama fhEVM | General FHE smart contracts | Mainnet (Dec 2025) | 20-30 TPS (GPU) |
| Prime Match | FHE encrypted order submission, match-then-reveal | Live | 600-850 orders/sec |

### 16.2 Threshold Encryption for Mempools

#### TrX Paper (Aptos Labs, 2025) — Deep Dive

**Paper:** "TrX: Encrypted Mempools in High Performance BFT Protocols" (ePrint 2025/2032)

**Core innovation:** First integration of encrypted mempools with a high-performance BFT protocol, achieving near-zero overhead.

**How it works:**
1. Transactions encrypted using batched threshold encryption before entering the mempool
2. Validators see only ciphertext — cannot front-run, sandwich, or reorder based on content
3. Block proposer selects encrypted transactions and commits to ordering
4. After consensus on ordering, validators collectively decrypt the entire batch in a single operation
5. Decrypted transactions execute in the agreed-upon order

**Performance:**
| Metric | Value |
|---|---|
| Latency overhead | **27ms (14% over baseline)** |
| Throughput impact | Near-zero (batch amortization) |
| Communication overhead | Orders of magnitude less than per-tx threshold decryption |

**Key advance over prior work:** Batched threshold encryption allows validators to decrypt entire blocks collectively in one operation, rather than per-transaction decryption. This is what makes it practical for high-throughput chains.

**Related work:**
- "Mempool Privacy via Batched Threshold Encryption: Attacks and Defenses" (USENIX Security 2024) — foundational attacks/defenses analysis
- "Weighted Batched Threshold Encryption with Applications to Mempool Privacy" (ePrint 2025/2115) — extends to stake-weighted validators
- "Practical Mempool Privacy via One-time Setup Batched Threshold Encryption" (USENIX Security 2025) — reduces setup assumptions

**Relevance to UltraFast:** TrX is the most directly applicable research for our encrypted mempool design. The 27ms overhead is well within our 200ms finality budget. Already referenced in our architecture (Section 10.3).

#### Ferveo (Anoma/Namada)

**Paper:** "Ferveo: Threshold Decryption for Mempool Privacy in BFT networks" (ePrint 2022/898)

**Design:**
- DKG (Distributed Key Generation) protocol for Tendermint-based chains
- Distributes shared private key by **relative staking weight**
- Relies on underlying blockchain for synchronicity
- Compatible with threshold encryption/decryption and threshold signature protocols

**Transaction flow:**
1. Transactions encrypted to a public key and sent to mempool
2. Block proposers select encrypted transactions, commit in block proposals
3. Ordering determined before decryption
4. After block validation, threshold decryption reveals transactions

**Status:** Implemented in Anoma/Namada. Namada is the first fractal instance of Anoma, using Tendermint consensus. More research-oriented than production-optimized compared to TrX.

**Comparison to TrX:**
| | Ferveo | TrX |
|---|---|---|
| Target chain | Tendermint/CometBFT | High-performance BFT (Aptos-class) |
| Batch optimization | Per-transaction | **Batched (entire block)** |
| Latency overhead | Higher (per-tx decryption) | **27ms (batched)** |
| Production readiness | Testnet/research | Research, Aptos integration planned |
| Weighted by stake | Yes | Yes |

#### Shutterized Protocols (Shutter Network)

**The only threshold-encryption MEV protection deployed on mainnet** (Gnosis Chain).

**How it works:**
1. Users encrypt transactions and broadcast ciphertexts to a sequencing contract
2. A **keyper set** (permissioned committee) holds threshold decryption keys
3. Once transactions are included in a block and validated, keypers collectively decrypt
4. Decrypted transactions execute

**Current deployments and plans:**
| Deployment | Status | Details |
|---|---|---|
| Gnosis Chain mainnet | **Live** | Alternative RPC endpoint, per-epoch encryption |
| OP Stack module | Testnet | Encrypted mempool for Optimism rollups |
| Ethereum PBS integration | PoC (Dec 2025/Jan 2026) | Partnership with Primev for threshold encrypted mempool in PBS |

**Limitations:**
- **Permissioned keyper set** — not fully trustless today
- **High latency** in current Gnosis deployment
- Per-epoch encryption ties transactions to specific blocks (improvement over initial design)

**Assessment:** Shutter proves threshold encryption works in production for MEV prevention. The permissioned keyper set is the main trust assumption to address. Their OP Stack module is interesting for rollup-based perps DEXs.

#### Threshold Encryption vs ZK for Order Privacy

| Dimension | Threshold Encryption | ZK Proofs |
|---|---|---|
| **What it hides** | Transaction content until after ordering | Transaction details while proving validity |
| **When privacy ends** | After block finality (transactions revealed) | Can be permanent (e.g., Zcash shielded) |
| **MEV protection** | Strong — validators can't see content pre-ordering | Moderate — depends on what's proven vs hidden |
| **Latency overhead** | 27ms (TrX batched) | 10-30s proving time (zkEVM), <1s for simple proofs |
| **Trust model** | Threshold assumption (2/3 honest validators) | Trustless (math only), but trusted setup for some SNARKs |
| **Composability** | Full — decrypted tx is normal tx | Limited — ZK state harder to compose |
| **State privacy** | No (state visible after execution) | Yes (balances, positions can stay hidden) |
| **Best for** | Mempool privacy, MEV prevention | State privacy, compliance proofs, identity |

**Key insight:** These are **complementary, not competing**. Threshold encryption protects the mempool (pre-execution privacy). ZK proofs protect state (post-execution privacy). A perps DEX benefits from both:
- Threshold encryption: hide orders until after consensus (prevent front-running)
- ZK proofs: hide position sizes, liquidation levels, margin ratios (prevent liquidation hunting)

### 16.3 TEE-Based Approaches (Trusted Execution Environments)

#### SGX/TDX Enclaves for Private Order Matching

**How it works:** Order matching runs inside a hardware enclave (Intel SGX or TDX). The enclave sees plaintext orders but the host machine, other processes, and even the OS/hypervisor cannot access enclave memory.

**Advantages:**
- Extremely fast — near-native execution speed, no cryptographic overhead on matching
- Simple programming model — write normal code, deploy in enclave
- Mature tooling (Intel SDK, Gramine, Fortanix)

**Intel SGX vs TDX:**
| | SGX | TDX |
|---|---|---|
| Isolation | Process-level enclaves | Entire VM isolation |
| Memory limit | ~256MB (historically) | Much larger |
| Performance | Near-native | Near-native |
| Attestation | EPID/DCAP | DCAP |
| Use case | Application-specific secrets | Full confidential VMs |

#### Silhouette on Hyperliquid

**The most directly relevant project for our use case.**

- **"Shield Exchange"** — privacy-preserving shielded layer on Hyperliquid
- $3M pre-seed led by RockawayX (June 2025), with Hivemind, Amber Group, NGC
- Matches orders off-chain inside TEEs, settles on-chain on Hyperliquid
- Supports TWAP, VWAP, RFQ strategies
- Alpha release targeted Q2 2025

**Architecture:**
1. Users submit encrypted orders via encrypted relay
2. Orders decrypted and matched inside TEE enclave
3. Only matched trades published on-chain
4. Zero information leakage — order details private until execution

**Assessment:** Silhouette validates the TEE-based dark pool model for perps. However, it's a layer on top of Hyperliquid, not a native integration. UltraFast could offer this natively at the consensus layer.

#### Oasis Network — Confidential Computing

- **Sapphire ParaTime**: First and only confidential EVM — uses TEE (Intel SGX) for smart contract execution
- Developers choose: 100% confidential, 100% public, or anywhere in between
- Uses encrypted memory + remote attestation
- ROFL framework (2024): extends confidential computing off-chain
- **TEE Break Challenge** launched to prove Sapphire security (running through end of 2025)
- Supports confidential DeFi trades, sealed auctions, private governance voting
- VARA license holder (Dubai)

#### Flashbots SUAVE and TEE-Based MEV Mitigation

**SUAVE** (Single Unifying Auction for Value Expression): Flashbots' vision for a decentralized, MEV-aware, privacy-first encrypted mempool.

**Key developments:**
| Timeline | Development |
|---|---|
| Nov 2024 | BuilderNet v1.0 — jointly operated by Flashbots, Beaverbuild, Nethermind |
| Dec 2024 | Flashbots migrated all builders to BuilderNet, ceased centralized block building |
| Feb 2025 | BuilderNet v1.2 — enhanced security and operator onboarding |
| 2025 | **Rollup-Boost**: Unichain becomes first L2 using Flashbots TEE tool for block building |
| Ongoing | Project T-TEE: "From Trusted to Trustless Execution Environments" research |

**Sirrah** (TEE Coprocessor): Flashbots' approach to using TEEs as coprocessors for private computation in block building. The MEVM runs sensitive computation off-chain in TEE execution nodes.

#### TEE Trust Assumptions and Vulnerabilities

**CRITICAL: TEE.fail Attack (October 2025)**

Researchers from Georgia Tech, Purdue, and Synkhronix demonstrated a devastating side-channel attack:

| Detail | Value |
|---|---|
| Attack name | TEE.fail |
| Cost of equipment | **<$1,000** (off-the-shelf DDR5 interposition device) |
| Affected platforms | Intel SGX, Intel TDX, AMD SEV-SNP |
| What was extracted | ECDSA attestation keys from Intel PCE |
| Consequence | **Complete attestation forgery** — attacker can fake that code runs in a real enclave |
| Blockchain projects validated | Secret Network, Phala Network, Crust Network |
| Flashbots BuilderNet | Researchers demonstrated forging TDX attestations to access confidential tx data |
| Requirement | **Physical access** to the server |

**Flashbots' response:** Physical access requirement makes this impractical for most threat models. BuilderNet operators are vetted entities with physical security. However, this fundamentally undermines the "trustless" narrative of TEEs.

**Full vulnerability landscape for SGX/TDX:**
| Attack Class | Examples | Practical Impact |
|---|---|---|
| Side-channel (cache) | Spectre, Meltdown, L1TF, MDS | Software patches available but performance cost |
| Side-channel (physical) | **TEE.fail** (DDR5 bus snooping) | Requires physical access, <$1K equipment |
| Attestation forgery | Via TEE.fail key extraction | Can fake enclave identity |
| Microarchitectural | Plundervolt, SGAxe | Most patched by Intel |
| Supply chain | Backdoored hardware | Theoretical but nation-state level |

**Trust model summary:**
- TEEs require trusting: Intel/AMD hardware design, no backdoors, physical security of servers, firmware update process
- For institutional DeFi and regulated applications: **acceptable** trust assumption
- For maximally trustless systems: **insufficient** — must combine with cryptographic guarantees

### 16.4 Hybrid Approaches Combining Multiple Techniques

#### ZK + FHE

**Use case:** FHE performs private computation; ZK proves the computation was done correctly without revealing inputs or outputs.

**Examples:**
- **Zama FHE Rollups (proposed):** FHE-encrypted state verified via zk-SNARKs. Users submit encrypted transactions, FHE processes them, ZK proof verifies correct execution.
- **Pattern:** `Encrypted input → FHE computation → Encrypted output + ZK proof of correctness`

**For perps DEX:**
- FHE encrypts position state (sizes, leverage, liquidation levels)
- ZK proves margin requirements are met without revealing position details
- ZK proves liquidation was justified without revealing liquidation price

**Maturity:** Early research. Zama has published blueprints but no production implementations. The computational cost of generating ZK proofs over FHE computations is very high.

#### ZK + MPC

**Use case:** Multiple parties collaboratively generate a ZK proof without any single party seeing the full witness.

**Examples:**
- **Renegade:** MPC-based matching with ZK proofs for settlement verification. Two traders' orders are matched via MPC; neither sees the other's order details; ZK proof verifies the match was valid.
- **Zcash trusted setup:** MPC ceremony for zk-SNARK parameter generation.
- **Nillion:** Orchestrates MPC, homomorphic encryption, and ZK proofs depending on computation requirements.

**For perps DEX:**
- MPC for multi-party dark pool matching (multiple MMs quote, best execution selected)
- ZK proof of correct matching published on-chain
- Enables trustless dark pools with verifiable execution

**Maturity:** Moderate. Renegade is live on Arbitrum. Nillion launched mainnet March 2025.

#### ZK + TEE

**Use case:** TEE provides fast execution; ZK provides cryptographic verification that removes trust in the hardware.

**Examples:**
- **DEFX:** ZK technology encrypts orderbooks and trade parameters — size, leverage, liquidation levels hidden, only execution proof revealed. Raised $2.5M (June 2025).
- **Lighter:** ZK-rollup on Ethereum for order matching and liquidations.
- **GRVT:** zkSync Validium architecture — position sizes, entry prices, liquidation levels hidden by default.
- **Hibachi:** Perp DEX on Celestia with ZK encryption of positions, balances, order sizes.
- **Flashbots Project T-TEE:** Research on making TEEs "trustless" by adding ZK attestation proofs.

**For perps DEX:** This is the most practical hybrid for real-time trading:
1. Orders execute inside TEE at near-native speed
2. TEE generates ZK proof of correct execution
3. ZK proof verified on-chain — if TEE is compromised, invalid execution is caught
4. Removes single point of trust in hardware vendor

**Maturity:** Most mature hybrid. Multiple production or near-production implementations.

#### Threshold Encryption + ZK Proofs

**Use case:** Threshold encryption hides mempool content; ZK proves encrypted transactions are valid (sufficient balance, correct format) without decryption.

**Examples:**
- **TrX + validity proofs:** Encrypted transactions include a ZK proof that the sender has sufficient funds, verified before inclusion.
- **Shutter + ZK:** Encrypted transactions paired with ZK proofs of validity.
- **Pattern:** Mempool stores `(ciphertext, ZK_proof_of_validity)` pairs.

**For perps DEX:**
- Threshold encryption hides order content until after consensus
- ZK proof attached to each encrypted order proves: sender has margin, order is well-formed, leverage within limits
- Validators verify ZK proofs on encrypted orders without seeing content
- After threshold decryption, orders execute normally

**Maturity:** TrX demonstrates the threshold encryption side. ZK validity proofs for encrypted transactions are well-understood. Integration is engineering, not research.

**This is the recommended approach for UltraFast's encrypted mempool.**

#### Which Combinations Are Most Promising for a Perps DEX?

| Hybrid | Latency | Trust | Privacy Scope | Maturity | Verdict |
|---|---|---|---|---|---|
| **Threshold enc + ZK** | **~30ms overhead** | Threshold (2/3) + math | Mempool + validity | High | **Best for order privacy** |
| **ZK + TEE** | **~1-5ms overhead** | TEE hardware + math fallback | Execution + state | High | **Best for fast matching** |
| **ZK + FHE** | **Seconds** | Math only | Full state privacy | Low | Best for state privacy (future) |
| **ZK + MPC** | **5-10s** | Honest majority | Multi-party matching | Moderate | Best for dark pools |
| **TEE + threshold enc** | **~30ms** | TEE + threshold | Mempool + execution | Moderate | Redundant privacy layers |

**Recommended stack for UltraFast perps DEX:**

```
Layer 1: Threshold encryption (TrX-style) for mempool privacy        [27ms overhead]
Layer 2: ZK validity proofs on encrypted orders                       [verified pre-consensus]
Layer 3: Native matching engine (plaintext after threshold decryption) [maximum speed]
Layer 4: TEE-based dark pool module (Silhouette-style) for block trades [optional]
Layer 5: FHE for long-term state privacy (future upgrade path)        [positions, liquidation levels]
```

### 16.5 Comparative Analysis

#### ZK vs FHE vs Threshold Encryption vs MPC vs TEE for Order Privacy

| Dimension | ZK Proofs | FHE | Threshold Enc | MPC | TEE |
|---|---|---|---|---|---|
| **What's hidden** | Proof of validity without revealing data | All computation on encrypted data | Transaction content until decryption | Inputs from other parties | Everything inside enclave |
| **Latency** | 10-30s (zkEVM), <1s (simple) | Seconds to minutes | **27ms (batched)** | 5-10s per match | **<1ms overhead** |
| **Throughput (2026)** | 20-50 TPS (zkEVM rollups) | 20-30 TPS (GPU) | **Chain-native TPS** | Limited by #parties | **Near-native** |
| **Trust model** | **Trustless** (math) | **Trustless** (math) | 2/3 honest validators | Honest majority | **Hardware vendor** |
| **Privacy duration** | Permanent possible | Permanent | Until block finality | During computation | Until enclave runs |
| **Programmability** | Circuits (constrained) | Solidity-like (fhEVM) | N/A (transport layer) | Protocol-specific | **Full (normal code)** |
| **Hardware needs** | CPU/GPU for proving | GPU mandatory for speed | Standard | Standard | **Intel SGX/TDX** |
| **Key vulnerability** | Proving time | Performance | Threshold collusion | Collusion | **Side channels (TEE.fail)** |
| **Production examples** | GRVT, Lighter, Hibachi | Zama fhEVM, Fhenix | **Shutter (Gnosis)**, TrX | Renegade | **Silhouette, Oasis, Flashbots** |

#### Latency Comparison for Real-Time Trading

| Technology | Operation Latency | Viable for Perps? | Notes |
|---|---|---|---|
| TEE matching | **<1ms** | **Yes** | Native speed, hardware trust |
| Threshold decryption (TrX batched) | **27ms** | **Yes** | Amortized across block |
| ZK simple proof | 100-500ms | **Yes (with pipeline)** | Can be pipelined with consensus |
| MPC 2-party match | 5-10s | **Dark pool only** | Too slow for main book |
| FHE order matching | 5s+ (batch) | **Batch auction only** | Improving rapidly |
| ZK rollup proving | 10-30s | **Settlement only** | Proving runs async |
| FHE state computation | Seconds | **Async only** | For position privacy, not matching |

**Threshold for competitive perps trading: sub-500ms finality.** Only TEE and threshold encryption meet this natively. ZK proofs can be pipelined to avoid blocking the critical path.

#### Trust Assumptions Comparison

| Technology | Trust Assumption | Failure Mode | Mitigation |
|---|---|---|---|
| **ZK Proofs** | Mathematics (soundness of proof system) | Broken crypto (theoretical) | Use battle-tested systems (Groth16, PLONK) |
| **FHE** | Mathematics (LWE hardness) | Broken crypto (theoretical) | Conservative parameters, quantum resistance built-in |
| **Threshold Enc** | 2/3 of validators honest | Collusion reveals transactions | Decentralized validator set, slashing |
| **MPC** | Honest majority of participants | Collusion reveals inputs | Increase participant count, economic incentives |
| **TEE** | Hardware vendor + physical security | Side-channel attacks (TEE.fail) | Combine with ZK verification, multi-vendor diversity |

#### Practicality for Real-Time Trading (2026 Assessment)

| Approach | Ready for Production Perps DEX? | Timeline | Key Blocker |
|---|---|---|---|
| **Threshold encryption for mempool** | **Yes — now** | Deployable today | Engineering integration |
| **TEE for dark pool matching** | **Yes — now** | Deployable today | TEE.fail trust concerns |
| **ZK for state privacy** | **Partially** | 6-12 months | Proving latency for complex proofs |
| **ZK + TEE hybrid** | **Yes — now** | Multiple live projects | Integration complexity |
| **FHE for matching** | **No** | 2027-2028 | Performance (need ASICs) |
| **FHE for state privacy** | **Partially** | 12-18 months | GPU acceleration maturing |
| **MPC for dark pool** | **Yes — limited** | Live (Renegade) | 5-10s latency, limited scale |

### 16.6 Implications for UltraFast Architecture

**Current UltraFast design validation:** The existing architecture (Section 10) correctly identifies TrX-style threshold encryption as the primary mempool privacy mechanism. This research confirms that choice.

**Recommended enhancements based on findings:**

1. **Add ZK validity proofs to encrypted orders** — prevents spam/invalid orders from consuming threshold decryption resources. Validators verify ZK proofs before including encrypted transactions.

2. **TEE-based dark pool module** (Phase 2) — Silhouette proves this works for perps. Offer as optional "shield mode" for institutional block trades. Acknowledge TEE.fail risks with multi-vendor approach and ZK fallback verification.

3. **FHE state privacy roadmap** (Phase 3, 2027+) — encrypt position sizes, liquidation levels, and margin ratios using FHE. Prevents liquidation hunting and position sniping. Wait for GPU/ASIC acceleration to reach viable throughput.

4. **Hybrid privacy tiers:**

| Tier | Technology | Privacy | Performance | Target User |
|---|---|---|---|---|
| **Standard** | Threshold encrypted mempool | Order privacy until execution | Full chain TPS | All traders |
| **Enhanced** | + ZK state proofs | Hidden position sizes | Slight overhead | Active traders |
| **Shield** | + TEE dark pool | Full pre-trade opacity | TEE-native speed | Institutions |
| **Maximum** | + FHE state (future) | Encrypted everything | TBD (2027+) | Privacy maximalists |

---

## 17. Zero-Knowledge Perpetual Futures: Project Landscape

> **Research date:** 2026-03-24
> **Key finding:** No production perp DEX yet combines full ZK dark pool privacy (MPC+ZK matching) with perpetual futures. This is the gap UltraFast targets.

### 17.1 Production ZK Perps with Genuine Order/Position Privacy

| Project | ZK Tech | Privacy Model | Volume/Traction | Key Innovation |
|---|---|---|---|---|
| **GRVT** | zkSync Validium | Positions, liquidation levels, margin data hidden | $19M Series A, 600K TPS matching | Privacy-by-default validium; zero downtime during $19.35B liquidation stress test |
| **Paradex** | Starknet appchain (STARK) | Orders, positions, and trades private | 600+ markets | Claims "only perp DEX offering privacy at scale"; first Starknet appchain |
| **Aster** | Custom ZK + stealth addresses | ZK-verifiable encryption on custom L1 | 20% perp DEX market share, CZ-backed | Launching custom L1 March 2026; migrating from existing exchange |

### 17.2 Production ZK Perps — Verified Execution (No Order Privacy)

| Project | ZK Tech | Privacy? | Volume/Traction | Key Innovation |
|---|---|---|---|---|
| **Lighter** | Custom SNARK circuits (Plonky2) | No — sequencer sees orders | $300B+ weekly, $68M raised at $1.5B val | Most advanced ZK matching engine; first DEX listing stock perps (Samsung, Hyundai) |
| **EdgeX** | StarkEx (STARK) | No | 200K orders/sec | StarkEx throughput for perps |
| **ApeX Omni** | zkLink ZK L3 | No | $70B+ cumulative | Cross-chain ZK verification |
| **SynFutures** | zkSync Era (inherits ZK) | No | Permissionless pair creation | Any user creates futures market in <30s |

### 17.3 Dark Pool / Full Privacy (Not Yet Perps)

| Project | Tech | Status | Assessment |
|---|---|---|---|
| **Renegade** | MPC + collaborative PLONK | Live on Arbitrum (spot only) | Gold standard. CZ referenced it for dark pool perps. <1s matching, <$0.30/trade |
| **Penumbra** | Groth16 ZK + sealed-bid batch auctions | Live (Cosmos L1) | Privacy-native L1, ~$3.77M TVL. Proves shielded DEX concept |
| **Invisibook** | MPC + ZK on CKB | Development | Encrypted order quantities with ZK balance proofs |
| **COMMON** | zk-SNARKs + MPC | Academic paper | Foundational design for private order books with shielded token pool |
| **Spark/Miden** | ZK-STARK (Polygon Miden VM) | Development | Client-side ZK proofs for private perps on Miden |

### 17.4 Emerging Competitors & Key Proposals

**Defx** — The most direct UltraFast competitor:
- Purpose-built L1 for private perpetual futures
- $2.5M seed from **Pantera Capital**
- Dark pool architecture with ZK-encrypted orderbooks
- Targeting institutional traders

**CZ's Dark Pool Perp DEX Proposal (June 2025):**
- Called for ZK proofs or delayed settlement to keep order books and positions private
- "Not showing the orderbook, or even better, not showing deposits into smart contracts at all"
- Referenced Renegade's approach — remains an open design challenge

**Polyhedra's Dark Pool Proposal:**
- 3-phase approach: (1) Private order submission via ZK commitments, (2) ZK-verified matching, (3) ZK settlement
- Leverages their Binary GKR prover (fastest Keccak proving)

**zkHyperliquid (ETHGlobal 2025 Winner):**
- PoC showing SP1 zkVM integration with Hyperliquid-style matching
- STARK-based recursion with Groth16 compression
- ~300K gas per batch verification on Ethereum

### 17.5 Summary: The Privacy Spectrum

```
No Privacy ──────────────────────────────────────────── Full Privacy
    │                    │                    │              │
  dYdX v3          Lighter/EdgeX         GRVT/Paradex    Renegade
  (ZK for          (ZK proves            (Validium/      (MPC+ZK:
   scaling          execution,            STARK hides     no one
   only)            operator sees         positions)      sees orders)
                    orders)                                  │
                                                            │
                                                   UltraFast Target:
                                                   MPC+ZK dark pool
                                                   + FBA matching
                                                   for perps
```

---

## 18. ZK Cryptography for Private Trading Systems

### 18.1 ZK-SNARKs for Order Matching — Circuit Design

A ZK matching engine must prove correct order matching without revealing order details.

**Circuit structure:**
```
Public inputs:  commitment_root (Merkle root of order commitments),
                trade_settlement_hash
Private inputs: individual orders, matching assignments, randomness

Constraints:
  1. Each order opens correctly against commitment_root
  2. For each match (i,j): buy_price[i] >= sell_price[j]
  3. Fill quantities are <= order quantities
  4. Matching is maximal (no valid unmatched pair exists)
  5. Price-time priority is respected (sorting proof)
```

**Order commitments:** Each order is a Poseidon commitment: `C = Commit(price, quantity, side, timestamp, nonce)`

**Sorting proof:** A Batcher odd-even mergesort network expressed as constraints proves the output permutation is correctly sorted (price-time priority).

**Maximality constraint:** The hardest part — proving no better matching exists. Handled by proving the matching is equivalent to running a specific deterministic algorithm (limit order book sweep), converting optimality proof into trace verification.

**Constraint count:** For N orders: O(N log N) for sorting + O(N) for match verification = 10K-1M constraints for practical batches (50-500 orders).

### 18.2 ZK-STARKs vs ZK-SNARKs for Trading

| Property | ZK-SNARKs | ZK-STARKs |
|---|---|---|
| Trusted setup | Required (Groth16) or universal (PLONK) | None (transparent) |
| Proof size | ~200-300 bytes (Groth16), ~500-800 bytes (PLONK) | ~50-200 KB |
| Verification time | ~2-5 ms on-chain | ~10-50 ms on-chain |
| Prover time | Moderate (FFT + MSM dominated) | Fast for large circuits (hash-based) |
| Post-quantum | No (elliptic curve) | Yes (hash-based) |
| Field arithmetic | BN254/BLS12-381 | Goldilocks (64-bit) or Mersenne31 |

**Verdict for trading:** Use **STARKs for proving** (fast prover, e.g., Plonky3/Stwo) then **wrap in SNARK for on-chain verification** (small proof, ~200K gas). This is the Polygon zkEVM approach (STARK inner → Groth16 outer).

### 18.3 Proving Systems Comparison

| System | Proof Size | Verification Gas | Trusted Setup | Best For |
|---|---|---|---|---|
| **Groth16** | 192 bytes | ~200K | Per-circuit | Final on-chain verification; wrapping STARKs |
| **PLONK/UltraPLONK** | 500-800 bytes | ~300K | Universal (1-time) | Flexible circuits with lookup tables |
| **Halo2** | 5-10 KB (IPA) | Higher | None (IPA) | Recursion, no trusted setup |
| **fflonk** | ~Groth16 | ~200K | Universal | Near-Groth16 cost with universal setup |

**For UltraFast:**
- **Halo2 or UltraPLONK** for the matching circuit (flexible, supports lookups for range checks)
- **Groth16** for final settlement proofs (minimum on-chain cost)
- **fflonk** as alternative to avoid per-circuit trusted setup

### 18.4 Commit-Reveal Schemes with ZK for Sealed-Bid Auctions

Enhanced commit-reveal for FBA:

1. **Commit phase:** Bidder publishes `C_i = Poseidon(bid_i, nonce_i)` + ZK proof that bid satisfies validity constraints (`bid >= reserve_price`, `bid <= collateral`). ZK at commit time guarantees sealed bid is valid.
2. **Reveal phase:** Bidders reveal `(bid_i, nonce_i)`. Contract verifies `C_i == Poseidon(bid_i, nonce_i)`.
3. **Winner determination in ZK:** A prover takes all bids and produces a ZK proof that the declared winner has the highest bid, without publishing losing bids.

**Advanced (no reveal needed):** Bids encrypted to committee's threshold public key → committee jointly decrypts and computes winner → ZK proof of correct determination → only winning price revealed. This is Penumbra's approach.

### 18.5 Recursive ZK Proofs for Batch Trade Verification

Instead of verifying N individual trade proofs on-chain [O(N) cost], recursively aggregate into one proof [O(1) cost].

**How recursion works:** A recursive proof P_n proves: "I verified proof P_{n-1} AND trade T_n is valid."

**Practical constructions:**

| Approach | Per-Step Overhead | Best For |
|---|---|---|
| **Halo2 accumulation** | ~10K constraints (accumulator update) | Medium batches |
| **Nova folding** | O(1) crypto operations (single MSM) | Large sequential chains |
| **SuperNova** | Same as Nova, supports different circuit types per step | Mixed trade types (market/limit/cancel) |
| **ProtoGalaxy** | Logarithmic field ops + constant hashes | Lightest recursion |

**For UltraFast:** Accumulate all trades in a block into a single recursive proof. On-chain: verify one proof per batch (~200K gas regardless of batch size). Amortizes per-trade verification cost to near zero.

### 18.6 ZK Coprocessors for Private Order Verification

| Coprocessor | Approach | Trading Use | Overhead |
|---|---|---|---|
| **RISC Zero** | RISC-V zkVM (STARK) | Write matching logic in Rust, get ZK proof | ~10,000x slowdown vs native |
| **SP1 (Succinct)** | RISC-V zkVM with precompiles | Same as RISC Zero, faster for hash-heavy ops | ~100MHz effective clock |
| **Axiom** | Proves Ethereum state access in ZK | Prove collateral balance at specific block | Halo2 circuits |
| **Brevis** | Proves data access patterns | Prove VWAP/volume over historical trades | - |

**Assessment:** Excellent for **settlement and verification** (proving batch was correctly matched). NOT fast enough for **real-time matching** — proof overhead is too high. Architecture: match off-chain (fast) → prove via coprocessor (async) → settle on-chain (with proof).

### 18.7 MPC + ZK Hybrid Architecture (Renegade Model)

The most promising approach for private perps:

1. **Order representation:** Secret-shared across MPC nodes, with ZK proof of validity committed on-chain
2. **Matching via MPC:** 2-party MPC evaluates matching predicate (`buy.price >= sell.price`) without either party learning the other's order
3. **Settlement via ZK:** ZK proof proves matched orders were previously committed, match satisfies crossing condition, balances updated correctly
4. **On-chain:** Only ZK proof and encrypted balance updates hit the chain

**Why hybrid?**
- Pure ZK requires a single trusted prover who sees all orders (centralization)
- Pure MPC has high communication complexity for on-chain verification
- Hybrid: MPC distributes trust, ZK provides succinct on-chain proofs

### 18.8 Unsolved Challenges for ZK Perps

These are the core research problems that no project has fully solved:

#### Private Liquidation
The central unsolved problem. Four approaches under investigation:

| Approach | How It Works | Trade-offs |
|---|---|---|
| **Self-reporting + ZK penalties** | Traders prove their own margin status; protocol penalizes late reporters | Relies on rational actors; griefing risk |
| **Threshold-decrypted checks** | Validator committee decrypts margin state at defined intervals | Committee sees positions when checking |
| **MPC-based margin oracle** | Multi-party computation checks margin without revealing positions | Communication overhead; latency |
| **TEE-based liquidation engine** | TEE runs margin checks on plaintext inside enclave | Trust hardware; side-channel risks (TEE.fail) |

#### Private Funding Rate Computation
Funding rates require aggregate position data (total longs vs shorts). With private positions, computing this requires:
- Homomorphic aggregation of encrypted position sizes
- Or MPC aggregation across all positions
- Or periodic ZK proofs of aggregate state

#### Private Insurance Fund / Socialized Loss
When the insurance fund is depleted, socialized loss requires knowing all position sizes — fundamentally incompatible with full privacy. Potential approach: FHE-encrypted positions with threshold decryption triggered only during insurance fund events.

---

## 19. ZK Proof Performance Benchmarks

### 19.1 Current Benchmarks (2024-2026)

| System | Circuit/Workload | Prover Time | Hardware |
|---|---|---|---|
| **Groth16 (ICICLE-Snark)** | Single Keccak proof | **30-40ms** | RTX 4090 GPU |
| **Groth16 (gnark)** | 2^20 constraints | ~2-4s | 64-core CPU |
| **Groth16 (rapidsnark)** | 2^20 constraints | ~3-5s | 64-core CPU |
| **PLONK (Halo2)** | 2^20 constraints | ~5-10s | 64-core CPU |
| **Halo2 (ICICLE v2, GPU)** | ezkl workload | **25x speedup** over CPU | GPU |
| **Plonky2 (STARK)** | 2^20 constraints | ~1-2s | 64-core CPU |
| **Plonky3 (Goldilocks)** | 2^20 constraints | ~0.5-1s | 64-core CPU |
| **Stwo (Circle STARK)** | Starknet block | **940x faster than Stone** | M3 laptop |
| **SP1** | Simple program | ~1-5s | 64-core CPU |
| **SP1 Hypercube** | Ethereum block | **<12 seconds** | GPU cluster |
| **RISC Zero R0VM 2.0** | Ethereum block | **44 seconds** (was 35 min) | GPU |
| **ZKsync Airbender** | Ethereum block | **17s (no recursion)** | H100 GPU |
| **Airbender** | General workload | **21.8M cycles/sec** | H100 GPU |

### 19.2 Hardware Acceleration

| Solution | Hardware | Speedup | Notes |
|---|---|---|---|
| **ICICLE-Snark** (Ingonyama) | RTX 4090 | 63x MSM, 320x FFT | Fastest Groth16 in the world |
| **ICICLE-Halo2 v2** | GPU | 25x over CPU | For ezkl-halo2 workloads |
| **ZKsync Airbender** | H100 | 21.8M cycles/sec | 6x faster than competitors |
| **SP1 GPU** | GPU | ~10x cost reduction | vs CPU proving |
| **Fabric VPU** | Custom ASIC (FC1000) | Programmable, 120 tiles/card | First custom chip for cryptography; Polygon invested $5M |
| **Cysic** | GPU + ASIC network | ComputeFi model | Full-stack proving infrastructure |

**Cost per proof:**
- Airbender: ~$0.0001 per transfer
- SP1/RISC Zero GPU (H100 @ ~$2-3/hr): ~$0.01-0.05 per block proof
- Groth16 on RTX 4090 (30-40ms): sub-cent individual proofs

### 19.3 Folding Schemes — Path to Real-Time Proving

| Scheme | Innovation | Per-Step Cost | Best For |
|---|---|---|---|
| **Nova** (Microsoft) | Folding as alternative to recursive SNARKs | O(1) crypto ops (single MSM) | Sequential computation chains |
| **SuperNova** | Non-uniform IVC (different circuits per step) | Same as Nova per-step | Mixed trade types (market/limit/cancel) |
| **HyperNova** | Generalized to CCS (subsumes R1CS, Plonkish, AIR) | High-degree constraints | Complex matching circuits |
| **ProtoStar** | Folding for PLONK with lookups | PLONK-native | Expressive matching logic |
| **ProtoGalaxy** | Logarithmic field ops + constant hashes per step | Lightest recursion | Maximum throughput |

**Why folding is critical for UltraFast:**
- Each order can be a "step" folded into the running accumulator in **sub-millisecond time**
- Expensive final SNARK proof only needed when posting to settlement layer (can be batched)
- A matching engine could fold each match incrementally, deferring costly compression
- The "fold" operation is extremely cheap (few group operations), enabling per-order folding at exchange speeds

### 19.4 Latest Breakthroughs (2025-2026)

**Circle STARKs (StarkWare):**
- New math using circles over Mersenne-31 field (p = 2^31 - 1)
- M31 field operations **125x faster** than traditional large primes
- Stwo prover: **940x faster** than Stone, 620K hashes/sec on M3 laptop
- Live on Starknet mainnet

**Binius (Binary Field Proofs, Irreducible):**
- Proofs directly over binary fields (GF(2^k)) — native to computers
- **50x more efficient** than Plonky2 for committing 1-bit elements
- Polyhedra's Binary GKR: **5.7x faster** than FRI-Binius for Keccak

**Lookup Arguments (Lasso/Jolt, a16z):**
- Lasso: **10x speedup** over Halo2 lookups (40x expected when optimized)
- Prover only pays for accessed table entries (sparse lookup)
- Jolt: full VM instruction sets via lookups rather than arithmetic circuits

**Airbender (ZKsync, Jan 2026):**
- 21.8M cycles/sec on H100 — new open-source record
- $0.0001/transfer, Ethereum blocks in 17 seconds

### 19.5 Feasibility Assessment for Real-Time ZK Perps

| Requirement | Feasibility | Best Approach | Latency |
|---|---|---|---|
| Per-order validity proof (margin check) | **Achievable with GPU** | ICICLE-Snark Groth16 or folding | 30-200ms (GPU) or sub-ms (fold) |
| Matching engine correctness proof | **Achievable (async)** | Lighter-style: instant soft-confirm, async batch proof | 1-5s per batch |
| 1000-order batch proof | **2-60 seconds** | zkVM on H100 (~2s) or folding + deferred SNARK | 2-60s |
| Client-side order proof (browser) | **Feasible (not for HFT)** | WASM proving | 2-10s |
| Client-side order proof (mobile) | **Feasible** | Mopro toolkit | <5s (modern phones) |
| Cost per proof | **Sub-cent** | GPU batching | $0.0001-0.01 |

**Memory requirements for batch prover:** 64-128 GB RAM + 24 GB+ VRAM (RTX 4090 or A100)

### 19.6 Key Insight: Decouple Execution from Proving

The critical architectural insight from all production ZK trading systems:

```
Execution (real-time)     Proving (async)        Settlement (periodic)
─────────────────────    ──────────────────     ─────────────────────
Match orders instantly    Generate ZK proof       Verify single proof
(off-chain or MPC)        of batch correctness    on-chain (~200K gas)
                          (1-5 seconds)
     <1ms                    1-5s                    next block
```

**No production system generates full validity proofs per-order at exchange speeds (<10ms).** But Lighter demonstrates that **sub-5ms soft finality with asynchronous ZK batch proving** is production-viable ($300B+ weekly volume).

Folding schemes (Nova/SuperNova) offer the most promising path: each fold is near-instant, with the expensive final proof deferred.

---

## 20. Recommended ZK Architecture for UltraFast

### 20.1 Design Philosophy

UltraFast targets the gap identified in Section 17: **no production perp DEX combines full ZK dark pool privacy with perpetual futures**. Our approach layers multiple privacy technologies in a tiered system.

### 20.2 Tiered Privacy Stack

| Tier | Technology | What's Hidden | Performance Impact | Target User |
|---|---|---|---|---|
| **Standard** | TrX-style threshold encrypted mempool | Orders hidden until block finalization | +27ms (14%) | All traders |
| **Enhanced** | + ZK state proofs (Halo2/Noir) | Position sizes, margin ratios, P&L | Slight overhead | Active traders |
| **Shield** | + MPC+ZK dark pool (Renegade-style) | Full pre-trade and post-trade opacity | <1s matching | Institutions ($100K+ orders) |
| **Maximum** | + FHE encrypted state (future, 2027+) | Liquidation levels, funding contributions | TBD | Privacy maximalists |

### 20.3 Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     UltraFast L1 — ZK Stack                    │
│                                                                │
│  ┌──────────────────────┐    ┌─────────────────────────────┐  │
│  │  Threshold Encrypted  │    │  MPC+ZK Dark Pool Module   │  │
│  │  Mempool (TrX-style)  │    │  (Collaborative PLONKs)    │  │
│  │  • 27ms overhead      │    │  • 2-party MPC matching    │  │
│  │  • Batch decryption   │    │  • ZK settlement proofs    │  │
│  │  • All orders private │    │  • $100K+ min order size   │  │
│  │    until consensus    │    │  • DWF/Wintermute as MMs   │  │
│  └──────────┬───────────┘    └──────────┬──────────────────┘  │
│             │                           │                      │
│             ▼                           ▼                      │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              FBA Matching Engine (per block)              │ │
│  │  • Uniform clearing price per market                     │ │
│  │  • Pro-rata fills at same price level                    │ │
│  │  • ZK proof of correct matching (Plonky3 STARK)          │ │
│  │  • Nova folding: each match folded incrementally         │ │
│  └──────────────────────────┬───────────────────────────────┘ │
│                             │                                  │
│  ┌──────────────────────────▼───────────────────────────────┐ │
│  │              ZK Proof Generation (async)                  │ │
│  │  • STARK proof of batch correctness (Plonky3/Stwo)       │ │
│  │  • SuperNova folding for mixed tx types                  │ │
│  │  • Groth16 wrapper for on-chain verification (~200K gas) │ │
│  │  • GPU-accelerated (ICICLE on RTX 4090 / H100)          │ │
│  └──────────────────────────┬───────────────────────────────┘ │
│                             │                                  │
│  ┌──────────────────────────▼───────────────────────────────┐ │
│  │              Private State Layer                          │ │
│  │  • Position sizes as Pedersen commitments                │ │
│  │  • Margin ratios verified by ZK range proofs             │ │
│  │  • Liquidation checked via threshold MPC (no reveal)     │ │
│  │  • Funding rates via homomorphic aggregation             │ │
│  │  • Future: FHE-encrypted positions (2027+)               │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### 20.4 Order Lifecycle with ZK Privacy

```
Phase 1: Order Submission
├── Trader generates Poseidon commitment: C = Commit(price, qty, side, ts, nonce)
├── Generates ZK proof of validity: margin sufficient, price in range, no manipulation
├── Encrypts order with threshold public key (TrX-style)
└── Submits encrypted order + commitment + validity proof to mempool

Phase 2: Consensus (2-phase HotStuff, ~100-200ms)
├── Proposer includes encrypted orders in block (cannot read them)
├── Validators reach consensus on block ordering
├── Threshold decryption reveals orders to matching engine only
└── Block is finalized with instant finality

Phase 3: Matching (FBA, same block)
├── All orders in block matched at uniform clearing price per market
├── Pro-rata fills at same price level (no speed advantage)
├── Each match folded into Nova accumulator (sub-ms per fold)
└── Soft-confirm trades immediately

Phase 4: Proving (async, 1-5 seconds)
├── STARK proof of matching correctness generated (Plonky3)
├── Recursive aggregation of all matches in block (SuperNova)
├── Groth16 wrapper for efficient on-chain verification
└── Proof submitted with next block

Phase 5: State Update
├── Positions updated as Pedersen commitments (sizes hidden)
├── Margin ratios verified by ZK range proofs (no reveal)
├── Insurance fund contributions computed homomorphically
└── State root updated on-chain
```

### 20.5 Dark Pool Module (Shield Tier)

For institutional orders ($100K+), the dark pool provides end-to-end privacy:

```
Institutional Trader                    Market Maker (DWF/Wintermute)
        │                                        │
        ▼                                        ▼
  Secret-share order                     Secret-share quote
  to MPC relayer network                 to MPC relayer network
        │                                        │
        └──────────── 2-Party MPC ───────────────┘
                          │
                 Evaluate matching predicate
                 (buy.price >= sell.price?)
                 WITHOUT revealing either order
                          │
                          ▼
                 Generate collaborative
                 PLONK proof (mpc-jellyfish)
                          │
                          ▼
               On-chain settlement:
               • Verify PLONK proof (~200K gas)
               • Update encrypted balances
               • No order details ever revealed
```

**Performance targets:**
- Matching latency: <1 second (Renegade achieves this in production)
- Gas cost: <$0.30 per trade (using Arbitrum Stylus-style optimizations)
- Privacy: Neither party, nor the protocol, ever sees the counterparty's order

### 20.6 Proving Stack Selection

| Component | Proving System | Why |
|---|---|---|
| **Order validity proof** (client-side) | Groth16 via ICICLE-Snark | 30-200ms on GPU; smallest proof for on-chain verification |
| **Matching correctness** (server-side) | Plonky3 STARK over Goldilocks | Fastest large-circuit prover; no trusted setup |
| **Batch aggregation** | SuperNova folding | Handles mixed tx types (market/limit/cancel); sub-ms per fold |
| **On-chain verification** | Groth16 wrapper | ~200K gas; amortized over entire batch |
| **Dark pool matching** | Collaborative PLONK (mpc-jellyfish) | Proven in production by Renegade |
| **Position state proofs** | Halo2 (IPA, no trusted setup) | Recursive, flexible for margin/liquidation circuits |

### 20.7 Comparison: UltraFast ZK vs Competitors

| | **UltraFast** | **GRVT** | **Paradex** | **Lighter** | **Renegade** |
|---|---|---|---|---|---|
| Order privacy | Full (threshold + MPC) | Validium (operator sees) | STARK-based | None (sequencer sees) | Full (MPC+ZK) |
| Position privacy | ZK commitments | Validium hides | STARK hides | None | N/A (spot only) |
| Liquidation privacy | Threshold MPC | Hidden via validium | STARK-based | Public | N/A |
| Matching model | FBA (uniform price) | CLOB | CLOB | CLOB (ZK-proven) | Midpoint (Binance) |
| MEV protection | Structural (FBA + encrypted mempool + Groundhog) | Validium opacity | STARK opacity | Speed-based | Full (dark pool) |
| Perps? | Yes | Yes | Yes | Yes | No (spot only) |
| Dark pool | MPC+ZK (institutional) | No | No | No | Yes (all orders) |
| Proof system | STARK → Groth16 wrapper | zkSync ZK Stack | StarkWare STARK | Custom SNARK (Plonky2) | Collaborative PLONK |
| On-chain cost | ~200K gas/batch | zkSync gas | Starknet gas | ~200K gas/batch | ~200K gas/trade |

---

## 21. Updated Research Agenda — ZK Privacy Track

### Priority 1: Core ZK Architecture (Weeks 1-4)

| # | Item | Goal | Resources |
|---|---|---|---|
| 1.1 | **Renegade codebase study** | Deep dive into mpc-jellyfish collaborative PLONK implementation. Can we extend to perps (margin, liquidation, funding)? | GitHub: `renegade-fi/renegade`, `renegade-fi/mpc-jellyfish` |
| 1.2 | **FBA matching circuit design** | Design ZK circuit for proving FBA matching correctness (uniform clearing price, pro-rata fills). Estimate constraint count. | Plonky3 + Halo2 prototyping |
| 1.3 | **Nova/SuperNova folding prototype** | Build PoC of incremental trade folding. Measure per-fold latency and final proof generation time. | Microsoft Nova repo, ProtoStar papers |
| 1.4 | **Threshold encryption integration** | Prototype TrX-style batched threshold encryption with our HotStuff consensus. Measure actual overhead. | TrX paper (ePrint 2025/2032), Ferveo |
| 1.5 | **Client-side order proof** | Prototype Groth16 order validity proof (margin check) in browser WASM and native. Target: <2s browser, <200ms native GPU. | ICICLE-Snark, wasm-snark |

### Priority 2: Private Perps Primitives (Weeks 3-8)

| # | Item | Goal | Resources |
|---|---|---|---|
| 2.1 | **Private liquidation design** | Evaluate all 4 approaches (self-report, threshold, MPC oracle, TEE). Build prototype of most promising. | Section 18.8 analysis |
| 2.2 | **Private funding rate computation** | Design homomorphic aggregation of encrypted position sizes for funding rate calculation. | FHE literature, Pedersen commitment arithmetic |
| 2.3 | **ZK margin verification circuit** | Design and benchmark circuit for proving margin ratio > maintenance margin without revealing position size. | Halo2, range proof techniques |
| 2.4 | **Collaborative PLONK for perps** | Extend Renegade's collaborative PLONK to include perps-specific constraints (leverage limits, funding, mark price). | mpc-jellyfish codebase |
| 2.5 | **Position commitment scheme** | Design Pedersen commitment scheme for positions that supports homomorphic addition (for aggregate OI calculation). | Pedersen commitments, Bulletproofs |

### Priority 3: Performance Optimization (Weeks 6-10)

| # | Item | Goal | Resources |
|---|---|---|---|
| 3.1 | **GPU prover benchmarking** | Benchmark ICICLE-Snark, Plonky3 GPU, and Stwo on our specific circuits. Determine hardware requirements. | ICICLE SDK, RTX 4090 / H100 |
| 3.2 | **Batch proof optimization** | Optimize batch size vs proof time trade-off. Target: 1000-order batch in <5s on H100. | Plonky3, SuperNova |
| 3.3 | **Circle STARK evaluation** | Evaluate Stwo (Circle STARKs over M31) for matching proofs. 125x faster field ops could be transformative. | StarkWare Stwo codebase |
| 3.4 | **Noir circuit development** | Evaluate Aztec's Noir for writing perps circuits (margin, liquidation). Compare dev experience vs raw Halo2. | Noir docs, Aztec Ignition |
| 3.5 | **Prover infrastructure design** | Design the prover cluster: how many GPUs, failover, proof pipeline, cost projections. | Cloud GPU pricing, ICICLE benchmarks |

### Priority 4: Competitive Intelligence (Ongoing)

| # | Item | Goal | Resources |
|---|---|---|---|
| 4.1 | **Defx monitoring** | Track Defx's L1 dark pool perps development (Pantera-backed, most direct competitor). | Defx blog, Discord |
| 4.2 | **GRVT architecture study** | Study GRVT's Validium privacy model in detail. What can we learn? Where are its limitations? | GRVT docs, zkSync ZK Stack |
| 4.3 | **Lighter circuit audit** | Study Lighter's open-sourced ZK circuits (Dec 2025) for matching engine design patterns. | Lighter GitHub, ZK Security audit |
| 4.4 | **FHE acceleration tracking** | Monitor Zama's GPU/ASIC roadmap. When FHE reaches 1000+ TPS, it enables fully encrypted position state. | Zama blog, fhEVM releases |
| 4.5 | **Aster L1 launch analysis** | Study Aster's ZK-verifiable encryption on custom L1 (March 2026 launch). | Aster docs |

---

## 22. References

### Academic Papers

| Paper | Authors | Year | Relevance |
|---|---|---|---|
| [Groundhog: Linearly-Scalable Smart Contracting via Commutative Transaction Semantics](https://arxiv.org/abs/2404.03201) | Ramseyer, Mazieres (Stanford) | 2024 | Core execution model |
| [HotStuff: BFT Consensus in the Lens of Blockchain](https://arxiv.org/abs/1803.05069) | Yin, Malkhi, Reiter, Gueta, Abraham | 2018 | Base consensus |
| [HotStuff-2: Optimal Two-Phase Responsive BFT](https://eprint.iacr.org/2023/397) | Malkhi | 2023 | 2-phase optimization |
| [Jolteon and Ditto: Network-Adaptive Efficient Consensus](https://arxiv.org/abs/2106.10362) | Gelashvili et al. | 2021 | Aptos consensus base |
| [MonadBFT: Fast, Responsive, Fork-Resistant Streamlined Consensus](https://arxiv.org/abs/2502.20692) | Monad team | 2025 | Tail-forking resistance |
| [TrX: Encrypted Mempools in High Performance BFT Protocols](https://eprint.iacr.org/2025/2032) | Fernando et al. (Aptos Labs) | 2025 | Encrypted mempool |
| [Mempool Privacy via Batched Threshold Encryption: Attacks and Defenses](https://eprint.iacr.org/2024/669) | Choudhuri et al. | 2024 | Threshold encryption attacks/defenses |
| [Weighted Batched Threshold Encryption with Applications to Mempool Privacy](https://eprint.iacr.org/2025/2115) | — | 2025 | Stake-weighted threshold encryption |
| [SoK: Fully-homomorphic encryption in smart contracts](https://eprint.iacr.org/2025/527.pdf) | Aronoff | 2025 | FHE in smart contracts survey |
| [LazyArc: Dynamic Out-of-Order Engine for High-Throughput FHE](https://eprint.iacr.org/2026/363) | — | 2026 | FHE hardware acceleration |
| [TEE.fail: Breaking Trusted Execution Environments](https://tee.fail/files/paper.pdf) | Georgia Tech, Purdue, Synkhronix | 2025 | TEE side-channel attacks |
| [Masquerade: Simple and Lightweight Transaction Reordering Mitigation](https://arxiv.org/abs/2308.15347) | Vedula et al. (Ohio State) | 2025 | Lightweight MEV mitigation |
| [Themis: Fast, Strong Order-Fairness in Byzantine Consensus](https://eprint.iacr.org/2021/1465) | Kelkar et al. | 2021 | Fair ordering |
| [Aequitas: Order-Fairness for Byzantine Consensus](https://eprint.iacr.org/2020/269) | Kelkar, Zhang et al. | 2020 | Order-fairness definition |
| [Ferveo: Threshold Decryption for Mempool Privacy](https://eprint.iacr.org/2022/898) | Anoma/Namada | 2022 | Threshold decryption |
| [Fast-HotStuff: A Fast and Resilient HotStuff Protocol](https://arxiv.org/abs/2010.11454) | Jalalzai et al. | 2020 | 2-round HotStuff |
| [Mysticeti: Reaching the Latency Limits with Uncertified DAGs](https://arxiv.org/abs/2310.14821) | Sui team | 2023 | DAG consensus comparison |

### Code Repositories

| Repo | Language | Relevance |
|---|---|---|
| [`scslab/smart-contract-scalability`](https://github.com/scslab/smart-contract-scalability) | C++ | Groundhog implementation |
| [`aptos-core`](https://github.com/aptos-labs/aptos-core) | Rust | AptosBFT (Jolteon), encrypted mempool |
| [`onflow/flow-go`](https://github.com/onflow/flow-go) | Go | HotStuff implementation |
| [`dydxprotocol/v4-chain`](https://github.com/dydxprotocol/v4-chain) | Go | dYdX v4 Cosmos appchain |

### Documentation & Analysis

- [Hyperliquid Architecture](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/overview)
- [HyperBFT Wiki](https://hyperliquid-co.gitbook.io/wiki/architecture/hyperbft)
- [Injective FBA Design](https://blog.injective.com/injective-exchange-upgrade-a-novel-order-matching-mechanism/)
- [dYdX v4 MEV Architecture](https://www.dydx.xyz/blog/architecture-to-mitigate-mev)
- [Sei Twin-Turbo Consensus](https://docs.sei.io/learn/twin-turbo-consensus)
- [MonadBFT Documentation](https://docs.monad.xyz/monad-arch/consensus/monad-bft)
- [Aptos Encrypted Mempool](https://medium.com/aptoslabs/aptos-encrypted-mempool-native-transaction-intent-confidentiality-on-aptos-e90da3cfb254)
- [Decentralized Thoughts: HotStuff-2 Comparison](https://decentralizedthoughts.github.io/2023-04-01-hotstuff-2/)
- [The Onchain CLOB Landscape (Flow Traders)](https://flowtraders.substack.com/p/the-onchain-clob-landscape)

### Privacy-Preserving Technology References

**FHE:**
- [Zama fhEVM Coprocessor](https://www.zama.org/post/fhevm-coprocessor)
- [Zama fhEVM GitHub](https://github.com/zama-ai/fhevm)
- [Zama fhEVM Whitepaper](https://github.com/zama-ai/fhevm/blob/main/fhevm-whitepaper.pdf)
- [fhEVM v0.7 Changelog (July 2025)](https://docs.zama.org/change-log/release/fhevm-v0.7-july-2025)
- [Fhenix CoFHE on Base (Feb 2026)](https://bingx.com/en/news/post/fhenix-unveils-fhe-powered-confidential-defi-stack-for-public-blockchains-in-february)
- [Fhenix Privacy in DeFi 2025 Recap](https://www.fhenix.io/blog/privacy-in-defi-2025-landscape-recap)
- [Inco Network 2025 Roundup](https://www.inco.org/blog/2025-roundup)
- [Inco + Circle Confidential ERC-20 Framework](https://www.circle.com/blog/confidential-erc-20-framework-for-compliant-on-chain-privacy)
- [Sunscreen: Building a Truly Dark Dark Pool](https://blog.sunscreen.tech/building-a-truly-dark-dark-pool-2/)
- [Building a Dark Pool on Stellar: MPC, FHE, TEEs Compared](https://stellar.org/blog/developers/building-a-dark-pool-on-stellar-mpc-fhe-and-tees-compared)

**Threshold Encryption:**
- [Shutter Network: Applied MEV Protection](https://blog.shutter.network/applied-mev-protection-via-shutters-threshold-encryption/)
- [Shutter: First Encrypted Mempool for PBS on Ethereum](https://blog.shutter.network/the-first-encrypted-mempool-is-coming-to-pbs-on-ethereum/)
- [Ferveo GitHub (Anoma)](https://github.com/anoma/ferveo)
- [Batched Threshold Encryption Update (HackMD)](https://hackmd.io/@guruvamsi-policharla/batched-threshold-update)

**TEE:**
- [Silhouette Shield Exchange on Hyperliquid](https://silhouette.exchange/)
- [Flashbots Sirrah TEE Coprocessor](https://writings.flashbots.net/suave-tee-coprocessor)
- [Flashbots Project T-TEE](https://collective.flashbots.net/t/project-t-tee-from-trusted-to-trustless-execution-environments/3541)
- [Flashbots BuilderNet Incident Report (Dec 2025)](https://collective.flashbots.net/t/buildernet-incident-report-december-9-2025/5417)
- [Oasis Sapphire Documentation](https://docs.oasis.io/build/sapphire/)
- [Oasis TEE Break Challenge](https://oasis.net/blog/oasis-tee-break-challenge)
- [TEE.fail Attack Details](https://www.bleepingcomputer.com/news/security/teefail-attack-breaks-confidential-computing-on-intel-amd-nvidia-cpus/)

**Hybrid Approaches & Comparisons:**
- [Privacy Stack Wars: ZK vs FHE vs TEE vs MPC (BlockEden, Jan 2026)](https://blockeden.xyz/blog/2026/01/27/privacy-infrastructure-zk-fhe-tee-mpc-comparison-benchmarks/)
- [Privacy Trilemma: ZK, FHE, TEE (BlockEden, Feb 2026)](https://blockeden.xyz/blog/2026/02/12/privacy-infrastructure-trilemma-zk-fhe-tee/)
- [Web3 Privacy Infrastructure 2026 (BlockEden)](https://blockeden.xyz/blog/2026/02/04/web3-privacy-infrastructure-zk-fhe-tee-reshaping-blockchain/)
- [ZKPs, FHE, MPC: Managing Private State in Blockchains (Alliance)](https://alliance.xyz/essays/zkps-fhe-mpc-managing-private-state-in-blockchains)
- [Privacy Trends for 2026 (insights4vc)](https://insights4vc.substack.com/p/privacy-trends-for-2026)
- [Technology Stack Powering Blockchain Privacy 2026 (Bitfinity)](https://www.blog.bitfinity.network/the-technology-stack-powering-blockchain-privacy-in-2026/)
- [Nillion Blind Computing Roadmap 2025](https://nillion.com/news/nillions-tech-roadmap-2025-advancing-the-blind-computer/)
- [Mind Network FHE Infrastructure](https://docs.mindnetwork.xyz/minddocs)
- [Inco: FHE vs TEE Comparison](https://www.inco.org/blog/tee-fhe-comparison)

**Privacy-Preserving Perps DEXs:**
- [DEFX: ZK-encrypted Orderbooks](https://blog.sunscreen.tech/building-a-truly-dark-dark-pool-2/)
- [GRVT: zkSync Validium Private Perps](https://www.grvt.io/)
- [Lighter: ZK-rollup Order Matching](https://www.lighter.xyz/)
- [Hibachi: ZK-encrypted Perps on Celestia](https://www.hibachi.xyz/)
- [Defx Layer 1 Dark Pool DEX for Perps (Pantera-backed)](https://www.coindesk.com/press-release/2025/06/12/defx-raises-25m-to-launch-a-layer-1-dark-pool-dex-for-perpetual-futures-trading)

**ZK Dark Pool Protocols (Section 7.8):**
- [Renegade Whitepaper v0.6](https://whitepaper.renegade.fi)
- [Renegade Documentation: MPC-ZKP Architecture](https://docs.renegade.fi/core-concepts/mpc-zkp)
- [Renegade GitHub (main repo)](https://github.com/renegade-fi/renegade)
- [Renegade MPC-Jellyfish (PLONK with MPC extensions)](https://github.com/renegade-fi/mpc-jellyfish)
- [Renegade Contracts (Stylus/Solidity)](https://github.com/renegade-fi/renegade-contracts)
- [Renegade x Arbitrum Stylus Case Study](https://blog.arbitrum.io/renegade-stylus-case-study/)
- [Penumbra Protocol Specification](https://protocol.penumbra.zone/main/index.html)
- [Penumbra DEX (ZSwap) Documentation](https://guide.penumbra.zone/dex)
- [Penumbra decaf377 Group](https://github.com/penumbra-zone/decaf377)
- [Penumbra ZK Proofs Introduction](https://www.penumbra.zone/blog/zkproofs-intro)
- [Aztec Network (Ignition Chain)](https://aztec.network/)
- [Noir Language Documentation](https://noir-lang.org/docs/)
- [Aztec.nr Private Smart Contract Framework](https://aztec.network/blog/introducing-aztec-nr-aztecs-private-smart-contract-framework)
- [Noir 1.0 Pre-Release Announcement](https://aztec.network/blog/the-future-of-zk-development-is-here-announcing-the-noir-1-0-pre-release)
- [Panther Protocol](https://www.pantherprotocol.io/)
- [Portal Gate Overview](https://singularityzk.medium.com/what-is-portal-gun-448fa51be945)
- [Tristero (General Catalyst Investment)](https://www.generalcatalyst.com/stories/our-investment-in-tristero)
- [Polyhedra Fully On-Chain Dark Pool DEX Proposal](https://blog.polyhedra.network/proposal-for-a-fully-on-chain-dark-pool-dex/)
- [CZ Dark Pool Perp DEX Proposal (June 2025)](https://beincrypto.com/dark-pool-dex-for-perps-cz/)
- [Flashbots Crypto Dark Pool Design Playbook](https://collective.flashbots.net/t/the-crypto-dark-pool-design-playbook/3752)

**Collaborative SNARK Academic Papers (Section 7.8.7):**
- [Ozdemir & Boneh: Experimenting with Collaborative zk-SNARKs (USENIX 2022)](https://www.usenix.org/conference/usenixsecurity22/presentation/ozdemir)
- [Ozdemir Collaborative zkSNARK GitHub](https://github.com/alex-ozdemir/collaborative-zksnark)
- [Liu et al.: Scalable Collaborative zk-SNARK (2024)](https://eprint.iacr.org/2024/143)
- [Liu et al.: Scalable Collaborative zk-SNARK -- Proof Delegation (2024)](https://eprint.iacr.org/2024/940)
- [Garg & Goel: Jigsaw -- Doubly Private Smart Contracts (2025)](https://eprint.iacr.org/2025/1147)
- [Cryptobazaar: Private Sealed-bid Auctions at Scale (2024)](https://eprint.iacr.org/2024/1410)
- [Wei: zk-STARKs Based Sealed Auctions (2024)](https://ietresearch.onlinelibrary.wiley.com/doi/10.1049/blc2.12090)
- [Kissner & Song: Privacy-Preserving Set Operations (CMU)](https://www.cs.cmu.edu/~leak/papers/set-tech-full.pdf)
- [PSI Systematic Literature Review (2023)](https://www.sciencedirect.com/science/article/pii/S1574013723000345)

**ZK Proving Systems & Benchmarks:**
- [ICICLE-Snark: Fastest Groth16 (Ingonyama)](https://medium.com/@ingonyama/icicle-snark-the-fastest-groth16-implementation-in-the-world-00901b39a21f)
- [ICICLE-Halo2 v2 (Ingonyama)](https://www.ingonyama.com/post/2-fast-2-furious-icicle-halo2-v2)
- [ZKsync Airbender: Fastest RISC-V zkVM](https://zksync.mirror.xyz/ZgRmbYA_EE3wfGcXWv81m-xcED-ppNKkRzkleS6YZRc)
- [SP1 Benchmarks (Succinct)](https://blog.succinct.xyz/sp1-benchmarks-8-6-24/)
- [SP1 Hypercube: Real-Time Ethereum Proving](https://www.theblock.co/post/355013/succinct-introduces-zkvm-sp1-hypercube-claims-real-time-ethereum-proving)
- [RISC Zero Performance Benchmarks](https://dev.risczero.com/api/zkvm/benchmarks)
- [R0VM 2.0 Datasheet](https://benchmarks.risczero.com/main/datasheet)
- [S-two: Fastest Prover on Starknet Mainnet](https://www.starknet.io/blog/s-two-is-live-on-starknet-mainnet-the-fastest-prover-for-a-more-private-future/)
- [Circle STARKs (StarkWare)](https://starkware.co/blog/circle-starks/)
- [PLONK Benchmarks I (Aztec)](https://aztec.network/blog/plonk-benchmarks-i----2-5x-faster-than-groth16-on-mimc)
- [PLONK Benchmarks II (Aztec)](https://aztec.network/blog/plonk-benchmarks-ii----5x-faster-than-groth16-on-pedersen-hashes)
- [Binius64 (Irreducible)](https://www.irreducible.com/posts/announcing-binius64)
- [Binary GKR Speed Record (Polyhedra)](https://blog.polyhedra.network/binary-gkr/)
- [Lasso & Jolt (a16z)](https://a16zcrypto.com/posts/article/introducing-lasso-and-jolt/)
- [Nova Folding (Microsoft)](https://github.com/microsoft/Nova)
- [Folding Schemes Guide (Taiko)](https://taiko.mirror.xyz/tk8LoE-rC2w0MJ4wCWwaJwbq8-Ih8DXnLUf7aJX1FbU)
- [Fabric Cryptography VPU](https://polygon.technology/blog/fabric-teams-up-with-polygon-labs-to-introduce-revolutionary-hardware-verifiable-processing-units-vpus-for-zk)
- [Cysic ComputeFi Report](https://medium.com/@0xjacobzhao/cysic-research-report-the-computefi-path-of-zk-hardware-acceleration-3b4517cd183b)
- [FibRace: Mobile ZK Proving Benchmark](https://www.emergentmind.com/papers/2510.14693)
- [Mopro: Mobile Prover (GitHub)](https://github.com/zkmopro/mopro)
- [Benchmarking zkVMs (Fenbushi)](https://fenbushi.vc/2025/08/29/benchmarking-zkvms-current-state-and-prospects/)

**ZK Perps & Dark Pool Projects:**
- [Lighter Whitepaper](https://assets.lighter.xyz/whitepaper.pdf)
- [Lighter ZK Circuits Audit (ZK Security)](https://blog.zksecurity.xyz/posts/lighter-xyz/)
- [GRVT: Trustless and Privacy with Validium](https://grvt.io/blog/why-zksyncs-zk-stack-series-part-2-trustless-and-privacy-with-validium/)
- [Paradex Review 2026](https://decentralised.news/paradex-review-2026-starknet-appchain-perp-dex)
- [Aster Chain March 2026 Launch](https://blog.mexc.com/news/aster-chain-march-2026-cz-backed-dex-launches-privacy-layer-1/)
- [Defx: L1 Dark Pool for Perps (Pantera)](https://www.coindesk.com/press-release/2025/06/12/defx-raises-25m-to-launch-a-layer-1-dark-pool-dex-for-perpetual-futures-trading)
- [CZ Dark Pool Perp DEX Proposal](https://beincrypto.com/dark-pool-dex-for-perps-cz/)
- [Perp DEX Wars 2026](https://blockeden.xyz/blog/2026/01/29/perp-dex-wars-2026-hyperliquid-lighter-aster-edgex-paradex-decentralized-derivatives/)
- [Polyhedra Dark Pool DEX Proposal](https://blog.polyhedra.network/proposal-for-a-fully-on-chain-dark-pool-dex/)
- [zkHyperliquid (ETHGlobal PoC)](https://github.com/BrianSeong99/zkHyperliquid)
- [COMMON Protocol Paper](https://eprint.iacr.org/2023/1868)
- [Invisibook on CKB](https://talk.nervos.org/t/dis-decentralized-privacy-order-book-appchain-based-on-ckb-l1-2026-phase-1/10015)
- [Spark on Polygon Miden](https://medium.com/sprkfi/developing-a-privacy-focused-decentralized-order-book-exchange-on-polygon-miden-95547119543f)
- [Flashbots Crypto Dark Pool Design Playbook](https://collective.flashbots.net/t/the-crypto-dark-pool-design-playbook/3752)

**ZK Cryptography Papers:**
- [Ozdemir & Boneh: Collaborative zk-SNARKs (USENIX 2022)](https://www.usenix.org/conference/usenixsecurity22/presentation/ozdemir)
- [Liu et al.: Scalable Collaborative zk-SNARK (2024)](https://eprint.iacr.org/2024/143)
- [Garg & Goel: Jigsaw — Doubly Private Smart Contracts (2025)](https://eprint.iacr.org/2025/1147)
- [Cryptobazaar: Private Sealed-bid Auctions at Scale (2024)](https://eprint.iacr.org/2024/1410)
- [Zexe: Enabling Decentralized Private Computation (2018)](https://eprint.iacr.org/2018/962.pdf)
- [Dan Boneh: Privacy on the Blockchain (Stanford CS251, Fall 2025)](https://cs251.stanford.edu/lectures/lecture14.pdf)
- [Scaling DeFi with ZK Rollups (arXiv)](https://arxiv.org/html/2506.00500v1)

---

*This document is a living research artifact. It will be updated as research progresses and design decisions are finalized.*
