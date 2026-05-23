# Research & Specification Brief — Ultrafast Perp DEX Chain

*Companion to PROPOSAL.md. Self-contained: hand this to a researcher / contractor / sub-team and they should be able to execute against it.*

---

## 0. How to Use This Document

Each workstream below (W01 - W17) is a **complete brief**: goal, research questions, sources, deliverable, acceptance criteria, dependencies, effort. Treat workstreams as independently assignable. Cross-cutting concerns (audit plan, benchmark harness, formal verification) live in §4.

**Reading order for a new contributor:**
1. PROPOSAL.md §0-§2 (architectural decisions taken)
2. §1 below (conventions)
3. §2 below (sequencing DAG — pick a workstream with no unblocked deps)
4. The workstream you've been assigned

**Definition of "spec done":** the deliverable artifact exists, has been reviewed by at least one other engineer, has acceptance criteria checked off, and is linked from `specs/INDEX.md` in the repo.

---

## 1. Conventions

### 1.1 Repo layout
```
ultrafast/
  specs/
    INDEX.md                  # one-line entry per spec, sorted by ID
    rfcs/
      RFC-0001-consensus.md
      RFC-0002-storage.md
      ...
    adrs/
      ADR-0001-greenfield-rust-l1.md     # already implicit in PROPOSAL.md
      ADR-0002-no-cosmos-sdk.md
      ...
    tla/
      consensus/Simplex.tla
      consensus/Minimmit.tla
      mev/FBA.tla
      mev/MCP.tla
    bench/
      harness/ ...             # see §4.2
  crates/                      # actual Rust code
  contracts/                   # Solidity for system contracts (CLOB, FBA, listings)
```

### 1.2 RFC format
Markdown, frontmatter with `id`, `title`, `status` (`draft|review|accepted|superseded`), `authors`, `depends_on`, `supersedes`. Body sections: **Motivation**, **Specification** (normative — MUST/SHOULD/MAY per RFC 2119), **Rationale** (alternatives considered), **Security considerations**, **Open questions**, **References**.

### 1.3 ADR format
Markdown, single-page. Sections: **Context**, **Decision**, **Consequences** (positive + negative + neutral). One decision per ADR.

### 1.4 TLA+ tooling
TLC for finite-state model checking; Apalache for symbolic checking on larger state spaces. CI runs both on PR. Spec files live in `specs/tla/`. Yi Huang's prior TLA+ work on Block-STM is the in-house precedent.

### 1.5 Solidity conventions
For system contracts: Solidity 0.8.28+, `forge` build, `forge test` + `forge fuzz`, `slither` lint. No `tx.origin`, no `selfdestruct`, no `delegatecall` except where explicitly justified in the RFC.

### 1.6 Effort sizing
- **S** = 1-2 weeks one engineer
- **M** = 3-6 weeks one engineer
- **L** = 2-3 months one engineer
- **XL** = 3-6 months a small team

---

## 2. Sequencing DAG

```
                                       W01 Consensus ──┐
                                       W02 Storage  ───┤
                                       W03 Execution──┐│
                                                     ↓↓↓
                                       W04 Staking/Slashing ─┐
                                                              │
W05 MCP ──── W06 FBA ──── W07 CLOB ─── W08 Aggregators ─── W14 Oracle ─── W15 Risk ─── W16 Margin
                ↑                                                                          │
                └──────────────────────────────────────────────────── W12 HLP-vault ←──────┘

W09 ZK bridge      ┐
W10 TEE darkpool   │── independent, parallelizable
W11 Listings       │
W13 Tokenized ord. ┘

W17 Validator gov  ── depends on W04
```

**Critical path to closed testnet:** W01 → W03 → W04 → W06 → W07 → W14 → W15 → W16. Estimated 7-9 months.

---

## 3. Workstreams

### W01 — Consensus: Threshold Simplex + Minimmit + QMDB

**Goal.** Pick, fork or wrap, and integrate a consensus implementation that delivers ~400 ms finality with optional Minimmit fast-path on a curated bonded validator set.

**Research questions.**
1. How invasive is forking `commonwarexyz/monorepo` Threshold Simplex vs. importing it as a versioned dependency? Read the crate boundaries; identify which traits we'd need to implement (validator-set provider, mempool, block-builder, application STF).
2. What is the actual production-readiness state of Threshold Simplex and Minimmit as of the time this is read (commits since 2026-04, audit status, known issues)?
3. How does Threshold Simplex's BLS DKG handle validator-set churn? What's the resharing cost in latency and bandwidth? Worst-case for a 100-validator set with 10 churns/epoch?
4. Minimmit's `n ≥ 5f+1` requirement — verify the proof, and quantify what 20% Byzantine vs 33% means for our slashing-budget calculations (acceptable max-bad-validator dollar value).
5. QMDB integration: how does `commonware-storage` expose Merkle roots for our STF? Is the schema a fit for an EVM state trie or do we need a translation layer?
6. How does the consensus layer interact with the Engine API exec layer (W03)? Sequence diagram for `propose → notarize → finalize → engine_newPayload → engine_forkchoiceUpdated`.

**Sources.**
- `https://github.com/commonwarexyz/monorepo` — crate docs
- Threshold Simplex blog: `https://commonware.xyz/blogs/threshold-simplex`
- Minimmit spec: `https://github.com/commonwarexyz/monorepo/blob/main/pipeline/minimmit/minimmit.md`
- QMDB paper: arXiv:2501.05262
- Simplex paper: `https://simplex.blog/`

**Deliverable.** `RFC-0001-consensus.md` covering: chosen integration mode (fork / vendored / dependency), validator-set provider interface, DKG / resharing flow, Minimmit activation policy, exact Engine API sequence, failure modes (validator goes Byzantine, network partition, leader equivocation). Plus `specs/tla/consensus/Simplex.tla` model-checked under our parameters.

**Acceptance.**
- Two-engineer review.
- TLA+ spec passes TLC for ≤7 validator instance.
- Latency budget signed off: target p50 ≤ 400 ms, p99 ≤ 1 s under healthy network.
- Resharing cost < 5 s for a 100-validator set.

**Dependencies.** None. Start immediately.

**Effort.** **L** (2-3 months). Senior systems engineer.

---

### W02 — Storage: QMDB Integration

**Goal.** Wire QMDB as the state backend for our reth-driven execution layer.

**Research questions.**
1. Can QMDB serve as a drop-in for reth's state DB (currently MDBX-based) or do we need a translation shim?
2. What's the throughput delta on a perp-workload trace (heavy state updates on a single market) vs reth-default?
3. State commitment compatibility: QMDB's "twigs" model vs Ethereum's hexary Merkle Patricia Trie — do we expose Ethereum-compatible state roots for the ZK bridge (W09)?
4. Snapshot / state-sync story: how do new validators sync from genesis, and how do light clients validate?
5. Pruning policy: archive vs full vs pruned. What's the disk-cost curve for a 1-year-old chain at 100k TPS?

**Sources.**
- QMDB paper arXiv:2501.05262
- LayerZero Labs QMDB blog and reference implementation
- reth state DB docs: `https://reth.rs/`

**Deliverable.** `RFC-0002-storage.md`: chosen integration (replace, wrap, or hybrid), state-root format and commitment, snapshot format, sync protocol, pruning policy. Benchmark report appended.

**Acceptance.**
- Benchmark: ≥3× throughput vs reth-default on a synthetic perp workload (1M orders/min, 80% touching a single market state).
- State root format documented for the ZK bridge team.
- Snapshot import from a 100GB chain in < 10 min on consumer SSD.

**Dependencies.** W01 (state-root format must satisfy the consensus commit requirement).

**Effort.** **M** (4-6 weeks). Storage / database engineer.

---

### W03 — Execution Layer: reth via Engine API

**Goal.** Drive an unmodified (or minimally patched) reth instance from our Rust consensus binary using the Engine API.

**Research questions.**
1. Engine API methods we need: `engine_newPayloadV*`, `engine_forkchoiceUpdatedV*`, `engine_getPayloadV*`. Which version (V1/V2/V3/V4)?
2. What payload fields does Engine API require that we don't naturally produce (e.g. `parentBeaconBlockRoot`, blob sidecars)? How do we synthesize / stub these?
3. How do we inject the FBA matching results (W06) into a block? Options: (a) custom system-transaction, (b) precompile call from a builder-controlled EOA, (c) protocol-level state injection. Pick one with rationale.
4. Mempool: do we use reth's tx pool or run our own? FBA changes the inclusion semantics — txs aren't ordered by gas price.
5. Gas accounting under FBA: how do we charge for matching-engine work that's outside the user's tx?
6. Hard-fork cadence: when Ethereum ships Pectra/Osaka/etc., what's our update path? Pin reth versions or track upstream?

**Sources.**
- `https://github.com/ethereum/execution-apis/tree/main/src/engine`
- reth source: `https://github.com/paradigmxyz/reth`
- Tempo and Monad CL→EL integration patterns (public material)

**Deliverable.** `RFC-0003-execution.md`: API surface used, payload synthesis logic, matching-result injection mechanism, gas model, mempool architecture, fork-tracking policy. Plus a working prototype binary that can run a single-validator devnet with reth as EL.

**Acceptance.**
- Devnet runs with reth executing arbitrary EVM contracts driven by our consensus.
- 24-hour soak test with no Engine API failures.
- Stock Foundry / Hardhat / standard wallets work against the RPC unchanged.

**Dependencies.** W01 (consensus drives EL).

**Effort.** **L** (2-3 months). EVM-experienced systems engineer.

---

### W04 — Custom Staking / Slashing / Governance Module

**Goal.** Replace Cosmos `x/staking` + `x/slashing` + `x/gov` with a Rust-native, EVM-bridged, dual-layer (equal-weight consensus + stake-weighted accountability) module.

**Research questions.**
1. Where does staking state live — in EVM contracts (governance reads/writes via standard tx) or in a native Rust module (faster, but separate state tree)? Pick one with explicit tradeoff (Aptos went native; Tempo went hybrid).
2. Validator-set churn flow: bond → activate → consensus participation → unbond → slash window → withdraw. What are the epoch boundaries? How does this interact with Threshold Simplex DKG resharing (W01)?
3. Slashing conditions: double-sign (consensus-detectable), liveness (epoch-aggregated), MEV-policy violation if MCP attestation rules are violated (W05). For each, what's the proof artifact and what's the slash percentage?
4. Stake-weighting layer: how does a 1-validator-1-vote consensus (Threshold Simplex) compose with stake-weighted slashing? Worked example: validator A with 30% stake, validator B with 1% stake, both equivocate — same slash absolute or proportional?
5. Delegation: do we support liquid delegation (LST) day-1 or defer to v2? If day-1, what's the LST contract surface?
6. Governance: token-weighted on-chain voting from day 1 (recommended in PROPOSAL.md §7.1) or foundation-controlled with a sunset? Quorum / threshold parameters?

**Sources.**
- Aptos staking module: `https://github.com/aptos-labs/aptos-core/tree/main/aptos-move/framework/aptos-framework/sources/stake.move`
- Tempo staking (public docs)
- Berachain PoL design (different but illustrative of Cosmos-free PoS)
- EigenLayer slasher contracts (for proof / slashing-condition patterns)

**Deliverable.** `RFC-0004-staking.md` plus reference contract suite if EVM-native, or Rust crate skeleton if module-native.

**Acceptance.**
- Worked example with 30 validators, 100 delegators, full lifecycle including a slash event, executed end-to-end on testnet.
- Slash conditions formally specified (TLA+ for the safety properties, executable test vectors).
- Audit-ready by Phase 2.

**Dependencies.** W01 (consensus dictates equivocation evidence format).

**Effort.** **L** (2-3 months). Protocol engineer with PoS background.

---

### W05 — Multi-Concurrent-Proposer (MCP) Layer

**Goal.** Adapt the Solana Constellation MCP pattern to our Threshold Simplex consensus, providing the selective-censorship-resistance + hiding properties FBA depends on (PROPOSAL.md §4).

**Research questions.**
1. Constellation parameters: 16 proposers, 256 attesters, 50 ms cycle, 40% inclusion threshold, 60% block validity threshold. Which of these survive translation to a 30-100 validator BFT chain? Specifically: does it make sense to have proposers ⊊ validators, or are they the same set?
2. The arxiv:2509.23984 paper claims +1 RTT; arxiv:2511.13080 lists residual MEV (PBS, temporal, cross-domain). Verify which residuals apply to a *perp-only* chain (no general AMM, no cross-domain liquidations).
3. Hiding mechanism: threshold encryption to attesters (committee-trust risk) vs. erasure-coded secret sharing (no committee). Pick one.
4. Equivocating-proposer detection and slashing — wire to W04.
5. Composition with FBA (W06): MCP delivers censorship-resistant *commit hashes* into the FBA tick; FBA reveals + clears at tick boundary. What's the exact handshake?
6. Bandwidth budget: at 100k TPS and 16 proposers, what's the per-validator network overhead?

**Sources.**
- arXiv:2509.23984 (MCP why and how)
- arXiv:2511.13080 (MCP MEV taxonomy)
- `https://constellation.anza.xyz/`
- `https://www.helius.dev/blog/constellation`

**Deliverable.** `RFC-0005-mcp.md`. Plus `specs/tla/mev/MCP.tla` proving the censorship-resistance property under our parameter choices.

**Acceptance.**
- TLA+ spec checks for `n=7 (f=2)` proposers.
- Bandwidth budget < 50 Mbps per validator at 100k TPS.
- End-to-end handshake with W06 documented and tested.

**Dependencies.** W01, W04. Concurrent with W06.

**Effort.** **L** (2-3 months). Distributed systems researcher / engineer.

---

### W06 — In-Protocol Frequent Batch Auctions (FBA)

**Goal.** Specify the matching-engine semantics and on-chain mechanism for sealed-bid uniform-clearing-price batch auctions running at 100-250 ms ticks.

**Research questions.**
1. Tick parameter: 100 ms, 200 ms, 250 ms? Read Penumbra ZSwap (5 s, too slow for perp), CowSwap (~30 s, also too slow), and design something perp-native. The MM-loop survey from §1.3 of PROPOSAL says <100 ms wins MM mindshare. What's our actual choice?
2. Order language: limit, market, IOC, FOK, post-only, reduce-only. Which are expressible in batch-auction semantics? (Hint: post-only is awkward; reduce-only is fine.)
3. Clearing rule: uniform clearing price (CowSwap-style) vs. continuous-pro-rata (Penumbra-style) vs. midpoint-cross. Each has different MM economics. Pick one with rationale.
4. What happens to *unfilled* orders at tick close — carry to next tick (limit semantics) or expire (auction semantics)? This is the most consequential UX decision.
5. Tâtonnement / clearing solver location: in-VM as a precompile (deterministic, gas-bounded) or in-validator as a native module (faster, complicates verification). Speedex went native. Choose.
6. Composition with MCP commits (W05): timing diagram for `commit-tick → reveal → solve → execute`.

**Sources.**
- Penumbra DEX protocol: `https://protocol.penumbra.zone/main/dex.html`
- CowSwap batch auctions: `https://cow.fi/learn/understanding-batch-auctions`
- Speedex paper: arXiv:2111.02719
- Hyperliquid CLOB semantics (for the order-types reference, not the architecture)

**Deliverable.** `RFC-0006-fba.md` with matching-engine pseudocode, tick state machine, order-type semantics, clearing rule, solver location decision, composition with W05/W07. `specs/tla/mev/FBA.tla` proving the no-intra-tick-MEV property.

**Acceptance.**
- TLA+ spec proves: any two orders submitted before tick close cannot have their relative ordering changed by any party including the proposer.
- Worked numerical example with 100 limit orders crossing — clearing price computed by hand matches solver output.
- p99 solver runtime ≤ 20% of tick budget.

**Dependencies.** W05 (commits feed into FBA), W08 (aggregators for the auction state).

**Effort.** **L** (3 months). Quant + protocol engineer pair.

---

### W07 — CLOB as System Contract

**Goal.** Specify the orderbook as a system Solidity contract (callable atomically from user contracts) backed by the FBA matching engine (W06).

**Research questions.**
1. Storage layout: order map keyed by `(market_id, owner, nonce)`; book state per market (bid/ask trees). What's the gas-optimal layout for the 95th-percentile path (place + match + emit fill)?
2. ABI for end users: `placeOrder`, `cancelOrder`, `modifyOrder`, `batchCancel`. Which of these are FBA-native (commit at tick T, settle at tick T+1) vs synchronous?
3. ABI for *contract* callers (vaults, lending markets, liquidators): synchronous read of book state (best bid/ask, depth at level), synchronous order submission with a return value indicating "queued for tick T+1." This is the explicit win over Hyperliquid's async HyperCore/HyperEVM seam.
4. Gas model: who pays for matching-engine work? Options: (a) per-order flat fee in USDC, (b) per-tick socialized cost, (c) maker rebate / taker pays. Pick.
5. Event design: `OrderPlaced`, `OrderFilled`, `OrderCanceled`, `TickCleared(tick_id, market_id, clearing_price, volume)`. What's indexed vs not for indexer cost?
6. Failure semantics: if the FBA solver fails (W06), do all orders revert, or do we roll forward with a fallback (CLOB-style FIFO)?

**Sources.**
- Hyperliquid HyperCore module (public docs + reverse engineering)
- dYdX v4 protocol contracts
- 0x v4 protocol (off-chain orderbook with on-chain settlement)

**Deliverable.** `RFC-0007-clob.md` plus reference Solidity in `contracts/system/CLOB.sol`. Foundry test suite covering the worked examples.

**Acceptance.**
- Vault contract written against the CLOB ABI demonstrates synchronous read + tick-deferred write.
- Gas: place + match + settle ≤ 80k gas per filled order in the 95th percentile.
- Indexer can reconstruct book state from events alone.

**Dependencies.** W06, W08.

**Effort.** **L** (3 months). Solidity / protocol engineer.

---

### W08 — Aggregator Primitives (Aptos-Style Typed Effects)

**Goal.** Provide typed-effect primitives in Solidity / EVM so Block-STM can parallelize commutative operations (fees, funding accumulator, balance increments) without aborting under hot-key contention.

**Research questions.**
1. Aptos Aggregators: read the Move implementation. What primitives exist (`add`, `sub`, `read`, `read_with_overflow_check`)? What constraints (e.g. cap at u128 max, no read-modify-write within same tx)?
2. EVM translation: aggregators have no direct EVM equivalent. Options: (a) custom precompile (`AGGREGATOR_INCR`, `AGGREGATOR_READ`), (b) reserved storage-slot pattern detected by the executor, (c) typed-storage opcode extension. Pick.
3. Solidity API: what does the contract author write? `aggregator.add(50)` vs `feeAccumulator += 50` (silent upgrade) vs explicit precompile call.
4. Block-STM scheduler hooks: how does the scheduler learn an op is commutative? Static analysis of bytecode, or runtime annotation, or a syscall convention.
5. Read semantics: an aggregator read materializes the current value, which forces a serialization point. When is this acceptable in our perp workloads? (Funding rate snapshots at tick boundary — yes. Mid-tick balance check before withdrawal — also yes, but rare.)
6. Overflow / underflow: aggregators in Aptos have a hard cap. What's our cap policy?

**Sources.**
- `https://medium.com/aptoslabs/aggregators-how-sequential-workloads-are-executed-in-parallel-on-the-aptos-blockchain-e7992c70cefb`
- Aptos Move aggregator source
- go-block-stm issue #18 (chat reference)

**Deliverable.** `RFC-0008-aggregators.md` plus reference precompile in Rust and `Aggregator.sol` library.

**Acceptance.**
- Benchmark: 10k concurrent funding-accumulator writes show no Block-STM aborts.
- Solidity DX review by 2 external developers.

**Dependencies.** W03 (execution layer hooks).

**Effort.** **M** (5-6 weeks). EVM internals engineer.

---

### W09 — ZK Light-Client Bridge (Succinct-style)

**Goal.** Specify the Ethereum ↔ Ultrafast bridge using a Succinct-style ZK light client. Trust assumption: Ethereum-side cryptographic certainty over our STF.

**Research questions.**
1. Succinct's `SP1` / `Telepathy` architecture: what proves what? Is it our consensus (Threshold Simplex aggregate sig) or our STF (Engine API state transitions) or both?
2. Hosted prover (pay Succinct) vs. self-hosted prover (capex + ops). Cost model at 100k tps state-transition rate?
3. Bridge contract on Ethereum: deposit → message-passing format → withdraw verification. Worst-case finality time end-to-end.
4. What about the *reverse* direction (Ethereum → Ultrafast)? Light-client of Ethereum on our chain — Helios / Sync Committee / Ethereum's own ZK light client when it ships.
5. Censorship escape: if our validators stall, can users force-withdraw from the L1 bridge contract? What's the timeout?
6. State-root commitment format compatibility (W02): if QMDB doesn't natively expose Ethereum-MPT-compatible roots, how does the prover handle it?

**Sources.**
- Succinct docs: `https://docs.succinct.xyz/`
- `https://www.gnosis.io/blog/succincts-ethereum-zk-light-client-and-the-road-to-trust-minimzed-bridges-with-hashi`
- zkBridge paper arXiv:2210.00264
- Helios light client (`https://github.com/a16z/helios`)

**Deliverable.** `RFC-0009-bridge.md` plus bridge contract suite in `contracts/bridge/`.

**Acceptance.**
- End-to-end deposit → trade → withdraw cycle on testnet with proof verification.
- Force-withdraw mechanism documented and tested.
- Cost projection: < $X/tx at target volume, signed off by economics.

**Dependencies.** W01 (consensus signature format), W02 (state-root format).

**Effort.** **L** (3 months). ZK / cryptography engineer.

---

### W10 — TEE-Attested Dark-Pool Lane (Post-MVP)

**Goal.** Specify an opt-in privacy lane: institutional flow submits encrypted orders to a TEE-attested matching engine; matched fills settle on-chain with public events (size and price), private order details (counterparty identity / pre-fill quotes) hidden.

**Research questions.**
1. TEE choice: Intel SGX (mature, side-channel record), Intel TDX (newer, cleaner), AMD SEV-SNP, AWS Nitro Enclaves. Which are production-grade in 2026? Which support remote attestation that an Ethereum contract can verify?
2. Attestation verification: on-chain or off-chain? On-chain via Automata's TEE-attestation contracts is the current reference design.
3. Replication: a single TEE is a single point of failure. How do N TEEs replicate the matching engine? Threshold-decryption of order shares, or all TEEs run the same engine and quorum-sign the result?
4. Liquidity bootstrap: dark pool with no visible quotes won't bootstrap (PROPOSAL.md §6.7). What's the v1 mitigation — Renegade-style midpoint peg from a CEX oracle, hybrid lit-dark visibility?
5. Composition with public CLOB (W07): can a single account trade on both lanes? What's the margin-engine surface (W16)?

**Sources.**
- Automata TEE attestation: `https://github.com/automata-network`
- Renegade docs: `https://docs.renegade.fi/`
- Aster Chain dark-pool design (public material)
- `https://stellar.org/blog/developers/building-a-dark-pool-on-stellar-mpc-fhe-and-tees-compared`

**Deliverable.** `RFC-0010-darkpool.md`. Defer building until Phase 3.

**Acceptance.**
- Architecture review with crypto / TEE specialist.
- Threat model documented including TEE side-channel and operator collusion.

**Dependencies.** W07, W16.

**Effort.** **XL** (4-6 months). Defer.

---

### W11 — Listing Modules (HIP-1/2/3 Equivalents)

**Goal.** Specify three listing primitives — permissionless token issuance, native MM seeder, builder-deployed perps with bond — matching Hyperliquid's HIP-1/2/3 functionally.

**Research questions.**
1. HIP-1 (token issuance via Dutch auction for deploy gas): what's the exact auction format, duration, gas-recipient policy? Is it value-capturing for the chain or burned?
2. HIP-2 (native MM seeder): bots running on validators, on-chain MM logic, or contract-level liquidity bootstrapping pool? Hyperliquid's is on-chain MM with 0.3% spread refresh every 3s.
3. HIP-3 (builder-deployed perps with stake bond): bond size, what gets slashed (oracle manipulation? failed liquidations?), revenue share to builder.
4. Curation: pure permissionless or governance-gated for new asset types? Risk-management implications (a meme-coin perp at 50× kills the insurance fund).

**Sources.**
- Hyperliquid HIPs: `https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips`

**Deliverable.** `RFC-0011-listings.md` plus three reference Solidity modules.

**Acceptance.**
- A meme-coin can be listed (mint + initial book + first trade) in < 1 hour with no governance interaction.

**Dependencies.** W07, W14, W15.

**Effort.** **M** (6-8 weeks).

---

### W12 — Multi-Strategy HLP-Equivalent Vault

**Goal.** Specify a community-deposit vault that runs *segmented* strategies (vol-targeted, basis-arb, market-making) instead of Hyperliquid's monolithic HLP. Differentiation lever (PROPOSAL.md §7.1).

**Research questions.**
1. HLP composition: read public-fund disclosures, infer the strategy mix. What's the realized Sharpe and what's the marketing Sharpe?
2. Strategy interface: each strategy is a contract implementing `deposit / withdraw / reportPnL`. Risk-isolation: can one strategy's drawdown cascade into another's?
3. Capacity constraints: at $500M TVL, a single strategy is capacity-bound. Multi-strategy lets us scale TVL without diluting Sharpe.
4. Withdrawal queue: HLP has a withdrawal lock. What's our policy?
5. Tokenization: vault shares as ERC-4626? LST-style transferable claims?

**Sources.**
- Hyperliquid HLP documentation and on-chain data
- Ethena USDe sUSDe model (multi-strategy yield)
- Mellow vaults / Ether.fi (multi-strategy framework reference)

**Deliverable.** `RFC-0012-vault.md` plus reference contracts.

**Acceptance.**
- Strategy interface lets a third party deploy a new strategy without protocol changes.
- Worked example with 3 segmented strategies and risk-isolation tested.

**Dependencies.** W07, W15.

**Effort.** **M** (8-10 weeks).

---

### W13 — Tokenized Ordering Bolt-On (Masquerade)

**Goal.** Specify the on-chain ordering-token issuer for un-batched (admin / governance / cross-chain-message) txs that bypass the FBA matching engine.

**Research questions.**
1. Issuer-contract design: how is the strictly-increasing serial number guaranteed under our consensus? It must not depend on a single proposer (would re-introduce MEV).
2. Token lifecycle: mint → bind to tx-payload-hash → spend → burn. Refund mechanism for unspent tokens.
3. Capital lockup: how much capital does an active trader park in unused tokens? Economic model.
4. Failure modes: what if the issuer contract is censored (reintroducing MEV at meta-level)?

**Sources.**
- arXiv:2308.15347
- ACM 10.1145/3730410

**Deliverable.** `RFC-0013-tokenized-ordering.md` plus reference issuer contract.

**Acceptance.**
- Front-running an admin tx requires holding pre-issued small-numbered tokens (per the original paper's threat model).

**Dependencies.** W07.

**Effort.** **S** (1-2 weeks). Optional — kill if FBA covers all paths.

---

### W14 — Oracle + Funding-Rate Mechanism

**Goal.** Specify how the chain produces mark prices and funding rates with sub-3s latency and no single point of trust.

**Research questions.**
1. Reference designs:
   - Hyperliquid: validator-median weighted by CEX liquidity, refreshed every ~3s.
   - dYdX v4: Pyth as primary, validators sign price updates each block.
   - Pyth Pull Oracle: signed Wormhole VAAs.
2. Validator-median: how do validators agree on the input set of CEX prices? Does each validator independently fetch from a hardcoded list, or do we trust a Pyth-style first-party stream?
3. Pyth integration: if we use Pyth, what's the cross-chain message latency vs Hyperliquid's in-validator scheme?
4. Funding-rate formula: 1/8 of computed rate (Hyperliquid style), capped at ±4%/hour, with `clamp(interest − premium, ±0.0005)` term. Worth keeping or innovating?
5. Liquidation oracle vs trading oracle: same source or split? Splitting reduces correlated MEV.

**Sources.**
- Hyperliquid funding docs: `https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding`
- Pyth network architecture
- dYdX v4 oracle module

**Deliverable.** `RFC-0014-oracle.md`.

**Acceptance.**
- Mark-price update latency < 3s end-to-end.
- Funding-rate worked example matches Hyperliquid's for the same input prices (sanity check).
- Single-CEX-price-manipulation attack budget calculated and signed off.

**Dependencies.** W01, W04 (validators are the price source).

**Effort.** **M** (5-7 weeks).

---

### W15 — Risk Engine + Liquidation Flow

**Goal.** Specify margin requirements, liquidation triggering, liquidator economics, and insurance-fund interaction.

**Research questions.**
1. Margin model: cross-margin (single equity pool across positions) vs isolated per-position vs portfolio margin (Hyperliquid has cross + isolated). Which for v1?
2. Initial-margin / maintenance-margin schedule: per-asset, per-leverage-tier. dYdX v4 schedule, Hyperliquid schedule, Drift schedule — converge or differentiate?
3. Liquidation triggering: continuous (every block, oracle-driven) vs tick-aligned (FBA tick boundary). Tick-aligned is simpler under our architecture.
4. Liquidator economics: open auction, designated liquidator, or HLP-equivalent backstop. Hyperliquid uses HLP as last resort; dYdX has open liquidation.
5. Insurance fund: capitalization, depletion policy, ADL (auto-deleveraging) trigger when fund is drained.
6. Composition with FBA: a liquidation is an order. Does it enter the FBA tick or bypass it (a forced market sell at any clearing price)?

**Sources.**
- Hyperliquid liquidation docs
- dYdX v4 liquidation module
- Drift exploit post-mortem (April 2026) — what to NOT do

**Deliverable.** `RFC-0015-risk.md` plus reference contracts.

**Acceptance.**
- Forced liquidation cascade simulation (10% market crash, 1000 underwater accounts) settles within budget.
- Insurance fund worst-case-drain calculated.
- TLA+ safety property: no liquidation can leave a position with negative equity unhandled.

**Dependencies.** W06, W07, W14.

**Effort.** **L** (10-12 weeks).

---

### W16 — Margin / Sub-Account Model

**Goal.** Specify the account hierarchy, equity computation, and cross-strategy margining.

**Research questions.**
1. Sub-account model: master account → N sub-accounts, each with isolated margin. Hyperliquid pattern. How deep does the hierarchy go?
2. Equity computation: realized + unrealized PnL + funding accrued − fees. Where does this live (account contract, registry contract, native module)?
3. Cross-margin between perps and spot: are there spot markets in v1? If yes, how does spot collateral count toward perp margin?
4. Permissioned sub-accounts: agent / API-key model where a sub-account has restricted permissions (trade only, no withdraw). Critical for institutional flow and bots.
5. Multi-collateral: USDC only in v1, or stablebasket?

**Sources.**
- Hyperliquid account model
- dYdX v4 account model

**Deliverable.** `RFC-0016-margin.md`.

**Acceptance.**
- Worked example: institutional user with a master + 5 sub-accounts each running different MM strategies on the same collateral.
- Permission model audited.

**Dependencies.** W04 (account model overlap with staking accounts), W07, W15.

**Effort.** **M** (6-8 weeks).

---

### W17 — Validator Governance

**Goal.** Specify how the validator set evolves over time toward credible decentralization (the differentiator vs Hyperliquid's 21).

**Research questions.**
1. v1 validator-admission policy: foundation curates a 30-validator set with public criteria. What are the criteria?
2. Decentralization milestones: stake-distribution targets, geographic-distribution targets, implementation-diversity targets, tied to validator-set expansion to 50, 75, 100.
3. Validator-set-change governance: who has authority to admit / remove? Foundation in v1 → token-holder-vote in v2 → fully on-chain rules in v3.
4. Anti-Sybil: stake bond size, KYC for v1 only, on-chain reputation.

**Sources.**
- Cosmos Hub governance history
- Solana validator set evolution
- dYdX v4 governance

**Deliverable.** `ADR-0017-validator-governance.md` (one-page ADR).

**Acceptance.**
- Concrete numerical targets for milestones.

**Dependencies.** W04.

**Effort.** **S** (1-2 weeks).

---

## 4. Cross-Cutting Concerns

### 4.1 Security audit plan

- Phase 1: internal review by every workstream lead of every other workstream's RFC.
- Phase 2 (pre-mainnet): two external audits in parallel — one consensus-and-cryptography (Trail of Bits, Sigma Prime) and one Solidity-and-economics (Spearbit, OpenZeppelin, Halborn).
- Phase 3 (post-mainnet, ongoing): bug bounty (Immunefi tier-1 for the bridge, tier-2 for system contracts).
- Ultrafast-specific considerations:
  - The greenfield staking module (W04) has no audit precedent — extra scrutiny.
  - The FBA + MCP composition (W05 + W06) is novel; formal verification (TLA+) is part of the spec, not optional.
  - The CLOB-as-system-contract (W07) is the highest-value target — start with a dedicated audit, separate from the rest.

### 4.2 Performance benchmark harness

A reproducible load-test harness in `bench/` that:
- Spins up a 30-validator devnet locally.
- Replays a captured Hyperliquid-equivalent workload (open-source workload trace TBD; if none exists, synthesize from public Hyperliquid event data).
- Measures: p50/p95/p99 commit latency, tick-clearing latency, cross-VM-read latency, end-to-end submit-to-fill latency, throughput in orders/s and txs/s.
- Runs in CI on every PR to consensus, execution, FBA, or CLOB workstreams. Fails the PR on regression > 10%.

### 4.3 Formal verification umbrella

- TLA+ specs required for: W01 (consensus safety), W05 (MCP censorship-resistance), W06 (FBA no-intra-tick-MEV), W15 (risk-engine no-negative-equity).
- Specs composed at the end of Phase 1 — prove the *composition* (consensus + MCP + FBA + risk) is free of liveness traps.
- Yi Huang's TLA+ work on Block-STM is the in-house precedent. Consider Apalache for the larger composed spec.

### 4.4 Non-research dependencies (track separately)

- **Devops / validator ops** — validator binary distribution, monitoring, alerting, runbooks.
- **MM / institutional onboarding** — gRPC API, FIX-like adapter, colocation / latency-fairness policy.
- **Indexer / data API** — real-time orderbook reconstruction, fill history, PnL streams.
- **Wallet / SDK** — TypeScript / Rust SDK, EIP-712 signing flows, account-abstraction support.

These are not research workstreams but they have RFC-equivalent specs of their own; treat as "execution" not "research" and sequence after Phase 0.

---

## 5. Glossary

- **FBA** — Frequent Batch Auction. Sealed-bid, uniform-clearing-price auction at a fixed time interval.
- **MCP** — Multiple Concurrent Proposers. Consensus-layer mechanism where multiple validators contribute to each block; protects against single-proposer censorship.
- **Threshold Simplex** — Commonware variant of the Simplex consensus protocol using BLS threshold signatures for compact certificates.
- **Minimmit** — Commonware fast-finalization protocol requiring `n ≥ 5f+1` (i.e. <20% Byzantine) — finalizes in one round on the happy path.
- **QMDB** — Quick Merkle Database (LayerZero Labs). Append-only KV + Merkle store optimized for blockchain workloads.
- **HLP** — Hyperliquid Liquidity Provider vault. Community-deposit MM / arb / liquidation-backstop strategy.
- **CLOB** — Central Limit Order Book.
- **Engine API** — Ethereum's post-Merge JSON-RPC contract between consensus client and execution client.
- **Aggregator** — Aptos's typed-effects primitive that lets Block-STM avoid aborts on commutative ops.
- **STF** — State Transition Function.
- **TEE** — Trusted Execution Environment (Intel SGX/TDX, AMD SEV-SNP, AWS Nitro Enclaves).
- **DKG** — Distributed Key Generation.

---

## 6. What This Document Is Not

- **Not a build plan.** Estimates are research-and-spec effort, not implementation. Implementation is roughly 2-3× research effort per workstream.
- **Not a hiring plan.** Roles are sketched ("senior systems engineer", "ZK engineer") but not staffed.
- **Not final.** Every RFC produced will likely revise this brief in light of what's learned.
