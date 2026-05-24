# Masquerade Tokenized Ordering

Research notes for the Masquerade reference in the UltraFast whitepaper (§8.3, citation [11]). UltraFast is pre-implementation; this document records what the design adopts, why it sits where it sits in the MEV stack, and what the source material does and does not say.

## Part 1: How UltraFast uses Masquerade-style tokenized ordering

UltraFast layers three MEV-resistance primitives in a fixed dependency order: Multi-Concurrent-Proposer (MCP) at consensus (§8.1), Frequent Batch Auctions (FBA) at the matching layer (§8.2), and a Masquerade-style tokenized-ordering bolt-on for paths that necessarily bypass the FBA tick (§8.3). FBA is the heavy lifter. Every transaction that touches a market within a tick collapses into a uniform-price clearing with pro-rata fills at the marginal level. That makes intra-tick sandwich attacks, classic front-running, and time-boost MEV semantically meaningless. The Masquerade layer exists only to close the gap that FBA does not cover.

That gap is a small, named set of paths: administrative transactions, governance executions, and cross-chain message handlers. These paths do not contribute to a market clearing price, so they cannot be folded into the FBA tick. They still need an ordering rule. They still sit in front of a leader that, absent a discipline, could reorder them for profit or for censorship. UltraFast's choice for that discipline is the tokenized-ordering pattern from Bhat et al.'s Masquerade paper: each transaction outside the batch is augmented with a strictly increasing serial-numbered token, and the block builder is required to commit transactions in token-number order. The ordering invariant is deterministic and verifiable from the serial numbers alone. The leader's discretion over admin and bridge-handler ordering collapses to "include or do not include," with reordering becoming a protocol violation rather than a free move.

The design intent is explicit and worth repeating: the bolt-on is a hedge, not a permanent layer. If FBA in production turns out to cover all paths that matter - including governance and bridge handlers folded into a degenerate batch - the bolt-on is killed. The open decision recorded in §16 is the scope question: admin-only, admin plus cross-chain message handlers, or a general-purpose primitive for any contract that wants to opt in. Phase-0 benchmarking is the deciding input. Until then the assumption is that the Masquerade pattern is the right shape for the residual non-market paths but the surface area is undecided.

The architectural choice matters because the alternative - relying on the leader's good behaviour for admin and bridge ordering - would leak the censorship-resistance property that MCP buys at considerable cost. The bolt-on extends the property all the way to the edges of the transaction graph without introducing an encrypted mempool's committee-liveness risk or its multi-slot latency. That is the trade UltraFast is making.

## Part 2: Masquerade - the paper and the design space

### The paper

The primary reference is Vedula, Venkatakrishnan, and Gupta, *Masquerade: Simple and Lightweight Transaction Reordering Mitigation in Blockchains*, published in ACM Distributed Ledger Technologies: Research and Practice in April 2025 (DOI: 10.1145/3730410), with the original arXiv preprint posted 29 August 2023 (arXiv:2308.15347). The whitepaper bibliography lists "Bhat, A. et al." as the author; the arXiv and ACM records show the authors as Arti Vedula, Shaileshh Bojja Venkatakrishnan, and Abhishek Gupta. The citation in §8.3 of the whitepaper points at the right work but the lead author attribution should be corrected to Vedula et al. before publication.

### Mechanism

Masquerade introduces a token primitive on top of an existing chain. A user who wants their transaction protected from reordering buys a token; tokens carry strictly increasing serial numbers issued in the order they are purchased. The user attaches the serial number to the transaction. The block-builder, when assembling a block, is required to order any token-bearing transactions strictly by token number. The ordering invariant is "lower serial number commits first," and the invariant is verifiable from on-chain state because token issuance is itself an on-chain event.

The key economic claim in the paper is that this strict ordering changes the adversary's calculus. An MEV-seeking builder or searcher cannot move a token-bearing transaction relative to other token-bearing transactions. The attack surface for reordering reduces to the subset of transactions that did not buy tokens, and within the protected subset reordering attacks become impossible by construction. The authors frame it as a "per-transaction level of ordering [that] ensures the transaction is committed either way even if revealed" - meaning revelation does not enable a reordering attack because the serial number already pins the position.

### Trust assumptions

The token-issuance mechanism is the trust root. The paper's framing treats token issuance as an on-chain primitive - anyone can buy, no one curates - which sidesteps the need for a centralised issuer but does require that the chain's consensus already orders the issuance events themselves. That gives a recursive property: tokenized ordering is built on top of base-layer ordering of token purchases, and only inherits as much fairness as the base layer provides for that subset of events. Masquerade is therefore a layered mitigation, not a replacement for fair base-layer ordering of the issuance path.

The paper is also explicit that tokens are voluntary. Users who do not buy a token receive no ordering protection. This is a feature, not a bug: it lets latency-sensitive paths skip the token logic entirely and lets the bolt-on price the protection at the margin. For UltraFast the relevant paths (admin, governance, bridge handlers) are exactly the paths where the latency cost is acceptable and the ordering guarantee is valuable, which is the right shape for the primitive.

### Status and adoption

The work is recent - first arXiv release in August 2023, formal ACM publication in April 2025 - and the implementation status remains academic. The paper presents a protocol design and a simulation-based evaluation rather than a production deployment. As of the May 2026 cut-off, no production L1 has been identified that ships tokenized ordering as a standalone primitive. The closest analogues in production are application-level nonce mechanisms (which give per-sender ordering but not cross-sender ordering) and the Chainlink Fair Sequencing Services pattern (which gives a separate ordering service rather than an in-protocol token).

UltraFast appears to be the first chain proposing to fold the Masquerade pattern into a production MEV stack as a named, scoped bolt-on. That is consistent with the §8.3 framing: the pattern is borrowed for a specific structural gap, not adopted as a general thesis about how transactions should be ordered.

### Comparison to other reordering mitigations

The reordering-mitigation design space partitions into four broad families, and Masquerade sits in a distinct corner of it.

**Threshold-encrypted mempools** (Shutter, Ferveo, the more recent batched threshold encryption work). Transactions are encrypted at submission; a committee jointly decrypts after the block ordering is fixed. The property is strong - content is hidden, so reordering cannot be content-aware - but the cost is committee-liveness risk and significant latency. Shutter's production deployment on Gnosis runs at roughly minute-scale inclusion latency as of 2025; Ferveo's BFT-targeted construction is faster but still adds at least one slot. UltraFast's §8.5 rejects this family for v1 on latency and committee-halt grounds and defers re-evaluation to v2.

**Time-based order-fairness consensus** (Aequitas, Themis, Pompē, "Quick Order Fairness," "Wendy Grows Up"). Transactions are ordered by when the validator set as a whole received them. The fairness property is appealing but in practice only batch order-fairness is achievable; Aequitas and quick-order-fairness give only weak liveness, so transactions can in principle wait arbitrarily long. The Condorcet-attack issue means strict total order-fairness is impossible without sacrificing another property. These constructions are heavier than Masquerade and put the fairness logic into consensus rather than into a thin bolt-on.

**Commit-reveal schemes**. Users commit to a hash, reveal later. Simple but vulnerable to selective non-reveal and griefing, and adds at least two phases of latency. Largely superseded in serious designs by threshold encryption.

**Tokenized ordering (Masquerade)**. Lightweight, deterministic, no committee, no extra consensus latency. Does not hide content - a transaction's contents are visible at submission - and therefore does not protect against information-leak attacks where the leaker is the user themselves (the mempool, the gateway). For paths where content visibility is not the threat, content hiding adds no value and the latency cost of encryption would be a pure tax. The relevant cases: admin transactions whose effect is already public, governance executions that have been voted on in clear, and bridge handlers carrying messages that are already broadcast on the source chain. That match between threat model and primitive is why Masquerade is the right choice for §8.3 and the wrong choice for the market-touching path covered by FBA.

### Limitations

The mechanism is fundamentally about ordering, not visibility. An adversary who can observe a token-bearing transaction before it commits still sees the contents; what they cannot do is move it relative to other token-bearing transactions. For the paths UltraFast assigns to the bolt-on, this is acceptable. For a market-touching path it would not be - which is exactly why FBA, not Masquerade, sits in front of orderflow.

The serial-number primitive is also a per-transaction cost: every protected transaction must purchase a token, which means a non-zero fee floor for admin and governance paths. For the volumes those paths run at, the cost is negligible. For a hypothetical "general-purpose" expansion of the bolt-on to cover all contract calls, the cost would compound - another reason §16 lists "general purpose" as the most aggressive scope option rather than the default.

## References

- Vedula, Venkatakrishnan, Gupta. "Masquerade: Simple and Lightweight Transaction Reordering Mitigation in Blockchains." arXiv:2308.15347, 29 August 2023. https://arxiv.org/abs/2308.15347
- Same authors. ACM Distributed Ledger Technologies: Research and Practice, April 2025. DOI: 10.1145/3730410. https://dl.acm.org/doi/10.1145/3730410
- Shutter Network blog, "The Road Towards an Encrypted Mempool on Ethereum" and "Breaking Encrypted Mempool Limitations with Advanced Cryptography."
- Bebel and Ojha. "Ferveo: Threshold Decryption for Mempool Privacy in BFT networks." IACR ePrint 2022/898.
- Choudhuri et al. "Mempool Privacy via Batched Threshold Encryption." USENIX Security 2024.
- Kelkar, Deb, Long, Juels, Kannan. "Themis: Fast, Strong Order-Fairness in Byzantine Consensus." CCS 2023.
- Kelkar, Zhang, Goldfeder, Juels. "Order-Fairness for Byzantine Consensus" (Aequitas). CRYPTO 2020.
- Zhang, Setty, Chen, Zhou, Alvisi. "Pompē: Online Ordering Beyond Consensus." OSDI 2020.
- UltraFast whitepaper §8.1 (MCP), §8.2 (FBA), §8.3 (tokenized ordering bolt-on), §8.5 (rejection of threshold-encrypted mempool for v1), §16 (open decisions).
