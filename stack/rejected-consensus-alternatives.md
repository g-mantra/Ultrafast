# Rejected Consensus Alternatives

Research notes on the three families of BFT consensus protocols explicitly rejected by UltraFast in whitepaper §5.5 - HotStuff variants, CometBFT, and DAG protocols (Narwhal/Bullshark/Mysticeti) - together with the positive choice of Threshold Simplex plus Minimmit. Compiled for internal use during the pre-implementation research phase.

---

## Part 1: How UltraFast considers and rejects these alternatives and why

§5.5 of the whitepaper is a single dense paragraph that names three rejections and one positive selection. Each rejection lines up against a specific UltraFast architectural commitment that the rejected protocol would force the design to surrender.

**HotStuff variants [19, 20] - rejected on pessimistic-leader latency.** The original Simplex paper [1] published a head-to-head comparison of pessimistic-leader latency across leading partially-synchronous BFT protocols. It reported Simplex at roughly $3\delta$ versus HotStuff at roughly $7\delta$ on the same network - the approximately six-fold pessimistic gap §5.5 cites. UltraFast's §12 performance argument depends on a pessimistic floor near 400 ms and a happy-path p50 near 200 ms (§12.1). Paying HotStuff's silent-leader penalty would push the pessimistic floor into the seconds and break the latency budget that makes the venue plausible against Hyperliquid (§15).

**CometBFT - rejected on lifecycle-layer interference.** CometBFT's ABCI 2.0 `PrepareProposal` / `ProcessProposal` lifecycle binds transaction processing into the consensus tick. The proposer pre-executes the block at `PrepareProposal`, each validator re-executes it at `ProcessProposal`, and the candidate-state machine cannot diverge from that pattern. UltraFast's FBA matching (§7) clears at a fixed tick boundary that is decoupled from validator-set proposer rotation. The MCP layer (§8.1, v1.1) assembles partial slices ("pslices") from concurrent proposers. Neither model composes with CometBFT's single-proposer-with-pre-execution lifecycle without forking the consensus engine. A second concern reinforces the rejection. The Cosmos-EVM bug class catalogued in GHSA-mjfq-3qr2-6g84 [12] (CVSS 8.3, published 13 May 2025) previously affected Evmos and shows the audit-surface cost of running EVM execution as a Cosmos SDK module. UltraFast drives reth via the Engine API (§6.1) specifically to avoid that class.

**DAG protocols (Narwhal / Bullshark / Mysticeti [21, 21b, 22]) - rejected on two grounds: the latency-versus-throughput trade-off, and intra-block ordering.** DAG protocols trade three- to six-fold latency for throughput gains UltraFast does not need at v1 scale. The venue's throughput target is set by the FBA tick (one matching event per tick on a few hot markets), not by raw transactions per second. The more decisive objection is that DAG protocols sacrifice deterministic intra-block ordering. Within a committed DAG cut, ordering of transactions across uncommitted-then-committed certificates is non-deterministic up to the commit rule. A CLOB whose fairness story rests on tick-boundary semantics (§7.1) cannot tolerate that.

**The positive choice: Threshold Simplex [1] + Minimmit [2].** Threshold Simplex provides the safety floor at $f < n/3$ with a constant-size BLS12-381 threshold certificate (~240 bytes, $O(1)$ verification). Minimmit layers a single-round fast path on top, finalising in one round when $f < n/5$ - the regime the curated $n = 30$ v1 set occupies by construction (§5.2). The protocol retains leader-based view-by-view ordering, which composes cleanly with FBA's tick model and with MCP pslice assembly.

---

## Part 2: Deep research on the rejected alternatives

### HotStuff family

**Foundational papers.**

- Yin, M., Malkhi, D., Reiter, M. K., Golan Gueta, G., and Abraham, I. "HotStuff: BFT Consensus with Linearity and Responsiveness." ACM PODC 2019. Preprint arXiv:1803.05069. The paper that established the three-phase pipelined commit and linear $O(n)$ per-view communication that the subsequent BFT literature took as a baseline.
- Malkhi, D. and Nayak, K. "HotStuff-2: Optimal Two-Phase Responsive BFT." IACR Cryptology ePrint 2023/397. Demonstrates that a two-phase variant can simultaneously achieve $O(n^2)$ worst-case communication, optimistically linear communication, two-phase commit within a view, and optimistic responsiveness - properties that the original three-phase HotStuff did not jointly attain.
- Gelashvili, R., Spiegelman, A. et al. "Jolteon and Ditto: Network-Adaptive Efficient Consensus with Asynchronous Fallback." arXiv:2106.10362 (June 2021). Introduces the PaceMaker view-synchronisation mechanism and a 2-chain commit rule that reduces the original HotStuff's commit latency by roughly 50 % in the happy path.

**Mechanism summary.** Three-phase pipelined commit (prepare → pre-commit → commit) with quorum certificates threaded across views. Each view is led by a rotating leader. Safety holds with $f < n/3$. Linearity gives $O(n)$ communication per phase under an honest leader. Responsiveness lets a correct leader drive the protocol at network speed rather than at a worst-case timeout. The pessimistic-leader case, when the leader is silent or equivocates, pays multiple timeout rounds before view change completes. That is the regime the Simplex comparison pins at $\sim 7\delta$.

**Production deployments.**

- **Diem / Aptos** - AptosBFT v4 is the production deployment, descending from DiemBFT v4, which is the Jolteon variant of HotStuff. Aptos also runs Quorum Store (a Narwhal-style data-dissemination pre-step, AIP-26) underneath Jolteon to decouple data availability from consensus. Portions of the stack have migrated toward Bullshark via the Shoal / Shoal++ improvements (Aptos Labs, 2023–2024).
- **Flow (Dapper Labs)** - `onflow/flow-go` runs a HotStuff implementation, and Flow's engineering blog "Jolteon: Advancing Flow's consensus algorithm" describes the migration to Jolteon as the active-PaceMaker upgrade.
- **ThunderCore** - runs PaLa, a pipelined-BFT variant in the HotStuff family using BLS multi-signatures and a hub-and-spoke topology.
- **Cypherium, Concord (VMware), Espresso (early designs)** - additional production or near-production HotStuff descendants.

**Why pessimistic-leader latency is the binding constraint for UltraFast.** The §12 latency targets are quoted as p50 happy-path and p95 pessimistic-floor numbers. A pessimistic floor that absorbs $\sim 7\delta$ instead of $\sim 3\delta$ degrades the worst case from ~400 ms to ~1 s on the same network. That is enough for an order-flow venue facing Hyperliquid to lose its primary differentiator. The Simplex comparison [1] is the citation §5.5 leans on. HotStuff-2's two-phase optimisation closes part of the gap but does not eliminate it, because the worst-case silent-leader round still dominates.

### CometBFT (formerly Tendermint Core)

**History.** CometBFT is a fork of and successor to Tendermint Core, stewarded by Informal Systems in collaboration with Cosmos stakeholders. The rename happened in early 2023 (Interchain Foundation announcement). The engine now powers the Interchain Stack: Cosmos Hub, Osmosis, Injective, dYdX v4 (only the top 60 validators by stake participate in consensus, per the dYdX v4 docs), Sei v1, Celestia, Axelar, Oasis, Penumbra, and many other application chains. The two-phase commit (pre-vote, pre-commit) with $f < n/3$ safety is unchanged from Tendermint.

**ABCI 2.0 lifecycle.** ABCI 2.0 (introduced via CometBFT v0.37 / v0.38, ~2023) allows the application to intervene at three new points in consensus execution:

1. `PrepareProposal` - the proposer performs application-dependent work to assemble the block (tx ordering, batching, pre-execution).
2. `ProcessProposal` - every validator performs application-dependent work to validate the proposed block, optionally rejecting invalid blocks.
3. `ExtendVote` / `VerifyVoteExtension` - applications can attach additional data to pre-commit votes (used by e.g. dYdX v4 for orderbook gossip).

`FinalizeBlock` and `Commit` follow, replacing the older `BeginBlock` / `DeliverTx` / `EndBlock` triad. In immediate-execution applications, the candidate state produced during `PrepareProposal` / `ProcessProposal` cannot replace the previous state until `FinalizeBlock` confirms the block was decided.

**Why this fights UltraFast.** Two structural issues, each individually sufficient.

1. **FBA tick semantics.** FBA clears at a fixed tick boundary (§7.1). Orders within a tick form a uniform-price batch and order arrival within a tick is intentionally treated as simultaneous. CometBFT's `ProcessProposal` model presupposes that the proposer linearly orders the block before validators see it. The lifecycle is built around a sequential transaction stream within a block, not a tick-boundary batch. Forcing FBA into that mould would require a fork-and-rewrite of the consensus engine, at which point the substrate offers no advantage over a greenfield Rust implementation on Commonware.
2. **MCP pslice assembly.** §8.1's v1.1 Multi-Concurrent-Proposer layer assembles partial slices ("pslices") from multiple concurrent proposers. The design follows the Anza / Solana Constellation pattern [8] and the Garimidi / Neu / Resnick formal treatment [9]. CometBFT's single-proposer-per-view model cannot accept multiple concurrent block proposers without a deep protocol change.

**The Cosmos-EVM bug class (GHSA-mjfq-3qr2-6g84).** Published 13 May 2025; CVSS 8.3 (High); affects `cosmos/evm` v0.1.0 and above. The advisory reports that setting lower EVM call gas allowed users to partially execute precompiles and error at specific points in the precompile code without reverting the partially written state. Concretely, this could cause distribution-precompile claims to transfer funds without resetting claimable rewards to zero, and it could halt validators by causing indeterministic execution. The patch wrapped each precompile execution in an atomic function that reverts partially committed state on error. The same bug class previously affected Evmos (CVE-2024-32644, GHSA-3fp5-2xwh-fxm6, "Transaction execution not accounting for all state transition after interaction with precompiles"). UltraFast runs reth as a standalone execution client driven through the Engine API (§6.1) rather than embedding EVM as a Cosmos SDK module. The audit-surface reduction against that bug class is the explicit motivation.

### DAG protocols

**Foundational papers.**

- Danezis, G., Kokoris-Kogias, L., Sonnino, A., and Spiegelman, A. "Narwhal and Tusk: A DAG-Based Mempool and Efficient BFT Consensus." EuroSys 2022 (Proceedings of the 17th European Conference on Computer Systems, pp. 34–50, DOI: 10.1145/3492321.3519594; arXiv:2105.11827). Narwhal decouples data dissemination (a DAG of batch certificates) from consensus ordering; Tusk is the asynchronous ordering protocol layered on top.
- Spiegelman, A., Giridharan, N., Sonnino, A., and Kokoris-Kogias, L. "Bullshark: DAG BFT Protocols Made Practical." ACM CCS 2022 (DOI: 10.1145/3548606.3559361; arXiv:2201.05677). A partially-synchronous version of the DAG-ordering protocol layered on top of Narwhal, intended to replace Tusk where the partial-synchrony model applies. Zero ordering-message overhead - Bullshark observes the Narwhal DAG and interprets it as a total order.
- Babel, K., Chursin, A., Danezis, G., Kokoris-Kogias, L., Sonnino, A. et al. "Mysticeti: Reaching the Latency Limits with Uncertified DAGs." arXiv:2310.14821, NDSS 2025. Implementation in `MystenLabs/sui`. Mysticeti-C achieves 3-message-round WAN commit latency (~0.5 s reported) at >200k TPS by removing explicit DAG-block certification; Mysticeti-FPC adds a fast commit path for asset-transfer transactions woven into the DAG.

**Mechanism summary.** Validators continuously broadcast blocks (or batch certificates) referencing prior-round blocks, forming a directed acyclic graph. Consensus is a deterministic rule for interpreting the DAG as a total order. Leaders are elected per round, and a leader's block being committed pulls its causal history into a deterministic sequence. The DAG is a mempool plus a partial-order data structure; the consensus protocol is a rule for collapsing the partial order to a total order.

**Production deployments.**

- **Sui (Mysten Labs)** - Mysticeti launched on Sui mainnet in July 2024, replacing the earlier Bullshark-on-Narwhal stack; Mysticeti-C reported a >4× latency reduction over the prior consensus. Sui is the canonical production reference for Mysticeti.
- **Aleo** - Aleo mainnet launched September 2024 with AleoBFT, a Narwhal-plus-partially-synchronous-Bullshark composition extended with dynamic-committee and staking support.
- **Aptos** - Quorum Store (AIP-26) runs Narwhal-style data dissemination underneath the Jolteon HotStuff variant; the Shoal (FC 2024) and Shoal++ (arXiv:2405.20488, 2024) papers describe migrations of more of the consensus stack onto Bullshark.

**Why DAG protocols are disqualified for UltraFast.**

1. **Latency cost vs. throughput gain that the workload does not need.** DAG protocols optimise for throughput by parallelising block production across all validators simultaneously, paying a latency cost in the certification rounds. Mysticeti's headline 0.5 s WAN commit is excellent for a DAG protocol but is on the wrong side of UltraFast's 200 ms happy-path target. The throughput ceiling that justifies the trade-off, hundreds of thousands of TPS, is not where the v1 workload sits. FBA clears at a tick frequency that puts the binding constraint on matching logic and state-commitment latency, not on raw transaction throughput.
2. **Non-deterministic intra-block ordering.** Within a Mysticeti DAG cut, ordering of transactions across blocks committed by the same round's leader is determined by the commit rule rather than by an explicit proposer ordering. A CLOB's fairness model depends on tick-boundary semantics: every order within a tick is treated as simultaneous, every order outside the tick is ordered by tick boundary. The looser intra-block ordering of DAG protocols introduces fairness-edge cases that a single-proposer-per-view protocol simply does not have.

### Comparison table

| Family | Representative protocols | Production users | Pessimistic latency | Intra-block ordering | UltraFast trade-off rejected |
|---|---|---|---|---|---|
| HotStuff | HotStuff (PODC 2019), HotStuff-2 (ePrint 2023/397), Jolteon (arXiv:2106.10362), PaLa | Aptos (AptosBFT v4 / Jolteon), Flow, ThunderCore (PaLa) | ~$7\delta$ silent-leader floor | Deterministic, leader-ordered | Pessimistic floor too high (~6× Simplex per [1]) |
| CometBFT | Tendermint / CometBFT, ABCI 2.0 | Cosmos Hub, Osmosis, Injective, dYdX v4 (top 60 validators), Sei v1, Celestia | Two-round, ~$4\delta$ typical | Deterministic, proposer-ordered | Lifecycle binds tx processing into consensus tick; fights FBA and MCP. Cosmos-EVM bug class (GHSA-mjfq-3qr2-6g84) |
| DAG | Narwhal/Tusk (EuroSys 2022), Bullshark (CCS 2022), Mysticeti (NDSS 2025) | Sui (Mysticeti, July 2024), Aleo (Sep 2024), Aptos (Quorum Store + Shoal) | ~3 message rounds (~0.5 s WAN for Mysticeti-C) | Non-deterministic within DAG cut | 3–6× latency cost for throughput UltraFast does not need; loose intra-block ordering disqualifies for CLOB |
| **UltraFast choice** | **Threshold Simplex [1] + Minimmit [2]** | Pre-implementation; Commonware monorepo | ~$3\delta$ Simplex floor; one round under Minimmit happy path | Deterministic, leader-ordered, tick-aligned | n/a |

---

## Sources

- HotStuff (PODC 2019): https://arxiv.org/abs/1803.05069
- HotStuff-2 (ePrint 2023/397): https://eprint.iacr.org/2023/397
- Jolteon and Ditto (arXiv:2106.10362): https://arxiv.org/abs/2106.10362
- Simplex Consensus (Chan & Pass, TCC 2023, ePrint 2023/463): https://eprint.iacr.org/2023/463
- CometBFT repository and ABCI 2.0 documentation: https://github.com/cometbft/cometbft and https://docs.cometbft.com/main/spec/abci/abci++_basic_concepts
- Cosmos / CometBFT rename announcement: https://medium.com/the-interchain-foundation/cosmos-meet-cometbft-d89f5dce60dd
- Cosmos-EVM advisory GHSA-mjfq-3qr2-6g84: https://github.com/advisories/GHSA-mjfq-3qr2-6g84
- Evmos advisory GHSA-3fp5-2xwh-fxm6 / CVE-2024-32644: https://github.com/advisories/GHSA-3fp5-2xwh-fxm6
- Narwhal and Tusk (EuroSys 2022, arXiv:2105.11827): https://arxiv.org/abs/2105.11827 and https://dl.acm.org/doi/10.1145/3492321.3519594
- Bullshark (CCS 2022, arXiv:2201.05677): https://arxiv.org/pdf/2201.05677
- Mysticeti (arXiv:2310.14821, NDSS 2025): https://arxiv.org/abs/2310.14821
- Mysticeti v2 on Sui mainnet: https://blog.sui.io/mysticeti-v2-sui-consensus/
- AleoBFT architecture: https://aleo.org/post/architecture-of-aleobft-consensus/
- Aptos Quorum Store AIP-26: https://github.com/aptos-foundation/AIPs/blob/main/aips/aip-26.md
- Shoal (FC 2024): https://fc24.ifca.ai/preproceedings/193.pdf
- Flow Jolteon migration: https://flow.com/engineering-blogs/jolteon-advancing-flows-consensus-algorithm
- ThunderCore PaLa: https://medium.com/thundercore/consenus-series-pala-569b87293bd7
- dYdX v4 architecture (CometBFT, top-60 validators): https://medium.com/@gwrx2005/dydx-v4-architectural-and-protocol-evolution-from-v3-6c312f51f7b7
