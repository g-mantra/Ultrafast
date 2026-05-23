# dYdX v4 Fee Architecture and Validator Design

Research note supporting the UltraFast whitepaper (`/Users/g/git/mantra/ultrafast/whitepaper.md`, §13.1, §13.5, §15, ref [38]). UltraFast is a pre-implementation L1 by the MANTRA team; dYdX v4 is cited as the economic precedent for two specific elements of UltraFast's fee design — not as a technical dependency. This note documents (1) how UltraFast borrows from dYdX v4 and where it departs, and (2) what dYdX v4 actually is, in enough detail to defend the citation.

## Part 1: UltraFast's use of dYdX v4 as precedent

### What UltraFast borrows

The whitepaper cites dYdX v4 [38] in three places, all economic rather than architectural:

1. **5% validator-commission floor** (§13.1, §13.5). UltraFast's working assumption is a commission floor of 5% and a ceiling of 20% on the bonded-delegator share. The 5% floor is taken directly from dYdX v4, where validator commission rates have a hard-coded minimum of 5% (against a 100% maximum). UltraFast cites this in two places — once in the fee-distribution table (§13.1) and again in the anti-concentration measures (§13.5) — because the same floor serves two functions: it prevents commission undercutting races to zero (which would push small delegators toward the largest validators) and it guarantees validators a non-zero margin on operations cost.

2. **100% of liquidation penalties to the insurance fund** (§13.1). UltraFast routes liquidation revenue to the IF separately from trading fees, "matching dYdX, Drift, and Aevo industry practice." dYdX v4's insurance fund is funded by liquidation penalties (default 1.5% maximum liquidation penalty, governance-tunable), and ADL only triggers when the IF is exhausted. UltraFast follows the same shape: no trading-fee carve-out for the IF; the backstop relies on liquidation throughput plus the §10.5 dispute-window-and-kill-switch policy.

3. **Fee tiers by 30-day rolling volume** (§13.1, parameter list). dYdX v4's fee schedule scales taker fees down (from ~5 bps at Tier 1 to ~2.5 bps at Tier 6) and maker rebates up based on trailing 30-day USD volume across all perpetual books, with the top tiers gated by market-share thresholds in addition to volume. UltraFast adopts the same breakpoint structure as the working default for governance to tune.

### Where UltraFast departs (§15)

- **Fee currency.** dYdX v4 distributes real yield in USDC (the native collateral asset, bridged via Noble/CCTP). UltraFast distributes in BTC, with non-BTC fees converted at FBA clearing price (or a depth-thresholded oracle fallback) and routed through a BTC vault. The whitepaper's reflexivity argument against the Hyperliquid buyback model (§13.1) is the same argument against denominating in UFAST.
- **Fee-side routing.** dYdX v4 subtracts a community-tax share (`community_tax` parameter on the x/distribution module) and a validator commission before paying stakers. UltraFast routes 100% of trading and gas fees to stakers, with no fee-side carve-out for IF or treasury. A treasury, if needed, is funded by §13.2 security-baseline inflation instead.
- **Matching architecture.** dYdX v4 runs continuous limit-order-book matching; UltraFast runs a frequent batch auction. This is a §15 departure point, not a borrowing.
- **Orderbook substrate.** dYdX v4's validators each hold the full orderbook in memory and gossip orders peer-to-peer off-chain, with only matched fills committed on-chain. UltraFast's matching engine is also in-validator but operates on a batch tick rather than continuously, with the MCP + threshold-encrypted mempool + tokenized-ordering stack of §3–§5 providing MEV resistance dYdX v4 does not have.
- **Custody.** dYdX v4 holds USDC in the Cosmos bank module after IBC transfer from Noble. UltraFast uses TSS + ZK light-client bridging for native-asset custody (§10).
- **Codebase.** UltraFast does not use the dYdX v4 protocol code (Cosmos SDK + CometBFT). The execution stack is greenfield Rust on Commonware consensus with reth as the EVM lane (§15, Injective comparison). The dYdX-v4 patterns are economic precedents only.

The citation pattern in the whitepaper is therefore narrow and defensible: UltraFast takes two specific parameter choices (commission floor, IF funding source) and one schedule shape (30-day volume tiers) from dYdX v4 without inheriting its consensus, matching, custody, or fee-currency decisions.

## Part 2: dYdX v4 — architecture and economics

### Origin and launch

dYdX v3 was a hybrid Layer-2: matching engine and order book ran on dYdX Inc.'s servers off-chain, while settlement and custody lived in StarkWare's StarkEx ZK-rollup on Ethereum. The team's `v4` rewrite (open-sourced October 24, 2023) moved the entire stack onto a sovereign Cosmos SDK + CometBFT (Tendermint) Layer 1: the dYdX Chain. Mainnet launched in October 2023 with a staged rollout — Alpha (no trading), Beta (33 markets, no trading rewards), and Full Trading on November 28, 2023. Concurrent with full trading, a 6-month, $20M DYDX Launch Incentives Program (run by Chaos Labs) went live alongside per-block trading rewards.

The migration was explicitly a decentralization step: in v3 the team operated the only matching engine and collected protocol fees; in v4 the team forewent fee revenue entirely, and 100% of trading and gas fees go to validators and stakers via the Cosmos `x/distribution` module.

### Consensus and validator set

- **Consensus:** CometBFT (Tendermint BFT), PoS with weighted-round-robin proposer selection weighted by bonded stake.
- **Substrate:** Cosmos SDK.
- **Active set:** Top 60 validators by bonded stake (self-bond plus delegations). Initial launch set was 25; `max_validators` is a governance-tunable parameter, raised to 60 post-launch.
- **Permissionless:** Anyone meeting the bond requirement can join; non-active validators sit below the active-set cutoff but can be promoted by stake.
- **Average commission (as of early 2026):** ~6.08% per Mintscan, very near the 5% floor — confirming that the floor binds in practice rather than being theoretical.

### Validator-distributed orderbook (the v4 architectural signature)

Each validator runs an in-memory matching engine with the full order book. Orders are gossipped peer-to-peer over the CometBFT mempool layer; the matching itself is **not** part of consensus and is **not** committed to chain state. The block proposer (selected each height by weighted round-robin) takes the matches produced locally, includes them as transactions in its proposed block, and consensus only validates the resulting fills (collateral debits/credits, position updates), not the matching logic that produced them.

This is the central trade-off of the v4 design: it gets ~2,000 trades-per-second throughput by keeping the order book off-chain, but it inherits two problems:

1. **Block-proposer MEV.** A dishonest proposer can sandwich a large market order, ignore cancellations, or match against worse-priced resting orders, because the on-chain block only records fills, not the original order stream. dYdX's mitigation is **social** rather than cryptographic: a third-party tool by Skip runs a shadow matching engine against the public gossip stream and flags proposed-block deviations; persistent offenders are subject to governance slashing or removal from the validator set. The MEV Committee publishes monthly reports.
2. **State-machine divergence risk.** All validators must independently arrive at the same matched-fills output for any given order stream; in-memory matching engine determinism is therefore a hard correctness requirement.

### Tokenomics and fee distribution

- **DYDX token:** ERC-20 originally (on Ethereum); now also a native Cosmos asset on the dYdX Chain. Used for staking, governance, and is the gas token for non-USDC-denominated transactions.
- **Trading fees:** Collected in USDC (the sole collateral asset).
- **Gas fees:** Collected in USDC or DYDX.
- **Distribution flow:** Each block, fees accrue to the `fee_collector` module account, transfer to the `x/distribution` module on the next block, then:
  - `community_tax` is subtracted (community treasury).
  - `validator_commission` is subtracted per validator (5%–100% range, set per-validator).
  - Remainder is distributed pro-rata to stakers by bonded share.
- **Claim model:** Stakers must manually claim rewards per block, predominantly in USDC (Keplr, Leap, or programmatic clients).

This is the part UltraFast diverges on: UltraFast eliminates the `community_tax` line (no fee-side carve-out), denominates in BTC instead of USDC, and bounds commission to 5–20% rather than 5–100%.

### Fee schedule

Working dYdX v4 schedule (governance-tunable):

- Maker: -1.1 bps (top-tier rebate) to +1.0 bps.
- Taker: ~5 bps (Tier 1, <$1M 30-day volume) down to ~2.5 bps (Tier 6, $125M+ volume and >= 0.5% market share).
- Top tiers (7–9) require both volume thresholds and market-share thresholds; Tier 9 needs $125M+ volume AND >= 4% market share for the maximum -1.1 bps maker rebate.

UltraFast cites this 30-day-volume-tier shape as the precedent for its own fee parameter (§13.1, parameter list), without committing to the same bps numbers.

### Liquidation and insurance fund

- **Maximum liquidation penalty:** 1.5% (default; governance-tunable).
- **IF funding:** Liquidation penalties only — no trading-fee carve-out.
- **ADL (auto-deleveraging):** Last resort. Triggers only if the IF cannot cover a liquidation. Highest-leverage offsetting profitable positions are deleveraged first.
- **Historical:** ADL has rarely triggered; the IF has typically been sufficient.

UltraFast adopts this shape verbatim (§13.1): 100% of liquidation penalties to IF, no fee-side carve-out, ADL-equivalent as last resort.

### Adjacent systems

- **Indexer:** Read-only off-chain service (REST + WebSocket) that exposes chain state to clients in a trading-UI-friendly form. Anyone can run one. The Indexer is **not** consensus-critical — it only serves data — but it is the primary client-facing API surface in practice.
- **Noble bridge:** USDC enters via Circle's CCTP on Noble (a Cosmos appchain dedicated to native USDC issuance) and IBC-transfers to dYdX Chain. Once in, USDC is held in the chain's `bank` module — fully on-chain custody, no third-party custodian. Withdrawal rate-limits are set by governance for emergency response.
- **MM rewards:** Of the trading-rewards budget, 80% goes to trading activity and 20% to market-maker activity (the launch-period split).
- **Builder codes:** Similar to Hyperliquid's — front-ends and integrators tag orders with a builder code and earn a configurable share of fees on flow they originate. UltraFast has the equivalent in §13.6.

### Current scale (May 2026)

- Daily volume: ~$150–250M range (24h derivatives volume).
- Open interest: ~$175–200M.
- Lifetime volume: $1.5T+ (passed $1.4T in 2025; H1 2025 alone processed $316B on-chain).
- Markets: 200+ supported perpetual markets.
- 2026 roadmap: RWA perpetuals (synthetic equities such as Tesla), permissionless market listings, broader cross-chain integration.

### Critiques and known limitations

- **MEV surface:** The validator-distributed orderbook is the largest known attack surface — block-proposer reordering and sandwiching are possible by construction and only socially deterred. This is the explicit reason UltraFast picks FBA over continuous matching (§15) and stacks MCP + threshold encryption + tokenized ordering on top.
- **Indexer evolution:** Indexer rewards and the trading-rewards formula have been revised multiple times since launch (the original `formula-based` rewards were criticized for wash-trading incentives; current schedules are more conservative).
- **Single-collateral chain:** USDC-only collateral. Diversification to multi-collateral has been on the roadmap but not yet shipped at scale.
- **Sovereign-chain coordination cost:** Every parameter change is a governance vote on the dYdX Chain itself — slower iteration than a centralized venue or a team-controlled L2.

## Summary

UltraFast's three explicit borrowings from dYdX v4 — the 5% commission floor, 100%-of-liquidation-penalties-to-IF, and 30-day-volume fee tiering — are well-supported by the dYdX v4 production record. The departures (BTC vs USDC fee currency, no `community_tax` carve-out, FBA vs continuous matching, MCP-based MEV resistance, TSS+ZK custody, greenfield Rust stack) are deliberate and motivated by the criticisms of dYdX v4 itself: the validator-orderbook MEV surface, the USDC-bridge single-asset dependency, and the reflexivity of token-denominated rewards. The §15 framing — "follows the dYdX-v4 precedent in two specific elements" — accurately describes the relationship.

## Sources

- [dYdX v4 Technical Architecture Overview](https://www.dydx.xyz/blog/v4-technical-architecture-overview)
- [Intro to dYdX Chain Architecture (docs)](https://docs.dydx.exchange/concepts-architecture/architectural_overview)
- [Rewards, Fees and Parameters (docs)](https://docs.dydx.xyz/concepts/trading/rewards)
- [Staking Rewards (docs)](https://docs.dydx.xyz/concepts/trading/rewards/staking-rewards)
- [Distribution module (dYdX Community)](https://docs.dydx.community/dydx/modules/distribution)
- [dYdX Foundation Validators Introduction](https://www.dydx.foundation/validators/introduction)
- [Mintscan: dYdX validators](https://www.mintscan.io/dydx/validators)
- [Observatory Zone: dYdX validators](https://observatory.zone/dydx/validators)
- [Liquidations (docs)](https://docs.dydx.xyz/concepts/trading/liquidations)
- [Contract loss mechanisms on dYdX Chain (Help Center)](https://help.dydx.trade/en/articles/166973-contract-loss-mechanisms-on-dydx-chain)
- [Trading fees on dYdX (Help Center)](https://help.dydx.trade/en/articles/166995-trading-fees-on-dydx)
- [Fee Tiers (dYdX Community)](https://docs.dydx.community/dydx/modules/governance/governance-adjustable-parameters/fee-tiers)
- [v4 Deep Dive: Rewards and Parameters](https://www.dydx.xyz/blog/v4-rewards-and-parameters)
- [Trading and Launch Rewards Now Live on dYdX Chain](https://dydx.exchange/blog/v4-full-trading)
- [Understanding Rewards and Fees on the dYdX Chain (Foundation)](https://www.dydx.foundation/blog/understanding-rewards-and-fees-on-the-dydx-chain)
- [dYdX Chain to distribute all network fees to validators and stakers (The Block)](https://www.theblock.co/post/259766/dydx-chain-to-distribute-all-network-fees-to-validators-and-stakers)
- [Indexer Deep Dive (docs)](https://docs.dydx.exchange/concepts-architecture/indexer)
- [Announcing CCTP on Noble](https://dydx.exchange/blog/cctp)
- [How dYdX Powers Their Leading DEX Software with CCTP & USDC (Circle)](https://www.circle.com/blog/how-dydx-powers-their-leading-dex-software-with-cctp-usdc)
- [Decentralized Order Book Design in dYdX v4 (Jung-Hua Liu, Medium)](https://medium.com/@gwrx2005/decentralized-order-book-design-in-dydx-v4-625ac0152e80)
- [dYdX v4: Architectural and Protocol Evolution from v3 (Jung-Hua Liu, Medium)](https://medium.com/@gwrx2005/dydx-v4-architectural-and-protocol-evolution-from-v3-6c312f51f7b7)
- [Technical Architecture Comparison: Hyperliquid, dYdX, and Lighter.xyz (Jung-Hua Liu, Medium)](https://medium.com/@gwrx2005/technical-architecture-comparison-hyperliquid-dydx-and-lighter-xyz-2fd005854a7e)
- [dYdX v4 and MEV (dYdX blog)](https://www.dydx.xyz/blog/dydx-v4-and-mev)
- [An update on MEV — Catching a Bad Validator (dYdX blog)](https://www.dydx.xyz/blog/update-on-mev)
- [Distinguishing MEV from Expected Noise (dYdX blog)](https://www.dydx.xyz/blog/distinguishing-mev-from-expected-noise)
- [MEV Committee December Report (dYdX Forum)](https://dydx.forum/t/mev-committee-december-report/1890)
- [dYdX v4 Social Mitigation Strategy for MEV (dYdX Forum)](https://dydx.forum/t/dydx-v4-social-mitigation-strategy-for-mev/1377)
- [dYdX v3 (L2BEAT)](https://l2beat.com/scaling/projects/dydx)
- [dYdX V4 TVL, Fees, Revenue & Volume (DefiLlama)](https://defillama.com/protocol/dydx-v4)
- [dYdX Chain Statistics (CoinGecko)](https://www.coingecko.com/en/exchanges/dydx-chain)
- [dYdX Chain (v4) Exchange Trade Volume (TokenInsight)](https://tokeninsight.com/en/exchanges/dydx-chain-v4)
- [dYdX Chain completes mainnet migration (CryptoSlate)](https://cryptoslate.com/dydx-chain-completes-mainnet-migration-rolls-out-20-million-in-dydx-token-rewards/)
- [dYdX Chain: Launch Incentives Program (Chaos Labs)](https://chaoslabs.xyz/posts/dydx-v4-launch-incentives)
- [dYdX re-launch Rewards Explainers (Chaos Labs)](https://chaoslabs.xyz/posts/dydx-re-launch-rewards-explainers)
- [Network 101: A comprehensive guide to dYdX v4 (Chorus One)](https://chorus.one/articles/network-101-a-comprehensive-guide-to-dydx-v4)
- [dYdX Review 2026 (CryptoAdventure)](https://cryptoadventure.com/dydx-review-2026-dydx-chain-perpetuals-rewards-and-security-reality/)
