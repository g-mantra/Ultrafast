# UltraFast: An Economic Operating System for On-Chain Markets

The leading on-chain derivatives venue runs a closed-source matching engine, a public order book that anyone can front-run before inclusion, and a stake-weighted ECDSA multisig bridge controlled by roughly 16 to 25 team-operated validators. The market tolerates this because the alternative - a chain that matches a centralised exchange on speed without taking on those compromises - hasn't existed.

UltraFast is that chain.

## What UltraFast is

UltraFast is a Layer 1 blockchain that runs three workloads on one consensus and execution stack:

- **Derivatives.** Perpetual futures and scalar prediction markets on a single matching engine, with cross-product margin offsets recognised at the engine layer.
- **A native data sales market.** On-chain feeds, datasets, and oracle products, with one-shot, subscription, and per-query settlement built into the protocol.
- **General smart contracts.** Full Ethereum (EVM) compatibility for any program a developer wants to deploy alongside the venue.

One chain. Three lanes. Shared consensus, shared custody, shared economics. The right mental model isn't a single-purpose venue; it's an operating system. Scheduling, settlement, and custody handled once, used by many workloads on top.

## Sub-second finality without the usual compromises

The first question institutional traders ask about a venue is latency. UltraFast targets 200 milliseconds median block finality, 300 milliseconds at the 99th percentile, under happy-path conditions. Hyperliquid currently delivers around 70 milliseconds. UltraFast sits about 130 milliseconds above that.

That gap is deliberate. UltraFast trades it for properties Hyperliquid doesn't offer: an open validator set, an open-source matching engine, MEV resistance built into the protocol rather than promised at the wallet layer, and a bridge that doesn't depend on a small set of team-controlled signers. The trade is explicit. The litepaper isn't the place to hide it.

The latency target rests on a composition of four ideas, each already running in production somewhere:

- **Threshold Simplex consensus** finalises blocks with a single small signature per round. Minimmit, a fast-path variant, collapses that to one round when at least four-fifths of validators are honest, which is the design assumption for the curated launch set.
- **Parallel execution** via Block-STM. Multiple transactions inside a block run at the same time; the runtime detects conflicts and re-runs them in dependency order.
- **Aggregator primitives** for the few storage slots that always conflict - funding accumulators, fee counters, the insurance fund. They turn fights into commutative math so the parallel executor doesn't fall back to sequential under contention.
- **Speculative execution.** The execution layer starts running a block before consensus has finalised it. If consensus rejects the block, the speculative state is discarded deterministically.

None of these are new on their own. Combining them with an in-protocol auction matcher and a write-optimised state database is what's new.

## MEV resistance by construction, not by promise

MEV - the value extracted by reordering, front-running, or sandwiching user transactions - has been a structural tax on DeFi users since the first DEX shipped. Most venues treat it as a tax to be split with searchers, or claim to fix it without naming what remains.

UltraFast handles MEV in three layers, applied in a fixed order:

1. **Multi-concurrent proposers.** Instead of one validator deciding which transactions enter a block, approximately 16 validators each assemble candidate transaction slices in parallel. Censoring an attested slice produces a structurally invalid block. Enforcement is architectural, not slashing-based. This layer ships at version 1.1, not at launch; the whitepaper says so, and so does this litepaper.

2. **Frequent batch auctions.** Every 100 milliseconds, all orders for a given market clear at a single uniform price, with pro-rata fills at the marginal level. There's no "first in line" within a tick. A sandwich attack inside the batch is mathematically meaningless because reordering doesn't change the clearing price or the fills.

3. **Tokenised ordering** for the few paths that necessarily bypass the batch - administrative transactions, governance executions, cross-chain message handlers.

What this doesn't eliminate, and what the whitepaper names explicitly: arbitrage between batches, cross-chain price differences when an asset trades on multiple venues, and the window between oracle updates and consequent liquidations. These are properties of efficient multi-venue markets, not exploits of a single chain.

## Real yield, paid in Bitcoin

UltraFast charges fees on trades, data-market subscriptions, market listings, and EVM gas. The protocol unit of account is Bitcoin. All fees - whether the trader pays in USDC, ETH, MANTRA, or any other supported collateral - swap to real BTC at collection and route in full to stakers.

This part of the design is worth dwelling on. Most chains pay yield in their own token, with fees funding continuous buybacks. The mechanism is reflexive: when volume drops, fewer tokens get bought back, the price falls, the security budget shrinks - exactly when markets are stressed and the chain needs its security budget most. UltraFast pays yield in the most universally priced asset in crypto. Validator economics are linear in volume, orthogonal to the price cycle of UltraFast's own token.

The swap from a non-BTC fee receipt to BTC runs through on-chain constant-product AMM pools - the xy = k mechanism Uniswap pioneered. LPs supply liquidity to each supported token / BTC pair, earn the pool fee, and absorb the inventory shift. Pricing comes from pool ratios, not from an external oracle, because a swap needs an actual counterparty rather than just a price quote. The result: the BTC represented on UltraFast is held 1:1 against the BTC sitting in the validator-operated Bitcoin vault at all times. No fractional reserve. No rehypothecation.

A user holding BTC on UltraFast can withdraw to the Bitcoin chain at any time. The on-chain balance burns, validators (or signing proxies they've authorised) produce threshold signatures over a Bitcoin transaction paying the destination address, and the user covers the Bitcoin network fee - sats per byte at current mempool conditions. No allow-list. No "withdrawal review." Backing without redemption is a claim, not custody.

## A bridge that doesn't depend on a handful of operators

Wrapped-token and multisig bridges have been the source of the largest exploits in DeFi's history. UltraFast skips both. Every supported chain's deposit vault is jointly controlled by the validator set via a threshold signature scheme. Spending requires a stake-weighted quorum of validators to each contribute a partial signature. No single validator, and no minority subset, ever holds a usable key.

Stake-weighting holds at the cryptographic layer, not just at the accountability layer. A validator with twice the stake controls twice the share of the cryptographic key. The economic complement is a hard cap: total bonded UFAST stake must remain at least twice the total custodied value globally. A stake-majority collusion to drain a vault is unprofitable in expectation because the slashable bond is larger than the loot.

For the Ethereum corridor, which carries the largest stablecoin flow, a zero-knowledge light client runs alongside the threshold-signature vault. It proves UltraFast's state transitions on Ethereum, and Ethereum's sync-committee state on UltraFast, replacing stake-bonded trust with cryptographic finality on the highest-value corridor. The whitepaper says exactly what this buys (Ethereum-side certainty that the validators ran the rules) and what it doesn't (it does not replace the bonded-to-custody cap; a colluding majority can still censor or front-run, just not silently deviate).

## One stack, three workloads

The derivatives lane sets the latency budget. The same chain runs two other workloads at launch.

The data sales market lets on-chain producers (oracles, index providers, statistical-arbitrage feeds, RWA reference rates, computed risk metrics) charge for access without bilateral off-chain agreements. Producers register a `DataProduct` contract, declare schema and access tiers, and post a stake bond slashable for misrepresentation. Buyers pay in any supported collateral, the fee swaps to BTC, and the protocol takes a governance-set share that flows to stakers in the same path as trading fees. Three privacy tiers are supported: public on-chain delivery, encrypted-to-buyer delivery, and off-chain delivery gated by on-chain entitlement.

The EVM lane runs arbitrary user programs under standard gas-metered transactions. Vaults, lending markets, structured products, liquidation bots, and builder-deployed perpetual markets all live here. The matching engine and the data marketplace are exposed to general programs through fixed system-contract ABIs, so an EVM contract can read order-book state in the same call frame it triggers a rebalance, instead of marshalling state across a boundary it doesn't control.

## What still has to be proven

UltraFast is in the architecture and research phase at the time of this litepaper. The whitepaper distinguishes design targets from measured results, tabulates every component's production-readiness status, and lists the open design decisions still under evaluation. The litepaper inherits that discipline.

Phase 0 is the gate. A four-validator walking-skeleton testnet, running a single Bitcoin-collateralised inverse perpetual, exercises the four highest-risk integrations end-to-end: FROST threshold signatures for Bitcoin Taproot deposits and withdrawals, Threshold Simplex driving reth via the Engine API, the in-protocol auction matcher as an EVM system contract, and the write-optimised state database underneath. Two exit criteria: 95th-percentile end-to-end fill latency under 300 milliseconds on the two-region setup, and under 600 milliseconds under the four-jurisdiction fallback. Failure on either threshold points to the specific layer over budget before any product code commits.

This is the section most marketing documents skip. Reads of decentralised infrastructure that paper over what's open earn distrust from the audiences that matter most.

## What the chain isn't

- **Not a token launch.** UFAST exists for staking, bonding, and governance. Real yield is paid to stakers in BTC, not in UFAST buybacks. Governance can layer a buyback module on top later; the reverse migration would be governance-fraught.
- **Not a single-product venue.** Derivatives, the data market, and the general EVM lane all run on the same stack from day one.
- **Not "trustless."** Every trust assumption in the design is named: the consensus safety bound, the `2f+1` stake-weighted custody quorum, the oracle committee for subjective-event resolution. The word "trustless" does not appear in the whitepaper. It doesn't belong in the litepaper either.

## Why this matters now

On-chain derivatives have reached the point where the next round of capital won't accept the trust compromises baked into the current leaders. Institutional market makers want open code and a real bridge. Sophisticated retail wants MEV protection without giving up self-custody. Builders want one programmable substrate, not a separate venue for each product.

UltraFast composes already-validated primitives - Threshold Simplex, Minimmit, reth, Block-STM, frequent batch auctions, FROST, ZK light clients - into the integrated venue this market needs. None of the pieces are speculative. The composition is what's new. Phase 0 is what proves it.

## Read the whitepaper

This litepaper is the executive summary. The whitepaper covers the consensus mechanics, the matching engine, the custody scheme, the validator economics, and the open design decisions in the detail required to evaluate the architecture seriously. Every claim in this document is sourced from there.
