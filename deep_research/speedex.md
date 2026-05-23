# Speedex

## Part 1: How UltraFast uses the Speedex pattern and why

UltraFast's Frequent Batch Auction (FBA) matching engine runs on a fixed tick — orders accumulate across a tick window, then a single uniform clearing price is computed for every market at the tick boundary. The solver that computes those clearing prices has to live somewhere in the node architecture, and §7.5 of the UltraFast whitepaper fixes that location: the FBA solver runs as an in-validator native module, called from the system contract at tick boundary. The whitepaper cites Speedex as the precedent for that placement decision.

The reasoning is straightforward. An FBA solver operates at block level, not at transaction level. It needs the full set of orders for a tick, performs an iterative price-discovery procedure over that set, and emits a single price and a per-order fill schedule. A per-transaction precompile model — the obvious default in an EVM-lane chain — does not fit this shape: precompiles are called inside a transaction's execution frame, with a transaction's gas budget, and they cannot natively see "all orders submitted in this tick." Hoisting the solver into a native module that the system contract invokes at the tick boundary side-steps that mismatch and gives the solver direct access to the validator's in-memory order state.

Speedex is the production-grade demonstration that this placement works. Speedex's Tatonnement price-discovery procedure also runs once per block as native validator code, not as VM-callable logic, and Speedex authors specifically argue that the parallelism and throughput their design achieves depend on that placement. UltraFast inherits the placement argument, nothing else from Speedex's protocol stack.

UltraFast does **not** use Speedex's exchange semantics, its Arrow-Debreu multi-asset clearing structure, the Tatonnement procedure itself, or the Groundhog commutative-execution engine. UltraFast's FBA solver is a separate construction targeted at perpetual futures and scalar prediction markets, not multi-asset spot. The reference to Speedex is purely architectural — it answers "where does the solver live in the node?" not "what algorithm does the solver run?"

Whether the in-validator-native-module placement should be revisited at scale is flagged in §7.5 as an open question deferred to post-Phase-0 benchmarking. The two alternatives in scope for that later review are a VM-side precompile with privileged tick-boundary access, and an external off-chain solver with on-chain verification. Neither is ruled in or out before measured data exists.

---

## Part 2: Deep research on Speedex

### Paper and authors

**SPEEDEX: A Scalable, Parallelizable, and Economically Efficient Decentralized EXchange.** Geoffrey Ramseyer, Ashish Goel, David Mazieres. Published at NSDI 2023 (20th USENIX Symposium on Networked Systems Design and Implementation), April 2023. Originally posted to arXiv in November 2021 (arXiv:2111.02719) and revised over the next two years. Authors are from the Stanford Secure Computer Systems group (the same group behind the Stellar Consensus Protocol — Mazieres is the SCP author and Ramseyer's PhD advisor alongside Goel from Management Science and Engineering).

Ramseyer's PhD thesis, "Scalable Infrastructure for Digital Currencies" (Stanford, 2023), packages the Speedex result with related batch-auction work, including subsequent papers on augmenting batch exchanges with constant-function market makers.

### Core design

Speedex is a high-throughput batch-auction DEX for multi-asset spot trading. Three design choices distinguish it:

1. **Arrow-Debreu market structure.** Within a block, every asset has one valuation. Every order that trades in the block trades at that valuation. There is no path-dependence — a direct A-to-B trade gets the same effective price as A-to-USD-to-B. This eliminates internal arbitrage as a category and removes the front-running surface that order-by-order matching exposes.

2. **Tatonnement price discovery.** The block-level prices are computed by an iterative procedure adapted from classical economic theory — "tatonnement" is Walras's term for the iterative groping-toward-equilibrium of an auctioneer adjusting prices in response to excess demand. Speedex's algorithmic contribution is making this procedure fast and convergent enough to run once per block on the validator. The reference implementation runs Tatonnement with a 2-second timeout but reports that it typically converges far faster.

3. **Commutative execution engine ("Groundhog").** Once prices are set, the per-order fills can be applied in any order — the semantics are commutative. Speedex exploits this for parallel settlement on multi-core hardware. The follow-on paper "Groundhog: Linearly-Scalable Smart Contracting via Commutative Transaction Semantics" (arXiv:2404.03201, 2024) generalises the commutative-execution model to arbitrary smart contracts and is positioned as an alternative to software transactional memory (STM) for blockchain VMs.

### Reported performance

Over 200,000 transactions per second on a 48-core commodity server, sustained with tens of millions of open offers. This is the headline number from the NSDI paper and the Stellar developer blog posts. The benchmark is for the Speedex-on-its-own-chain configuration using HotStuff for consensus, not for the Stellar-integrated path.

### Implementations

- **`scslab/speedex`** — the main Speedex codebase. C++. Standalone, runs on its own HotStuff-based chain for benchmarking.
- **`scslab/smart-contract-scalability`** — the Groundhog codebase. Generalised commutative-execution engine with example contracts.
- **`sandymule/speedex-standalone`** — a Go reimplementation of the price-computation engine as a standalone binary, intended to let existing exchanges call out to Speedex pricing without adopting the full stack.

### Deployment status

Speedex has not been deployed in production as of May 2026. The closest path to production is the Stellar integration:

- **CAP-0044** ("SPEEDEX Configuration") — first proposal, handles configuration aspects only.
- **CAP-0045** ("SPEEDEX Pricing") — authored by Jonathan Jove, Geoffrey Ramseyer, and Jay Geng (2022).

A prototype of Speedex integrated inside `stellar-core` exists, but as of available documentation it has not been merged into the production Stellar protocol, and there is no announced timeline for activation. The standalone Speedex chain (with HotStuff) exists only as an academic benchmark target.

The classification, then, is: research-stage production prototype with an active path toward a real chain (Stellar) but no live network using it as the matching engine.

### Related concepts and influence

- **Stellar Consensus Protocol (SCP).** Mazieres's prior consensus work. The Stellar integration is the natural deployment target precisely because of the shared authorship.
- **Groundhog commutative-execution model.** Speedex's parallelism story generalised. Positioned against STM-style optimistic concurrency control as it appears in Aptos's Block-STM and in Solana's Sealevel scheduler. Of direct interest to any chain building a parallel-execution engine; UltraFast's own execution-lane design does not adopt Groundhog but is in the same problem space.
- **Solver-in-validator placement as architectural precedent.** This is the link UltraFast cites. The same placement question recurs in any chain that runs block-level batch matching or cross-chain solver auctions. Cross-chain intent-execution networks (Across, Anoma's solver model, and others) face an analogous "where does the solver live and who runs it" question, though the answers there are framed in terms of permissionless solver networks rather than in-validator native modules. Speedex's relevance to those projects is more conceptual (batch-auction-as-MEV-mitigation) than architectural.
- **Augmenting batch exchanges with CFMMs.** Ramseyer's follow-on work at ACM EC 2024 ("Augmenting Batch Exchanges with Constant Function Market Makers") connects the Speedex price-discovery procedure to standard AMM curves, showing that CFMM liquidity can be priced into the batch as a fixed point of the same Tatonnement procedure.

### Limitations

- **Research-stage code.** Both `scslab/speedex` and `scslab/smart-contract-scalability` are academic prototypes, not hardened production systems. No fuzzing/audit history comparable to deployed L1 client stacks.
- **Specialised to multi-asset spot.** Speedex's Arrow-Debreu structure and Tatonnement procedure assume spot trades against a shared set of asset valuations. Derivatives — perps in particular — do not fit cleanly: funding rates, mark prices, and margin checks are not part of the Arrow-Debreu primitive. This is the structural reason UltraFast cites Speedex for solver placement only, not for solver algorithm.
- **Tatonnement convergence assumption.** The whole performance story rests on Tatonnement reliably converging within the per-block time budget. The published benchmarks support this for the markets tested, but it is not a worst-case guarantee, and pathological order configurations can in principle push convergence above the timeout. The implementation's 2-second timeout is a safety valve, not a proof of convergence.
- **Single-chain throughput, single-machine benchmark.** The 200k-tx/s figure is on one 48-core machine in a benchmark configuration. Sustained production throughput on a permissionless validator set with adversarial inputs has not been demonstrated.
- **Front-running mitigation is internal-only.** Speedex eliminates the order-dependence inside a block but does not by itself address timing attacks at the consensus layer or content visibility to block proposers. A full MEV mitigation, as UltraFast's whitepaper notes, requires a consensus-layer fairness primitive underneath the batch auction.

### References

- Ramseyer, Goel, Mazieres. "SPEEDEX: A Scalable, Parallelizable, and Economically Efficient Decentralized EXchange." NSDI 2023. arXiv:2111.02719. Paper PDF at `scs.stanford.edu/~geoff/papers/speedex.pdf`.
- Ramseyer. "Scalable Infrastructure for Digital Currencies." Stanford PhD thesis, 2023. `scs.stanford.edu/~geoff/papers/ramseyer-thesis.pdf`.
- Ramseyer et al. "Groundhog: Linearly-Scalable Smart Contracting via Commutative Transaction Semantics." arXiv:2404.03201, 2024.
- Ramseyer et al. "Augmenting Batch Exchanges with Constant Function Market Makers." ACM EC 2024.
- `github.com/scslab/speedex` — main implementation.
- `github.com/scslab/smart-contract-scalability` — Groundhog codebase.
- Stellar CAP-0044, CAP-0045 — integration proposals at `github.com/stellar/stellar-protocol`.
- Stellar developer blog: "Building SPEEDEX" and "Behind the Scenes with SPEEDEX" at `stellar.org/blog/developers`.
