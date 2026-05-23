# THORChain Incentive Pendulum

Reference research for UltraFast whitepaper §10.4 (bonded-stake-to-custodied-value ratio), §10 (custody), §13 (validator economics), §14 (`2f+1` validator collusion), and §16 (open ratio decision).

---

## Part 1: How UltraFast uses the Incentive Pendulum concept

### Role in the UltraFast design

UltraFast custodies foreign-chain assets — BTC, ETH, USDC, SOL, Cosmos, EVM-L2 collateral — at threshold-signature vaults that require a `2f+1` stake-weighted quorum of the validator set to spend. This removes single-signer key control but, per §10 and §14, retains the assumption that a `2f+1` stake-weighted subset does not collude to drain those vaults.

§10.4 binds that assumption to an explicit economic invariant:

> Total bonded UFAST stake must be at least **2× total custodied value globally**, enforced by an on-chain deposit cap that throttles new inflows when bonded security is insufficient.

In other words: the protocol refuses new deposits whenever bonded UFAST drops below twice the marked-to-market value of every foreign-chain asset under TSS custody. The cap is global rather than per-vault, but the working assumption (§16) allows for a per-asset-class refinement.

### Why — the expected-value argument

A `2f+1` collusion that drained every vault would walk away with at most the total custodied value $V$. The colluding subset holds at least `2f+1` of total bonded stake $B$, all of which is slashable on identifiable abort (§10.1 protocol families produce attributable deviation evidence, §13.4 converts that evidence into on-chain slashing). With $B \geq 2V$, the slashable bond held by any `2f+1` subset strictly exceeds the loot:

$$
\text{stake at risk} \;\geq\; \tfrac{2}{3} B \;\geq\; \tfrac{2}{3} \cdot 2V \;=\; \tfrac{4}{3} V \;>\; V
$$

The attack is therefore not profitable in expectation under any rational-actor assumption. This is the direct application of THORChain's Incentive Pendulum logic to a multi-asset vault: the cryptographic safety bound of §14 says "honest `2f+1` cannot be overpowered by `<f+1` Byzantine"; the bond-to-custodied-value cap says "even a colluding `2f+1` loses money by trying". The two are complements, not substitutes — §10.6's Ethereum-corridor ZK light-client reinforces the first; the bond cap addresses the second.

### Open decisions and dependencies

§16 lists three live options for the ratio: static 2× (the working assumption, identical to THORChain's design target); static 3× (more conservative, more capital-inefficient); or dynamic by asset-class volatility (e.g. a higher multiplier on volatile altcoin collateral, lower on stablecoins). The choice depends on the §13.4 slashing schedule actually delivering full-bond slashing on TSS deviation evidence — if the schedule caps slash at a fraction of bond, the multiplier must scale inversely. Both are pre-implementation; both will be locked together rather than independently.

The cap also creates a UX surface: when bonded stake is insufficient, deposits queue. §10.4 names that throttling as the chosen failure mode. The alternative — accept deposits beyond the ratio — would invert the expected-value argument and is rejected.

---

## Part 2: THORChain's Incentive Pendulum in detail

### Origin and target ratio

THORChain went live on multi-chain chaosnet in April 2021 and has run continuously since. The Incentive Pendulum is an automated reward-rebalancing mechanism that drives the network toward a target ratio of **2 RUNE bonded by nodes for every 1 RUNE of asset value in liquidity pools**. This is also stated as a **67:33 split** of total RUNE supply between bonded RUNE (held by node operators as collateral) and pooled RUNE (paired against external assets in the AMM pools). The two framings are equivalent: at the 67:33 split, bonded RUNE has twice the market value of pooled RUNE, and because every pool is paired 50:50 RUNE-to-asset, bonded RUNE equals twice the non-RUNE asset value.

This is the target THORChain considers economically secure: a `2/3` Byzantine subset of nodes that colluded to drain the pools would steal at most `1x` of pool value while losing `2x` of bonded RUNE, so the attack is loss-making.

### How the pendulum mechanism works

THORChain emits a fixed block reward each block, split between three claimants: node operators, liquidity providers, and (early in protocol life) network reserves. The Incentive Pendulum dynamically reweights the node-vs-LP split:

- When **bonded RUNE / pooled RUNE > 2** (the network is "over-bonded" — too much security capital, not enough liquidity), the pendulum routes more reward to LPs to attract liquidity and let node operators rotate stake out.
- When **bonded RUNE / pooled RUNE < 2** (the network is "under-bonded" — pools have grown faster than security capital, attack becomes potentially profitable), the pendulum routes more reward to nodes. This raises the marginal node yield, pulling RUNE into bonds and pushing the ratio back toward 2:1.

The function is monotonic and continuous in the deviation from the target ratio rather than a step function, so the pendulum applies gentle pressure rather than discrete shocks. The dev docs describe it as a "self-balancing system" and confirm the 2:1 bond-to-stake target.

The other lever is the node admission queue. THORChain runs a churn cycle (historically every three days, later relaxed): the lowest-bonded active node is rotated out and the highest-bonded standby node is rotated in. As pool TVL grows, the marginal bond required to remain active rises, which is the supply-side complement to the demand-side reward rebalancing.

### The collusion-non-profitability math

For a coalition of `n` nodes holding total bond `B_c` to profitably steal pool value `V`:

$$
\text{gain} = V \cdot \frac{\text{coalition signing share}}{\text{total signing share}} - B_c \cdot \text{slashing fraction}
$$

THORChain's TSS requires `2/3` of nodes to sign vault transactions. The minimum colluding coalition therefore holds at least `2/3` of bond. With the pendulum holding total bond at `2V`, the minimum coalition's bond is `(2/3) × 2V = (4/3)V`. Steal `V`, lose `(4/3)V` to slashing — net `-V/3`. The Incentive Pendulum is the mechanism that keeps the `2V` invariant intact even as pool TVL grows and shrinks with market conditions.

### Documentation and primary sources

- THORChain main docs portal: `https://docs.thorchain.org/`
- Network security and governance: `https://docs.thorchain.org/network-security-governance`
- THORChain dev docs (economic model): `https://dev.thorchain.org/concepts/economic-model.html`
- RUNE economics: `https://docs.thorchain.org/understanding-thorchain/rune`
- THORChain University write-up: `https://thorchain-community.medium.com/under-the-hood-incentive-pendulums-b623e611d0c1` (formerly `thorchain-university.medium.com`)
- Original Bitcoin_Sage Medium post — URL `https://medium.com/thorchain/the-incentive-pendulum-848f3c3e4d1d` (returns HTTP 410 as of May 2026; cached versions reachable via archive.org).

### Implementation history and known limits

THORChain uses GG18/GG20 ECDSA TSS via Binance's `tss-lib`-derived implementation, plus its own Bifrost bridge service for chain-specific deposit detection and signing. The protocol has run on mainnet (multi-chain chaosnet, then "ChaosnetV2", then full mainnet) since April 2021. It suffered three major exploits in summer 2021 — June 29 (~$350K, fake-deposit), July 16 (~$8M, Bifrost contract override-loop), July 23 (~$8M, also Bifrost / router) — but all three were smart-contract or bridge-service bugs at the Ethereum-side router, not collusion attacks against the bonded-stake security model itself. The Incentive Pendulum invariant held during those incidents; the loss vector was orthogonal.

The GG20 dependency is the more pressing concern from UltraFast's perspective. The TSSHOCK class of attacks (Verichains, 2023) against `tss-lib` derivatives extracts the private key from a sufficient number of signing sessions, undetectably. §10.1 of the whitepaper explicitly excludes GG18/GG20 for new deployments and selects FROST/ROAST, DKLs23, and CGGMP21 — all post-TSSHOCK, all supporting identifiable abort, which is the precondition for the slashing schedule of §13.4 to bite. UltraFast inherits the economic argument but not the cryptographic substrate.

A more recent THORChain incident (May 2026, ~$10.8M drained across nine chains, ~13 hour bridge freeze) reportedly involved a malicious node operator rather than a smart-contract bug, but the public post-mortem analysis is still in flux and the relevance to the bonded-stake-vs-pooled-value invariant is unclear at the time of this writing.

### Comparable economic-security designs in other protocols

- **Chainflip** (live since 2024) — 150 validators bonding FLIP, FROST across BTC / ETH / SOL / Polkadot / Arbitrum vaults. Uses the same "bond > custodied value" logic but does not, as of available documentation, codify a fixed numeric multiplier the way THORChain does. Validator admission is auction-based; the protocol enforces that more bonded FLIP allows more vault TVL.
- **EigenLayer** (slashing live April 2025) — restaked ETH secures Actively Validated Services (AVSs). The same "cost of corruption > profit from corruption" invariant applies per-AVS, but the restaking-across-multiple-AVSs case creates a leverage problem: cumulative malicious gain across many AVSs can exceed slash-amount on a single stake. EigenLayer's 2024 slashing redesign attempted to close that gap by enforcing per-AVS commitments rather than fungible-stake aggregation.
- **MakerDAO / Sky** (collateralisation since 2017) — analogous in spirit but operates on borrower collateral against issued debt, not on validator bond against custodied user assets. The 150 %+ collateralisation ratios serve the same function (loss on liquidation > gain from default) but the agent and the asset relationship differ.
- **tBTC v2** (live since 2023) — operator-bonded BTC custody on Ethereum; bond requirements scale with custodied BTC value. Closer in structure to THORChain than to Chainflip; UltraFast's wallet-rotation model (§10.3) is directly modelled on tBTC v2.
- **Babylon** (BTC restaking, mainnet phase 2 in 2024) — bitcoin holders bond BTC via timelocked covenant scripts to secure PoS chains. Same expected-value logic, different slashing mechanism (covenant-enforced rather than on-chain accounting).

### Comparison of security postures

| Posture | Assumption | Failure mode |
|---|---|---|
| **Pure cryptographic** (e.g. ZK rollups, ZK light-client bridges) | Hard math holds; circuits are bug-free | A circuit bug or trusted-setup compromise breaks everything; no economic backstop |
| **Pure honest-majority** (most BFT consensus chains, validator-controlled bridges with no bond cap) | A supermajority of validators is honest | If the assumption breaks, the protocol loses all custodied value with no economic counterweight |
| **Pure economic** (e.g. plain restaking with no cryptographic threshold property) | Slashing exceeds any rational attack profit | Irrational attackers, oracle manipulation of slash conditions, or cross-AVS leverage collapse the argument |
| **Hybrid (UltraFast, THORChain, Chainflip)** | Threshold cryptography blocks `<f+1` Byzantine; bond cap blocks `2f+1` collusion | Both layers must be reasoned about; the system is no stronger than the weaker layer, but resistant to single-layer failures |

UltraFast positions itself in the hybrid row. The §10.6 Ethereum-corridor ZK light-client adds a fourth cryptographic layer specifically on the highest-value corridor; it does not protect against `2f+1` collusion at the policy layer (a colluding majority can still censor or front-run within the rules) — only the bond cap addresses that vector. §10.6 makes this distinction non-negotiable in marketing and audit communication.

### Limitations of the bonded-stake approach

1. **Valuation dependency.** Enforcing "bond ≥ 2× custodied value" requires the protocol to know the current value of every custodied asset. UltraFast's working assumption (§13.1, §16) is depth-thresholded fallback between the FBA clearing price and a stake-weighted validator-oracle median. An attacker who can manipulate the valuation feed can push the ratio off-target without touching the underlying bond or pool. The mitigation is multi-source pricing with bounded divergence and supermajority-only oracle parameter changes.
2. **Deposit-cap UX cost.** When bonded stake is insufficient, the protocol must refuse or queue deposits. This is a real friction point — users see "deposit unavailable" messages while the protocol waits for more UFAST to bond. THORChain accepts the same trade-off via the node admission queue.
3. **Bond-token / custodied-asset price correlation.** UFAST bond is denominated in UFAST; custodied value is denominated in USD-equivalents (BTC, ETH, USDC). If UFAST crashes faster than custodied assets — a likely correlation during a market-wide event — the ratio breaks before the deposit cap can throttle. THORChain has seen this dynamic: a sharp RUNE drawdown can mechanically violate the 2:1 invariant, and the pendulum then must work harder to restore equilibrium. Dynamic-by-asset-class ratios (the §16 third option) may help; a stablecoin-denominated bond would help more but contradicts the staking-asset design.
4. **Doesn't cover external risks.** The bond cap protects against `2f+1` insider collusion. It does not protect against bridge-contract bugs, oracle manipulation of derivatives pricing (separate from custody valuation), smart-contract vulnerabilities in the foreign-chain side, or compromise of an individual validator's TSS shard via an off-protocol key extraction (§13.4 names TSSHOCK-class attacks as undetectable until exploited, mitigated by library hygiene rather than slashing). THORChain's 2021 losses were of exactly this character — the pendulum was working, the bridge code had bugs.
5. **Slashing-execution dependency.** The argument assumes slashing actually executes on the full bond when collusion is detected. If §13.4 ends up capping slash at, say, 50 % of bond (a common pattern in PoS chains to limit cascading liquidation risk), the effective multiplier is halved and the working 2× ratio no longer dominates expected attack profit. The two parameters must be locked together.

### How UltraFast departs from THORChain

UltraFast inherits the economic argument and the working 2× multiplier. It departs from THORChain on three axes:

- **Cryptography.** GG18/GG20 out; FROST/ROAST + DKLs23 + CGGMP21 in. All three support identifiable abort, which is the precondition for slash on TSS deviation to be automated.
- **Custody scope.** THORChain custodies LP-paired assets in AMM pools. UltraFast custodies user collateral for derivatives, prediction markets, data-market settlement, and EVM gas — a single global vault per foreign chain, not per-asset-pool. The "2× total custodied value globally" framing reflects this consolidation.
- **Cryptographic complement.** §10.6 adds a ZK light-client bridge on the Ethereum corridor as an additional layer. THORChain does not have a comparable construction; its bond-and-TSS stack is the only line.

The numeric value of the multiplier (2× vs 3× vs dynamic) is open per §16 and will be set jointly with the slashing schedule of §13.4 rather than independently.

---

## Sources

- [RUNE | THORChain Docs](https://docs.thorchain.org/understanding-thorchain/rune)
- [Network Security and Governance | THORChain Docs](https://docs.thorchain.org/network-security-governance)
- [Economic Model | THORChain Dev Docs](https://dev.thorchain.org/concepts/economic-model.html)
- [Risks, Costs and Rewards | THORChain Docs](https://docs.thorchain.org/thornodes/overview/risks-costs-and-rewards)
- [Under the Hood: Incentive Pendulums | THORChain University (Medium)](https://thorchain-community.medium.com/under-the-hood-incentive-pendulums-b623e611d0c1)
- [The Incentive Pendulum | Bitcoin_Sage, THORChain Medium](https://medium.com/thorchain/the-incentive-pendulum-848f3c3e4d1d) (HTTP 410 as of May 2026; archive.org mirrors)
- [Explained: The THORChain Hack (July 2021) | Halborn](https://www.halborn.com/blog/post/explained-the-thorchain-hack-july-2021)
- [SlowMist: Analysis of Three Consecutive Attacks on THORChain | SlowMist](https://slowmist.medium.com/slowmist-analysis-of-three-consecutive-attacks-on-thorchain-6223f1c691be)
- [$10.8M Drained: Inside the THORChain Exploit | Crypto Times, May 2026](https://www.cryptotimes.io/2026/05/17/10-8-million-drained-inside-the-thorchain-exploit-that-froze-cross-chain-defi-for-13-hours/)
- [Chainflip Protocol Whitepaper (Harman, July 2023)](https://assets.chainflip.io/whitepaper.pdf)
- [Chainflip FROST Signature Scheme docs](https://docs.chainflip.io/protocol/frost-signature-scheme)
- [Chainflip Security & Governance docs](https://docs.chainflip.io/lending/economic)
- [EigenLayer Adds Key 'Slashing' Feature | CoinDesk, April 2025](https://www.coindesk.com/tech/2025/04/17/eigenlayer-adds-key-slashing-feature-completing-original-vision)
- [Introducing the EigenLayer Security Model | EigenCloud blog](https://blog.eigencloud.xyz/introducing-the-eigenlayer-security-model/)
- [#65 Introducing the EigenLayer Security Model | Stanford Blockchain Review](https://review.stanfordblockchain.xyz/p/65-introducing-the-eigenlayer-security)
