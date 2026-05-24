# HIP Listing Primitives (HIP-1, HIP-2, HIP-3)

## Part 1: How UltraFast uses HIP-equivalent listing primitives and why

UltraFast's market-deployment surface is implemented by three system contracts on the EVM lane (§9.6). Each mirrors one of the three production-validated Hyperliquid Improvement Proposals. The grouping is deliberate. HIP-1, HIP-2, and HIP-3 are the only set of permissionless listing primitives that have demonstrably scaled to billions of dollars of monthly volume on a derivatives venue. UltraFast adopts the same decomposition rather than inventing a parallel one.

The HIP-1-equivalent contract handles token issuance for new spot assets. Deployment proceeds through a Dutch auction whose winning bid pays the deploy gas. The auction-proceeds destination - burned, routed to a community treasury, or split - is left as an open decision in §16. A minimum bond and per-deployer rate-limiting throttle the spam vector that any permissionless deployment surface inherits.

The HIP-2-equivalent contract runs a native market-maker seeder per market. The seeder posts a fixed two-sided spread that refreshes against an oracle mark on a few-second cadence (Hyperliquid's HIP-2 uses 0.3%). A market then has executable depth from block zero rather than waiting on organic MM onboarding. The seeder is removable by governance once organic depth crosses a configurable threshold, which prevents the bootstrap mechanism from crowding out real liquidity.

The HIP-3-equivalent contract governs builder-deployed perpetual markets (§9.1, §13.6). Builders post a UFAST stake bond, earn a configurable share of fees from their markets up to a 30% cap, and have the bond slashable for oracle manipulation, malformed funding, or failed-liquidation cascades attributable to market-config errors. This contract is the load-bearing primitive for permissionless perp listings.

UltraFast diverges from Hyperliquid's pattern on three points. First, curation is governance-gated per asset *class* rather than uniformly. Crypto perps become permissionless once §16 audit milestones are met. RWA perps remain compliance-gated, with per-class leverage caps and liquidation-tier bands attached to the class rather than the individual market. Second, the stake bond is denominated in UFAST (not HYPE), and the slashing schedule integrates with the TSS misbehaviour penalties of §13.4 rather than standing alone. Third, fee buybacks - Hyperliquid's destination for HIP-1 auction proceeds via the Assistance Fund - are rejected at the protocol level by the BTC-denominated real-yield model of §13.1. That is why §16 names the HIP-1 auction-proceeds destination as still open. The system is pre-implementation.

## Part 2: Deep research on HIP-1, HIP-2, HIP-3

### HIP-1: Native token standard via Dutch auction

HIP-1 is Hyperliquid's permissionless token-issuance primitive. A would-be deployer acquires the right to deploy a new spot ticker by winning a 31-hour Dutch auction. The deployment gas decreases linearly from an initial price down to a floor of 500 HYPE. The initial price is set at twice the previous auction's clearing price if the previous auction succeeded, or at the 500-HYPE floor if it did not. Only one buyer can purchase the deployment slot in a given 31-hour cycle. Once the slot is bought the auction ends, and the buyer holds an open-ended option to deploy the token at any future time.

Once the slot is exercised, the project sets genesis balances, deploys a HIP-1 token under the native standard, creates a USDC trading pair, and optionally enables HIP-2 single-sided liquidity. The deployer specifies token metadata (name, symbol, decimals, max supply) at deployment and cannot mutate the core supply post-launch.

Payment currency for the auction was originally USDC; it was migrated to native HYPE on 22 May 2025. Auction proceeds today route entirely to the Hyperliquid Assistance Fund, the autonomous protocol-level entity that uses fees to buy HYPE on the open market and effectively retire it. The Hyper Foundation has proposed that the Assistance Fund holdings be formally recognised as burned. UltraFast cannot use this destination because §13.1 commits to BTC-denominated real yield rather than token-buyback yield; this is the unresolved choice in §16.

HIP-1 has been live on Hyperliquid mainnet since the 2024 spot launch. By mid-2026 it has produced several thousand listed tokens across the spot venue.

### HIP-2: Hyperliquidity native MM seeder

HIP-2 ("Hyperliquidity") is the on-chain bootstrap-MM contract that posts two-sided liquidity for HIP-1 tokens directly on the native order book. It is not a Uniswap-style AMM in a parallel pool, but actual limit orders on the on-chain CLOB. The deployer configures a starting price, a size schedule, and a USDC float. The contract then posts a ladder of ask orders at increasing prices above the starting mark and a ladder of bid orders funded by the USDC float below it.

The protocol-level invariant is a 0.3% spread refreshing roughly every 3 seconds (every block transition). A freshly-deployed asset therefore has a tight executable book before any external market maker shows up. The orders are refreshed against the validator-set spot oracle, which is the stake-weighted median of validator-submitted spot prices. Each submitted price is itself a weighted median over Binance (weight 3), OKX, Bybit (2), Kraken, Kucoin, Gate, MEXC (1).

HIP-2 has been live since the 2024 spot launch. Its design intent is to remove the cold-start liquidity problem from the listing pathway, not to be a long-term liquidity backstop. The seeder is intended to coexist with organic MM flow rather than substitute for it. UltraFast's HIP-2-equivalent inherits the 0.3%-spread-every-few-seconds shape but exposes a governance lever to retire the seeder once organic depth is sufficient.

### HIP-3: Builder-deployed perpetuals

HIP-3 is the permissionless perp-deployment primitive and the most economically significant of the three. It launched on Hyperliquid mainnet on 13 October 2025. The mechanism: any entity ("builder") that stakes 500,000 HYPE may deploy an arbitrary perpetual market. The builder registers an oracle contract, a funding-rate specification, a leverage band, and a fee schedule. The 500K HYPE stake is a returnable security bond, not a fee. It is refundable after a 30-day post-halt holding period plus a 7-day unstaking queue, and slashable for malicious behaviour identified through the dispute system.

The fee split between the protocol and the builder is a fixed 50/50. The builder retains up to 50% of trading fees generated on their deployed markets. This produces the cross-DEX builder-code-fee pattern that UltraFast cites in §13.6.

Market growth has been substantial. By March 2026 HIP-3 open interest had passed $1.43B, and by 21 May 2026 network-wide HIP-3 OI was estimated at $2.56B. More than 140 non-crypto perpetuals had been launched. Tokenized stocks and commodities (S&P 500, oil, gold, silver) represented 23 of the top 30 trading pairs across Hyperliquid. The dominant deployer by OI is trade.xyz at over 90% share of HIP-3 OI; other active deployers include Ventuals, HyENA, Markets by Kinetiq, and Felix.

UltraFast's HIP-3-equivalent (§9.1) replicates the stake-bond / fee-share / slashable structure, but denominates the bond in UFAST rather than HYPE, caps the fee share at 30% (versus Hyperliquid's 50%), and gates deployment by asset class rather than uniformly.

### The Hyperliquid stack as context

The HIPs sit on top of a closed-source matching engine, a custom HotStuff-derivative L1 ("HyperBFT"), and a HyperEVM lane that surfaces HIP state to general smart contracts. UltraFast's architectural target is the same composition pattern - purpose-built L1, FBA matching engine, EVM lane with system-contract bridges. UltraFast differs by using open-source consensus (Threshold Simplex + Minimmit), pre-published cryptographic primitives, and a different MEV stack (multi-concurrent-proposer plus FBA plus tokenized ordering, §8).

The economic divergence is the buyback model. Hyperliquid uses HIP-1 auction proceeds and a portion of perpetual fees to fund the Assistance Fund, which buys HYPE on the open market and effectively retires it. UltraFast §13.1 explicitly rejects this model in favour of pure BTC-denominated real yield. The HIP-1 auction-proceeds destination is left open in §16 precisely because the burn-versus-treasury-versus-split decision cannot be defaulted from the Hyperliquid pattern.

### Other projects with similar listing primitives

**dYdX v4.** Governance-gated rather than primitive-gated. Any holder of at least 2,000 unstaked DYDX can propose a new market. The proposal runs through the standard dYdX Chain governance pipeline (4-day vote, 33.4% NoWithVeto threshold). A `Market Mapper` system continuously preloads new market candidates with liquidity, reference prices, and metadata, so that the governance-approved listing can switch on permissionlessly once the vote passes. The Elixir Protocol integration provides bootstrap MM analogous to HIP-2. Volume scale by 2026 is smaller than Hyperliquid's; dYdX v4 has retained governance gating rather than transitioning to a HIP-3-style stake-bond model.

**Drift (Solana).** Lists roughly 35 perpetual markets with leverage tiered by asset class (20x for BTC/ETH/SOL, 10x for mid-caps like JUP/JTO/PYTH/DOGE, 5x for memecoins). New listings are operator-driven rather than permissionless via bond; the protocol matches taker flow through a JIT auction first, with an AMM fallback for residual flow. Over $700M in open interest by 2026.

**Aevo (OP-stack rollup).** Has builder-code-style affiliate codes and structured-product listings but does not expose a HIP-3-equivalent stake-bond pathway; markets are added by the Aevo team.

**Vertex Protocol.** Cross-margined perpetuals on Arbitrum with a centrally-curated market set; no permissionless deployment pathway analogous to HIP-3.

**Synthetix V3.** Pool/vault/market creation is governance-approved by the Spartan Council, with explicit roadmap intent to transition to permissionless once V3 stabilises. Market creators can choose custom oracle aggregations across Chainlink, Pyth, and Uniswap TWAPs. The Andromeda deployment uses Pyth for short-delay settlement pricing. Architecturally Synthetix V3 sits closer to dYdX v4 (governance-gated) than to Hyperliquid (bond-gated), but with deeper oracle composability than either.

### Builder-code fee sharing as a cross-DEX phenomenon

Hyperliquid's HIP-3 fee split (50/50, fixed) is the cleanest production example, but several venues run analogous primitives. Aevo runs an affiliate-code system. dYdX v4 has indexer rewards plus a permissionless market-listing widget. trade.xyz's dominance of HIP-3 OI demonstrates that a single skilled builder can capture a substantial share of a HIP-3-style fee stream. UltraFast caps its builder fee share at 30% per §13.6 - a structural choice that trades off attractiveness-to-builders against revenue-to-stakers.

### Critiques and limitations of HIP-style permissionless deployment

Three known pathologies bound the design.

First, spam markets. A 500K-HYPE bond is high enough to deter idle deployment but low enough that well-funded actors can deploy markets purely for volume-extraction or wash-trading attacks; UltraFast's per-class gating is a partial response.

Second, oracle attack surface. Each HIP-3 market chooses its own oracle. A builder who controls the oracle effectively controls the market's funding rate, liquidation path, and settlement price. The slashing schedule must therefore cover the full surface of oracle misbehaviour rather than only TSS misbehaviour. UltraFast's slashing covers "oracle manipulation, malformed funding, or failed-liquidation cascades attributable to market-config errors" explicitly per §9.1, which is broader than Hyperliquid's documented surface.

Third, liquidity fragmentation. A 140-market HIP-3 surface plus the underlying core-perp set fragments LP attention across more books than the underlying flow can sustain. trade.xyz capturing 90% of HIP-3 OI is consistent with a power-law concentration in which the long tail of HIP-3 markets sees thin organic depth. UltraFast's HIP-2-equivalent bootstrap MM addresses the cold-start problem but does not address the steady-state fragmentation problem. The cross-product margin design of §9.3 partially does, by letting traders hold one collateral pool against many markets.

### References

- Hyperliquid Docs, "HIP-1: Native token standard."
- Hyperliquid Docs, "HIP-2: Hyperliquidity."
- Hyperliquid Docs, "HIP-3: Builder-deployed perpetuals."
- Hyperliquid Wiki, "Spot Deployments (HIP-1 / HIP-2)."
- CoinGecko Learn, "Hyperliquid's HIP-3 & HIP-4: Tokenized Stocks and Prediction Markets."
- CCN, "How Hyperliquid's HIP-3 Lets Builders, Not Exchanges, Define Perp Markets."
- Loris Tools, "HIP-3 Data & Analytics" (active-market and OI snapshots).
- CoinDesk (2026-03-10), "Hyperliquid's tokenized futures hit $1.2B as traders bet on oil, stocks."
- dYdX Foundation, "v4 Deep Dive: Governance" and "Proposing a new market."
- dYdX Foundation, "Market Listing Widget."
- Synthetix Blog, "What is Synthetix V3?" and "Perps V3 Features & Release Explainer."
- Drift Trade documentation (market list and leverage bands).
- GoPlus Security (2025-11), "Hyperliquid Buyback, Burn, and Staking Mechanism Research Report."
- The Defiant, "Hyperliquid Proposes Burning 13% of Circulating Supply."
