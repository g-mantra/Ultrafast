# Frequent Batch Auctions

## Part 1: How UltraFast uses FBA and why

UltraFast's matching engine (whitepaper §7) is an in-protocol Frequent Batch Auction. All orders that arrive at a market within a 100 ms tick clear together at a single uniform price, with pro-rata fills at the marginal level. The clearing computation is invariant under permutation of the contributing orders: within a tick there is no per-order price discovery, and no fill is reorderable. That last property is the load-bearing one — it is what eliminates the three highest-value perpetual-futures MEV categories (sandwich, classic front-run, time-boost) by construction rather than by encryption or by trusted ordering (§8.2).

The solver runs as an in-validator native module called from a system contract at the tick boundary, following the Speedex precedent of solver-in-validator rather than solver-in-VM-precompile (§7.5). FBA operates at block level rather than transaction level, so it does not fit cleanly into a per-transaction precompile model. The same engine serves perpetual futures and scalar prediction markets (§7.6, §9.2), and cross-product margin (§9.3) is layered above the engine — both products inherit the same MEV protections as a side-effect of sharing the matching path.

The economic argument is Budish, Cramton, and Shim's 2015 QJE result that continuous-time matching produces a sniping equilibrium in which liquidity providers are systematically adversely selected by faster traders on public information signals. Discrete-time batch matching breaks the equilibrium: when nanoseconds inside a tick do not matter, the arms race collapses and competition shifts from speed to price.

Tick selection is constrained on two sides. The tick must not exceed the block interval — a tick that closes after the next block is finalised reintroduces a round-trip the architecture explicitly removes — and the solver p99 must run in no more than 20 % of the tick (≤ 20 ms at 100 ms). UltraFast's 100 ms working assumption is one to two orders of magnitude tighter than Penumbra ZSwap (~5 s) or CowSwap (~30 s), sized to a CEX-competitive perpetuals workflow rather than an asset-swap workflow. The tick parameter itself remains an open decision (§16) across 100, 150, and 200 ms; so do carry-versus-expire policy (default: limit-carries, market-expires), post-only handling (omit, tick-pre-commit conditional reveal, or parallel continuous lane), and EVM-lane order-write parity.

The system is pre-implementation. Phase 0 of the walking-skeleton roadmap (§16.1) exercises FBA-as-EVM-system-contract integration as one of the four highest-risk integrations, against a single BTC-collateralised inverse perp on a four-validator testnet.

## Part 2: Deep research on FBA

### Mechanics

A frequent batch auction divides continuous wall-clock time into equal discrete intervals (the "tick") and processes all orders that arrive within an interval as a single batch at its close. The clearing rule is uniform-price double auction: find the price $p^*$ at which aggregate buy quantity equals aggregate sell quantity, fill all crossing orders at $p^*$, and ration pro-rata at the marginal price level when supply and demand do not exactly meet. Orders that do not cross at $p^*$ either carry to the next tick (limit orders, in most designs) or expire (IOC, FOK, market orders).

The mechanism has three properties that follow directly from the construction. First, time priority within a tick is undefined — two orders arriving 1 µs apart are indistinguishable to the matching engine. Second, uniform pricing means no individual order receives price improvement at the expense of another; everyone who crosses at the tick gets the same fill price. Third, the clearing computation is order-independent: the engine's output is a pure function of the multiset of orders in the tick, not of their arrival sequence. The third property is what makes intra-tick reordering attacks (sandwich, classic front-run, time-boost) non-extractive: there is no ordering for an adversary to manipulate.

Cancels processed within a tick are zero-cost in most FBA designs. This is a direct response to a known pathology of time-priority continuous order books — that high cancel-to-fill ratios are penalised by exchange fee schedules even when cancels reflect genuine inventory management, because the venue cannot distinguish a cancel from a quote-stuffing attack. In an FBA, cancels arriving before the tick close are equivalent to never having placed the order, and that equivalence is mechanical rather than policy.

### Foundational paper

Budish, Cramton, and Shim, "The High-Frequency Trading Arms Race: Frequent Batch Auctions as a Market Design Response," QJE 130(4) 1547–1621 (2015). Editor's Choice. The argument has three steps.

Step one — diagnostic. Latency arbitrage produces rents on symmetrically observable public information signals (futures-spot lead-lag, exchange-traded fund versus underlying basket, cross-venue price drift). These rents are not classic adverse-selection rents from asymmetric private information; they are mechanical rents from the discreteness of price-jump events combined with the continuity of the order book. A faster trader sees the lead asset move, races to pick off stale quotes on the lagging asset, and is structurally guaranteed to profit so long as their latency edge is positive — not in expectation, but with probability close to one on each event.

Step two — equilibrium. In a continuous market, market makers cannot widen spreads enough to escape the sniping risk without losing flow to competing market makers; the equilibrium spread is set by a sniping-cost component that does not go to zero as the number of competing snipers grows. The arms race for speed is, in equilibrium, a transfer from liquidity providers (and their counterparties) to whoever wins the latency race. The transfer is socially wasteful because the underlying public information arrives at the same time for everyone; only the race-to-trade is competitive.

Step three — solution. Discretise time. If the venue clears at fixed intervals of length $\tau$ rather than continuously, two market makers whose orders arrive within the same $\tau$ are indistinguishable, the sniper's latency advantage no longer guarantees first execution, and the sniping-cost component of the spread collapses. Budish-Cramton-Shim propose $\tau$ in the 100 ms range as a working figure, on the empirical observation that 100 ms is well above the round-trip latencies of all relevant trading firms and well below the time scale at which fundamental price-discovery information arrives. Subsequent literature (Aquilina-Budish-O'Neill, 2022, "Quantifying the HFT Arms Race") quantifies the annual transfer at $\sim$5 bps of trading volume on the LSE, supporting the magnitude of the equilibrium effect.

### Implementations in crypto

**Injective.** Cosmos-SDK derivatives chain with FBA matching at end-of-block. Current block time is ~0.65 s, so the effective FBA tick is also ~0.65 s. Injective's framing is consistent with Budish-Cramton-Shim's 100–900 ms recommended range. The exchange module is part of the chain's state machine, with the on-chain order book and matching engine treated as protocol components, not application contracts. MEV resistance is positioned as the primary value proposition of the FBA choice.

**Penumbra (ZSwap).** Shielded DEX with batch auctions at end-of-block, block time ~5 s. ZSwap's design pairs FBA with privacy: incoming swap intents are private, batched by trading pair, and executed at block close against concentrated-liquidity positions. The tick is two orders of magnitude longer than UltraFast's working assumption, reflecting an asset-swap rather than perpetuals workload.

**CoW Protocol (CowSwap).** Off-chain batch auction with on-chain settlement. Batch interval is approximately 30 seconds. The distinctive feature is the solver-competition layer: independent solvers bid to settle a batch by proposing complete allocations, and the winning solver settles on-chain. CoW Protocol popularised uniform clearing prices in Ethereum DeFi and is the largest-by-volume FBA implementation in DeFi today. The off-chain solver architecture is the principal alternative to UltraFast's in-validator solver placement.

**Vega Protocol.** L1 derivatives venue using batch auctions and continuous limit order books depending on market state. Vega is a comparison point for protocol-level FBA mechanics in a derivatives context, including the use of batch auctions during stressed market conditions for risk management.

**Speedex (Stanford, NSDI 2023).** Ramseyer, Goel, and Mazières. Speedex constructs a virtual auctioneer that solves the uniform-price clearing problem across many assets simultaneously, framed as an Arrow-Debreu exchange equilibrium. Reported throughput exceeds 200,000 TPS on 48-core servers with tens of millions of open offers. Speedex is prototyped on Stellar; UltraFast cites it as the precedent for solver-in-validator rather than solver-in-VM-precompile placement.

**SUAVE.** Flashbots' shared sequencing layer proposes FBA as one mode for shared-order-flow auctions. Research stage rather than production.

### Traditional-finance precedents

Frequent batch auctions are not a crypto invention. The Taiwan Stock Exchange used call auctions throughout its regular trading session until March 2020, when it migrated to continuous trading during intraday hours to align with international practice; the historical TWSE design with call auctions every few seconds is one of the few production-scale examples of high-frequency batch auctions on a major equity market. CME and most major equity exchanges run call auctions at the open and the close, but use continuous matching during the regular session. The Eurex Trader-EFP service uses batch auctions for certain derivatives products. Citadel Securities published a 2022 paper arguing that continuous trading produces better outcomes than auctions on conventional metrics (spread, depth, price discovery) for retail-scale equity flow — the industry counter-argument that UltraFast must engage with on derivatives-specific grounds.

### Comparison to continuous matching

Continuous matching in price-time priority is the dominant matching mode at every major centralised crypto exchange and at dYdX v4 and Hyperliquid among derivatives DEXes. The trade-off relative to FBA is clean:

- Continuous matching produces tighter spreads under benign conditions because market makers can quote aggressively knowing they retain first-in-line priority; FBA flattens that benefit.
- Continuous matching produces wider spreads under adverse conditions because the sniping component of the spread does not collapse with competition; FBA flattens that cost.
- Continuous matching exposes intra-block ordering MEV as a first-class extraction surface; FBA eliminates intra-tick ordering MEV by construction.
- Continuous matching has well-understood post-only and pegged-order semantics; FBA does not have a clean equivalent — post-only is awkward when there is no continuous book against which to post.

Hyperliquid's position is that "very fast blocks make the MEV window tiny" and therefore FBA-equivalent protections are not required; the FBA literature replies that tiny is not zero and that sniping rents survive at any non-zero latency differential. dYdX v4 takes the same continuous-matching design choice with the same trade-off.

### Limitations

Three limitations matter for UltraFast specifically.

First, liveness is tick-coupled. If the chain misses a tick, fills are delayed at the tick interval, not the block interval. UltraFast pins the tick to consensus cadence (100 ms) to make these coincide — a missed tick is a missed block, which the consensus layer (§5.1, §5.2) already counts as a liveness fault.

Second, post-only semantics are unresolved. The clean answer in a pure batch model is to forbid post-only orders; the user-experience answer is to support them via a tick-pre-commit conditional-reveal pattern. The open decision (§16) lists both options.

Third, the solver-location debate. CoW Protocol's off-chain solver architecture decouples the matching computation from the consensus path and admits a competitive solver market; the trade-off is a trust assumption on the off-chain solvers (mitigated by competition and verification) and a latency floor (the off-chain auction window). UltraFast's solver-in-validator placement, following Speedex, eliminates the off-chain trust assumption but forecloses a competitive solver market and concentrates the matching computation on the validator path. The placement is open to revision post-Phase-0 benchmarking.

### Status of the literature

The 2015 Budish-Cramton-Shim paper remains the canonical reference. Aquilina, Budish, and O'Neill (2022, "Quantifying the High-Frequency Trading Arms Race") provides the empirical follow-up using LSE data. Eibelshäuser and Smetak (2022, "Frequent Batch Auctions and Informed Trading") refines the original equilibrium under partial information. Zhang and Ibikunle (Edinburgh, "Latency Arbitrage and Frequent Batch Auctions") provides empirical evidence that slower traders shift volume into FBA venues during periods of high latency-arbitrage activity, consistent with the original mechanism. The CFA Institute and Citadel Securities have published industry-side critiques arguing FBA degrades retail execution quality on conventional metrics; the response from the academic side is that the conventional metrics are sniping-equilibrium artefacts and do not capture the welfare transfer.

For UltraFast the operative literature is narrower: the original QJE paper for the mechanism, the Speedex NSDI 2023 paper for the in-validator solver placement, and the production observations from Injective (sub-second tick, end-of-block solver) and CowSwap (30-second tick, off-chain solver) for the implementation envelope. The 100 ms target sits at the aggressive end of that envelope and matches the original Budish-Cramton-Shim recommended figure.
