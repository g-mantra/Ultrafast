# Axelar Square-Root-of-Stake Voting

Reference research for UltraFast whitepaper §13.5 (anti-concentration), §10.4 (bond-to-custody ratio), §14 (`2f+1` validator collusion against the bridge), and §16 (open bridge-anti-concentration decision).

---

## Part 1: How UltraFast considers Axelar's sqrt voting pattern, and why

### Role in the UltraFast design

§13.5 of the whitepaper lists three anti-concentration measures over the validator set. Two — a 5 % minimum validator commission (the dYdX-v4 [38] precedent) and a non-trivial self-stake minimum (target 1 % of validator-set median) — apply uniformly across consensus, the order lane, the EVM lane, and the bridge. The third applies *only* to bridge security:

> Bridge-specific anti-concentration: a square-root-of-stake voting weight in TSS signing (Axelar pattern [39]) is under consideration to reduce stake-concentration attacks against the bridge specifically without altering consensus weighting. This is open in §16.

This is deliberately scoped narrowly. UltraFast's consensus, slashing, and fee-distribution mechanics already assume stake-weighted partials in Threshold Simplex (§5.3, §5.1). Replacing stake-weighting at the consensus layer would interact with the `f < n/3` safety bound, the slashing schedule of §13.4, and the BTC-denominated reward distribution of §13.1 in ways the rest of the document is not specified for. The Axelar pattern is therefore not proposed as a consensus change — it is proposed as a separate, bridge-layer weight applied when the TSS quorum is assembled for a foreign-chain withdrawal.

### Why bridge-only

The `2f+1` bridge-collusion attack of §14 is what this lever addresses. The bond-to-custody cap of §10.4 makes that attack unprofitable in expectation at the *whole-set* level: bonded UFAST is held at ≥ 2× custodied value, so a colluding `2f+1` subset loses more bond than it gains in loot. But the cap is a global invariant, not a per-validator constraint. A small number of large stakers — even a single staker who controls multiple validator entities — that together cross the `2f+1` threshold is the relevant concentration vector. The §16 working assumption of a foundation-curated 30-validator set at v1 makes this concrete: at 30 validators, two or three stake-heavy entities are inside the `2f+1` quorum by themselves.

Square-root weighting flattens the quorum without changing the bond cap or the slashing schedule. A validator doubling its bonded stake gains only `√2 ≈ 1.41×` of bridge-signing weight rather than `2×`. To dominate the quorum, a single staker must split across many validator identities, each of which now must run real cross-chain infrastructure (BTC, Ethereum, Solana, Cosmos light clients; see §10.5–§10.6) and pass the self-stake-minimum gate of §13.5. The combination forces concentration to be expensive in operational cost rather than just in capital — which is precisely the property the bridge needs and the consensus does not.

### Status

Under consideration, listed as an open decision in §16. Pre-implementation. The decision interacts with two others: the validator-set admission model (foundation-curated 30 with milestone path, §13.3) and the TSS protocol selection (FROST/ROAST + DKLs23 mixed, §10.1). FROST and DKLs23 both support non-uniform participant weights natively, so the cryptographic substrate does not block the lever. The decision is principally a policy and accounting one: how to compute the per-validator weight, how often to recompute it (per epoch vs per signing session), and how to reconcile it with the §10.4 bond cap that is denominated in raw stake, not in sqrt-of-stake.

---

## Part 2: Axelar's quadratic voting / sqrt-of-stake in detail

### Origin: the Maeve upgrade

Axelar shipped square-root-of-stake voting weight on 29 August 2022 as part of a mainnet upgrade code-named **Maeve** (after the Westworld character). The Axelar team has consistently described the mechanism as "quadratic voting" in marketing materials, though the precise structure is square-root-of-stake voting weight applied to the TSS signing layer; the "quadratic" framing comes from the inverse relationship (a validator needs `k²` shares to cast `k` votes).

The pattern was novel for live cross-chain infrastructure at the time. Quadratic voting was widely discussed in the broader crypto ecosystem after Glen Weyl's *Quadratic Voting* (2017) and Vitalik Buterin's writings on quadratic funding, but Axelar was the first major bridge protocol to ship it in production for cross-chain message authorisation. The Axelar blog announcement positions this as an explicit anti-concentration measure for delegated proof-of-stake bridge security.

### The mechanism

Each validator's bridge-signing weight is computed as:

$$
w_i = \sqrt{s_i}
$$

where $s_i$ is the AXL stake delegated to validator $i$ (including the validator's own self-stake). The signature weight a validator contributes to a TSS multi-party signing session is proportional to $w_i$, not to $s_i$.

The illustrative table the Axelar documentation and blog use:

| Shares delegated | Votes cast |
|---:|---:|
| 1 | 1 |
| 4 | 2 |
| 9 | 3 |
| 16 | 4 |
| 100 | 10 |
| 10 000 | 100 |

So a validator with `100×` the stake of another has only `10×` the bridge-signing weight. The marginal cost of voting power rises linearly in voting power itself: the second vote costs `3` additional shares (`4 − 1`), the third costs `5` (`9 − 4`), the tenth costs `19` (`100 − 81`). Concentrating stake in a single validator becomes progressively more expensive in bridge-influence-per-stake-unit.

### Where the mechanism applies — and where it does not

This is the critical scoping that UltraFast borrows. Axelar applies square-root weighting only to the **cross-chain layer**:

- Voting on external-chain events (poll-based "did this transaction happen on Ethereum?" votes that gate inbound cross-chain messages).
- TSS signing weight for outbound cross-chain messages — the threshold-signature quorum that authorises a withdrawal or a GMP (General Message Passing) call on a destination chain.

The underlying Tendermint consensus on the Axelar chain itself continues to run on standard linear stake weighting (`1 token = 1 vote`) for block production, validator rewards, and on-chain governance proposals. Axelar's Maeve upgrade did not change consensus weighting — exactly the separation UltraFast's §13.5 mirrors.

### Thresholds and validator set

Axelar's active validator set is the top 75 by bonded AXL, an on-chain governance parameter. Cross-chain event verification (poll voting) requires roughly **67 % of total quadratic voting power** to confirm an event. Outbound cross-chain messages are TSS-signed by a quorum whose sqrt-weighted weight crosses **60 %** of the total sqrt-weight, with additional gating that 60 % of validators by sqrt-weight must run a node for any newly-added external chain before that chain becomes supported.

So the actual production setup is two-layer:
1. **Inbound (event observation).** Validators vote yes/no on whether an event was observed on the foreign chain; ~67 % of quadratic weight required.
2. **Outbound (signing).** Validators jointly produce a TSS signature on a batch of outbound commands; the signing weight per participant is the validator's quadratic weight, and the threshold is ~60 % of total sqrt-weight.

Both layers use the same sqrt-of-stake weight function.

### Cryptographic substrate

Axelar implemented its threshold cryptography in **tofn**, a Rust library that implements GG20 (Gennaro-Goldfeder 2020) ECDSA-TSS. GG20 supports weighted signing via the standard Shamir-secret-sharing-with-replicated-shares construction: a validator with sqrt-weight `w_i` is allocated `w_i` shares, and the TSS protocol treats each share as an independent signing participant.

This is relevant to the UltraFast §10.1 selection because UltraFast deliberately excludes GG18/GG20 (the TSSHOCK class of attacks against `tss-lib`-derived implementations is non-trivial; see /Users/g/git/mantra/ultrafast/deep_research/cggmp21.md and the dkls23 file for the substitutes). The sqrt-weight idea is portable to FROST/ROAST and DKLs23 — both support weighted participants natively — so adopting the Axelar pattern does not force UltraFast to inherit Axelar's cryptography.

### Comparison to related ideas

| Mechanism | Domain | Function | Distinguishing property |
|---|---|---|---|
| **Axelar sqrt-of-stake** | Cross-chain TSS signing | $w_i = \sqrt{s_i}$ on the bridge layer | Stake-weighted but flattened; consensus unaffected |
| **Glen Weyl quadratic voting** [Weyl, 2017] | Governance vote-buying with credits | Vote cost grows quadratically in votes cast | Per-issue credit budget, not stake-weight |
| **Gitcoin quadratic funding** | Public-goods matching | Match-fund grows with $(\sum \sqrt{c_i})^2$ over contributors | Optimises for breadth-of-support, not security |
| **Optimism RetroPGF quadratic scoring** | Retroactive funding allocation | Sqrt-weighted voter influence | Off-chain governance, not security-critical |
| **Conviction voting (Aragon, 1Hive)** | DAO funding decisions | Vote weight grows over time as conviction held | Time-as-resource, not stake-flattening |
| **Standard 1-stake-1-vote** | Most BFT consensus, most bridges (THORChain, Chainflip) | $w_i = s_i$ | Maximum concentration risk |
| **1-validator-1-vote** | CometBFT count-quorums, UltraFast §5.3 stake-weighting workaround | $w_i = 1$ | Maximum sybil exposure |
| **Bond-to-custody cap** | UltraFast §10.4, THORChain Incentive Pendulum | Global invariant: bond ≥ 2× custody | Set-level, not per-validator |

Sqrt-of-stake sits between `1-stake-1-vote` (full plutocracy) and `1-validator-1-vote` (full sybil exposure). It is the only one of the seven that explicitly flattens concentration *within* a stake-weighted system rather than abandoning stake-weighting entirely.

The Weyl framing of quadratic voting and the Axelar framing of square-root-of-stake voting weight are distinct enough to be worth disambiguating in any UltraFast-facing marketing or audit material. Axelar's mechanism uses sqrt to compute *passive* voting weight from a standing stake; Weyl's uses quadratic cost to charge for *active* vote-credit expenditure on individual issues. They share the algebraic form but solve different problems.

### Production track record

Axelar has run square-root TSS weighting in production since Maeve (Aug 2022). The protocol has secured ~40 connected chains and survived several large-scale stress incidents (multiple validator outages, congested cross-chain queues during 2023–2024 NFT mints and Cosmos-EVM bridge surges) without a known sqrt-weight-induced governance or signing failure. The TSS-cryptography layer (GG20-via-tofn) has needed maintenance for TSSHOCK-class hardening, but that is a cryptographic-substrate issue, not a weighting-mechanism issue.

The mechanism is therefore production-evidenced for the specific question UltraFast cares about: "Does sqrt-of-stake weighting on the bridge layer, separate from consensus weighting, actually work for cross-chain message authorisation at scale?" The answer from Axelar's three-and-a-half-year mainnet run is: yes, the construction is operationally stable.

### Limitations

1. **Sybil resistance via stake-splitting.** The single most-cited critique. A staker with bond `S` running a single validator gets weight `√S`. Splitting bond across `k` validators yields total weight `k · √(S/k) = √k · √S`. The attacker gains a `√k` multiplier on voting power for free, as far as the weighting function is concerned.

   Axelar's countermeasure is operational rather than algebraic: each validator must run live infrastructure (full nodes for each connected external chain, RPC endpoints, TSS-signing daemons, hardware-secured key shares), and that operational cost is real and per-validator. The marginal cost of running `k` validators is approximately `k×` the marginal cost of one. Beyond a small multiplier the cost line crosses the `√k` voting-power gain line.

   This argument depends on the per-validator operational cost being non-trivial relative to per-stake-unit yield. For UltraFast — where validators run reth + Block-STM + QMDB + an order-lane matcher + cross-chain light-client watchers + TSS daemons for multiple regimes (FROST, DKLs23, CGGMP21) — that cost is much higher than for a vanilla Tendermint validator, so the sybil-splitting defence is *stronger* under UltraFast's stack than under Axelar's.

   The self-stake minimum of §13.5 (target 1 % of validator-set median) is the second layer of the same defence: it imposes a per-validator capital threshold that compounds with the per-validator operational cost.

2. **Stake-pooling via off-chain coordination.** Two legally distinct validator entities controlled by the same beneficial owner cannot be distinguished from two independent validators by the protocol. Sqrt-weighting does nothing to prevent this. The mitigation is identification and slashing of co-ordinated behaviour (equivocation patterns, identifiable-abort evidence in §10.1/§13.4) rather than algebraic.

3. **Doesn't address `2f+1` collusion at the set level.** A coordinated coalition that crosses the sqrt-weight threshold can still authorise a malicious withdrawal. The bond-to-custody cap of §10.4 is what addresses that vector economically; sqrt-weighting only changes *who* is in the coalition, not whether the coalition can act.

4. **Doesn't change consensus safety / liveness bounds.** Because UltraFast applies the lever only on the bridge layer, the standard Threshold Simplex `f < n/3` bound is unaffected. This is the design intent, not a limitation, but worth naming explicitly in audit communication.

5. **Recomputation cadence.** If sqrt-weights are recomputed every signing session, the protocol must read live stake state from consensus into the bridge layer at signing time, which adds a data dependency. If recomputed per epoch, there is a window in which the bridge weights are stale relative to current stake. Axelar updates per epoch; UltraFast's choice is open.

### Net trade-off

Sqrt-of-stake on the bridge layer:
- **Flattens concentration of bridge-signing influence** without abandoning stake-weighted economics. A `100×` stake holder gets `10×` the bridge weight, not `100×`.
- **Lowers worst-case influence of any single validator** within the `2f+1` quorum.
- **Does not eliminate validator-set capture** by a coordinated coalition; complements rather than replaces the §10.4 bond-to-custody cap.
- **Adds operational complexity** in the form of two stake-weight functions live on the same chain (linear for consensus, sqrt for bridge).
- **Is production-evidenced** at Axelar since August 2022.

For UltraFast specifically, the lever is well-matched to the §16 working-assumption of a foundation-curated 30-validator set: the small set is precisely the regime where one or two stake-heavy entities dominate the bridge quorum under linear weighting, and the regime where sqrt-weighting buys the most marginal anti-concentration. As the set scales toward the longer-run target, the marginal benefit decreases (the law of large numbers smooths concentration), and the lever may become redundant relative to bond-to-custody cap economics alone. The cost of the lever is bridge-layer-only complexity; the benefit is principally relevant in the early phases when the set is small. This makes it a candidate that is "on" by default at v1 and reviewed for retention as the set grows — but the decision remains open per §16.

---

## Sources

- [Axelar Security Overview | Axelar Docs](https://docs.axelar.dev/learn/security/)
- [Axelar Implements Quadratic Voting With 'Maeve' Upgrade | Axelar Blog](https://www.axelar.network/blog/axelar-implements-quadratic-voting-with-maeve-upgrade)
- [Axelar Adds Quadratic Voting to Bolster Cross-Chain Security | Business Wire, 6 Sep 2022](https://www.businesswire.com/news/home/20220906005342/en/Axelar-Adds-Quadratic-Voting-to-Bolster-Cross-Chain-Security)
- [Axelar Validator Setup Overview | Axelar Docs](https://docs.axelar.dev/validator/setup/overview/)
- [Axelarscan Validator Explorer](https://axelarscan.io/validators)
- [Axelar — A Deep Dive | Arjun Chand, LI.FI Blog](https://blog.li.fi/axelar-a-deep-dive-5b11f5f77d66)
- [Axelar Protocol Explained | Multi-chain Talk (Medium)](https://medium.com/multi-chaintalk/axelar-protocol-explained-e1c353525842)
- [Guide to Axelar | Coinbase Developer Platform](https://www.coinbase.com/developer-platform/discover/protocol-guides/guide-to-axelar)
- [Understanding Axelar: A Comprehensive Overview | Messari](https://messari.io/report/understanding-axelar-a-comprehensive-overview)
- [What Does Axelar Do | Eco Support](https://eco.com/support/en/articles/11855161-what-does-axelar-do-complete-guide-to-cross-chain-interoperability)
- [Axelar Network: How to Choose a Trustworthy Validator | Everstake](https://everstake.one/blog/axelar-network-how-to-shoose-a-trustworthy-validator)
- [Introduction to Axelar Network | Stakin](https://stakin.com/blog/introduction-to-axelar-network)
- [TSSHOCK: New Key Extraction Attacks on TSS | Verichains](https://verichains.io/tsshock/)
- [tss-lib (GG18/GG20 ECDSA) | bnb-chain/tss-lib](https://github.com/bnb-chain/tss-lib)
- [awesome-tss curated index | ZenGo-X](https://github.com/ZenGo-X/awesome-tss)
