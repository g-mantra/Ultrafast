# UltraFast: Action Plan

> **Date:** 2026-03-24
> **Status:** Architecture Firming
> **Companion:** See `RESEARCH.md` for full research backing each decision below.

---

## 1. Vision & Goals

UltraFast is a **unified on-chain derivatives platform** built on a custom Layer 1 blockchain. It combines perpetual futures (HIP-3 style) and scalar prediction markets (HIP-4 style) under a single matching engine and margin system, sharing liquidity across both product types for maximum capital efficiency.

### Hard Requirements

| # | Requirement | Why It Matters |
|---|-------------|----------------|
| 1 | **CEX-grade speed** — sub-200ms finality, 200K+ ops/sec | Traders will not move from Hyperliquid to a slower system. Speed is table stakes. |
| 2 | **Blind orders** — all orders encrypted until after consensus | Prevents front-running, sandwich attacks, and liquidation hunting. No participant — including validators — sees order content before execution. |
| 3 | **Structural MEV elimination** — protocol-level, not speed-based | Speed alone (Hyperliquid's approach) does not prevent a co-located validator from extracting value. MEV must be eliminated by design. |
| 4 | **Shared liquidity** — perps and prediction markets in one margin system | Capital locked in a prediction market position should offset risk on a perp position. Cross-product margining unlocks capital efficiency no competitor offers. |

### Key Differentiators vs Hyperliquid

- **Structural fairness**: encrypted mempool + orderless execution + batch auctions vs speed-only MEV defense
- **Prediction markets**: native scalar outcome trading with shared margin (Hyperliquid treats these as separate products)
- **RWA perpetuals**: gold, equities, FX, treasury yields via MANTRA ecosystem integration
- **Protocol-native dark pool**: MPC+ZK private matching built into the chain, not a third-party overlay
- **Open validator set and open-source matching engine** (vs Hyperliquid's closed-source, team-controlled validators)

---

## 2. Validated Architecture

Research has converged on the following technical stack. Each component is backed by production evidence or peer-reviewed work (see RESEARCH.md for citations).

### Consensus: 2-Phase Pipelined HotStuff + MonadBFT

- **2-chain commit rule** — two round-trips to finality (~100-200ms)
- **Linear O(n) message complexity** on happy path (scales to ~100 validators)
- **MonadBFT tail-forking resistance** — prevents a malicious leader from forking away its predecessor's block
- **VRF-based leader rotation** and optimistic responsiveness (no fixed timeouts)
- **Why not DAG-based?** DAG protocols (Narwhal/Bullshark/Mysticeti) offer higher throughput but 3-6x worse latency and non-deterministic ordering — unsuitable for a CLOB.

### Execution: Groundhog Commutative Model

- All transactions in a block read the same **state snapshot** (block-start state)
- No read-after-write dependency between transactions → **no intra-block ordering exists**
- Commutative balance updates (additions commute; conflicts handled via reserve-commit)
- **MEV implication**: block producers literally cannot reorder transactions for profit because order doesn't exist
- **Performance**: 500K+ payment TPS on 96-core machine with near-linear scaling; identical throughput under extreme contention

### Matching: Frequent Batch Auctions (FBA)

- All orders within a block matched at a **uniform clearing price** per market
- Same-price orders filled **pro-rata** (not time-priority) — no speed advantage
- Cancels processed before matching in each block (zero-cost within batch)
- Serves **both** perps and prediction markets through the same engine
- **MEV implication**: no front-running (all get same price), no sandwiching (no sequential price differences)

### MEV Elimination Stack (Three Layers)

```
Layer 1: Threshold Encrypted Mempool (TrX-style)
         Orders encrypted with threshold public key → validators see only ciphertext
         Batched decryption after consensus → only 27ms overhead (14%)
         → Eliminates pre-trade information leakage

Layer 2: Groundhog Commutative Execution
         No intra-block transaction ordering
         → Eliminates reordering-based MEV (structurally impossible)

Layer 3: Frequent Batch Auctions
         Uniform clearing price, pro-rata fills
         → Eliminates speed-based MEV and sandwich attacks
```

**Combined result**: the only remaining MEV vector is information-based (superior oracle data), which is a feature of efficient markets, not an exploit.

### Privacy Tiers

| Tier | Technology | What's Hidden | Overhead | Target User |
|------|-----------|---------------|----------|-------------|
| **Standard** | Threshold encrypted mempool | Orders until block finality | +27ms | All traders |
| **Enhanced** | + ZK state proofs (Pedersen commitments, range proofs) | Position sizes, margin ratios, liquidation levels | Slight | Active traders |
| **Shield** | + MPC+ZK dark pool (Renegade-style collaborative PLONKs) | Full pre-trade and post-trade opacity | <1s matching | Institutions ($100K+) |

### Order Lifecycle

```
1. Trader encrypts order with threshold public key + attaches ZK validity proof
2. Encrypted order enters mempool (no one can read it)
3. Leader includes encrypted orders in block proposal
4. Validators reach consensus on block (2-phase HotStuff, ~100-150ms)
5. Batched threshold decryption reveals orders (~27ms)
6. Groundhog execution: all orders read same state snapshot
7. FBA matching engine runs per-market:
   - Compute uniform clearing price
   - Match at clearing price (pro-rata at same level)
   - Apply commutative balance updates
8. State committed — instant finality
```

Total target: **<200ms** from order submission to finality.

---

## 3. Product Architecture

### Perpetual Futures (HIP-3 Style)

Standard continuous-price derivatives with no expiration:
- **Assets**: crypto (BTC, ETH, SOL, OM) + RWA (gold, equities, FX, treasury yields)
- **Leverage**: up to 50x (crypto), 20x (RWA)
- **Funding rate**: periodic payments between longs and shorts to anchor contract price to spot
- **Liquidation**: gradual liquidation engine with insurance fund backstop
- **Collateral**: USDC (primary), OM, yield-bearing assets (stATOM, stETH), MANTRA RWA tokens

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
- Same MEV protections (encrypted mempool, Groundhog, FBA) apply to all order types

---

## 4. Open Design Decisions

These must be resolved before implementation begins. Each requires either simulation, prototyping, or team alignment.

| Decision | Options | Key Trade-off |
|----------|---------|---------------|
| **FBA vs continuous matching** | Pure FBA for all markets; continuous for perps + FBA for prediction markets; or configurable per market | Fairness (FBA) vs perceived latency/UX (continuous). FBA at 200ms blocks may feel near-real-time. |
| **Scalar range design** | Fixed ranges set at market creation; dynamic ranges that adjust; range width as a market parameter | Narrow ranges increase leverage risk; wide ranges reduce capital efficiency. |
| **Prediction market oracle** | Decentralized oracle committee; optimistic oracle with dispute period; UMA-style escalation | Event resolution is inherently subjective — needs robust dispute mechanism. |
| **Funding rate for scalar markets** | Oracle-anchored (reference external probability estimates); pure market-driven (no anchor); hybrid | No natural "spot" for event probability — this is a fundamental design challenge. |
| **Cross-product risk model** | Portfolio margining (correlations-based); simple additive offsets; SPAN-style risk arrays | Complexity vs accuracy. Portfolio margin is most capital-efficient but hardest to implement and prove in ZK. |
| **Leveraged prediction market liquidation** | Standard perps-style liquidation; gradual de-leveraging; auto-close at boundary approach | Must handle edge cases where scalar markets approach boundary (0 or 1) rapidly. |
| **Validator set** | Permissioned at launch → open over time; permissionless from day 1 | Latency/coordination vs decentralization. Hyperliquid launched permissioned. |
| **Smart contract support** | Pure matching engine (max performance); general WASM contracts; hybrid (native matching + limited contracts) | Composability vs performance. Composability enables third-party innovation but adds attack surface. |
| **Implementation language** | Full Rust; Rust + C++ (Groundhog is C++); Rust with WASM for contracts | Rust is industry standard. Groundhog's C++ codebase (~30K lines) needs porting or FFI integration. |

---

## 5. Remaining Work

### Phase A — Core Infrastructure

Build the L1 foundation. Everything else depends on this.

- **Consensus prototype**: implement 2-phase pipelined HotStuff with MonadBFT tail-forking resistance. Evaluate existing Rust BFT frameworks (`aptos-core`, `hotstuff-rs`, `tendermint-rs`) vs building from scratch.
- **Groundhog execution engine**: assess Rust port of the C++ codebase (~30K lines) vs FFI integration. Prototype commutative balance updates and reserve-commit for order matching.
- **Threshold encryption integration**: prototype TrX-style batched threshold decryption within consensus. Measure actual latency overhead against 200ms finality budget.
- **FBA matching engine**: build prototype supporting both perps and scalar prediction market order types. Benchmark with cancel-heavy workloads (MMs cancel 10-100x more than they fill).
- **End-to-end benchmark**: target 200K+ ops/sec, <200ms block finality. Compare against Hyperliquid's 200K ops/sec and 70ms blocks.

### Phase B — Product Mechanics

Build the trading products on top of the L1.

- **Perps engine**: margin calculation, funding rate computation, gradual liquidation, insurance fund management. Simulate with real Hyperliquid order flow data.
- **Scalar prediction market engine**: range settlement mechanics, event oracle integration, expiration handling, permissionless market deployment (stake-gated).
- **Unified margin system**: cross-product risk model, risk offsetting logic, excess margin release. This is novel — requires careful simulation and formal analysis.
- **Resolve open design decisions**: run simulations for FBA vs continuous matching, scalar range parameters, and funding rate designs. Use results to commit to specific approaches.

### Phase C — Privacy & ZK Stack

Layer privacy on top of the working L1.

- **Threshold encrypted mempool**: production integration of TrX-style batched encryption with consensus layer.
- **ZK validity proofs**: client-side proofs (Groth16 via ICICLE-Snark) attached to encrypted orders proving margin sufficiency, order well-formedness.
- **ZK state proofs**: Pedersen commitments for position sizes, range proofs for margin ratios. Enables Enhanced privacy tier.
- **Dark pool Phase 1**: RFQ system for designated MMs + intent/solver auction for block trades. Minimal cryptography.
- **Dark pool Phase 2**: MPC+ZK collaborative matching (study Renegade's `mpc-jellyfish` codebase). Extend to perps-specific constraints (margin, liquidation, funding).

### Phase D — Ecosystem & Launch

Prepare for mainnet.

- **Oracle infrastructure**: Pyth + Chainlink + custom TWAP for asset prices. Design event resolution oracle for prediction markets (dispute mechanism is critical).
- **IBC bridge**: MANTRA interop for RWA token collateral, Noble USDC.
- **Market maker onboarding**: API documentation, WebSocket feeds, FIX protocol connectivity. Target DWF, Wintermute, GSR, Flow Traders, Amber.
- **Compliance**: zk-KYC integration (Privado ID / Polygon ID), permissioned institutional pools.
- **RWA perps**: gold, equity index, FX, and treasury yield perpetuals using MANTRA RWA price feeds.
- **Audits**: 2+ top firms (Trail of Bits, OtterSec, Zellic). Bug bounty ($5M+). Formal verification of matching engine and consensus.

---

## 6. Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Hyperliquid network effects** | High | Target underserved segments: institutions (dark pool, compliance), RWA traders, prediction market users. Don't compete on speed alone. |
| **Low initial liquidity** | High | Multi-MM strategy (DWF + Wintermute + GSR), aggressive maker rebates (-0.01%), pre-deposit points campaign. |
| **Groundhog immaturity** | High | Matching engine as block-level privileged operation (not general contracts). Invest in formal verification of commutative semantics. |
| **Prediction market oracle disputes** | Medium | Optimistic oracle with economic bond + escalation path. Study UMA's track record. Design for subjective events from day one. |
| **Scalar market edge cases** | Medium | Conservative initial leverage limits (3-5x). Circuit breakers when price approaches range boundaries. Gradual increase as system proves stable. |
| **ZK proving latency** | Medium | Decouple execution from proving. Soft-confirm trades instantly; generate batch ZK proofs asynchronously (1-5s). No user-facing latency. |
| **Regulatory scrutiny** | Medium | VARA license via MANTRA, zk-KYC compliance layer, post-trade transparency (all settlements on-chain). Engage crypto-native legal counsel early. |
| **Custom L1 development complexity** | High | Build on existing open-source (Groundhog Apache 2.0, HotStuff implementations). Hire from Aptos/Monad/Sui talent pools. |
| **Defx competition** | Medium | Defx ($2.5M seed, Pantera-backed) is the most direct competitor building a private perps L1. Move fast, differentiate on prediction markets + RWA + MANTRA ecosystem. |
