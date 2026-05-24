# Multi-Concurrent Proposer (MCP)

Research notes for the UltraFast whitepaper. These notes cover the role of Multi-Concurrent Proposer architectures in UltraFast and the wider technical context: Solana Constellation, the academic MCP literature, and the residual-MEV analysis that motivates its placement as Layer 1 of the three-layer MEV stack.

---

## Part 1 - How UltraFast Uses MCP and Why

### Position in the stack

MCP is Layer 1 of UltraFast's three-layer MEV stack (§8.1). It sits beneath Frequent Batch Auctions (§8.2, Layer 2) and the tokenized-ordering bolt-on (§8.3, Layer 3). Layer 1's job is to make selective censorship architecturally infeasible. Layers 2 and 3 then make whatever transactions reach the leader semantically un-front-runnable.

UltraFast adopts MCP because any auction-based MEV mitigation - including FBA - only works if the underlying consensus provides selective-censorship resistance and content hiding before the auction window closes. This is the formal result implicit in Landers and Marsh (arXiv:2511.13080). An auction at the matching layer cannot rescue ordering integrity if the proposer below it can selectively drop, delay, or peek at transactions before they enter the auction.

### Architecture as instantiated in UltraFast

UltraFast's instantiation follows the Solana Constellation pattern with explicit parameters (§8.1):

- Approximately 16 stake-weighted Proposers accept transactions in 50 ms cycles.
- Each Proposer assembles its accepted transactions into a *pslice*.
- Each pslice is erasure-coded into 256 *pshreds* - one per Attester.
- 256 Attesters sign attestations on the pshreds they receive.
- The Threshold Simplex leader assembles a block from pslices that crossed at least 40 % attester support.
- A block is structurally invalid if total attestation falls below 60 %.

The censorship-resistance guarantee is architectural: censoring an attested pslice produces an invalid block. No slashing is required - the enforcement is structural rather than economic. This is the property the whitepaper specifically calls "hard selective-censorship resistance."

### What MCP solves and what it does not

MCP solves hard selective censorship by IP, fee level, or deposit pattern. A single proposer can no longer drop a target user.

MCP does not solve two residual exposures, named in §8.1:

1. **Content visibility post-deadline.** Proposers see plaintext transactions in the standard pipeline. Users who submit redundantly to multiple Proposers widen their content exposure as the price of censorship resistance.
2. **Timing and late-message attacks.** A Proposer can delay forwarding pshreds without producing punishable evidence (this is the same residual flagged by Landers and Marsh and by the Helius commentary on Constellation).

The FBA tick (§8.2) is the complement. It makes whatever the Proposers see semantically un-front-runnable inside a tick, because the clearing price and the pro-rata fill allocation are invariant under permutation of the contributing orders.

### Rollout timing

MCP is a v1.1 add-on, not v1 (§16, §17). UltraFast ships v1 with single-proposer Threshold Simplex. It adds MCP once a production Constellation implementation (or comparable alternative) is available and latency has been validated on testnet. Rolling out MCP does not require a consensus fork. It sits underneath Threshold Simplex as block-assembly plumbing (§17).

The v1 window therefore carries a residual selective-censorship risk, named explicitly in §14 rather than papered over. The v1 mitigations are procedural rather than architectural: aggressive leader rotation, timeout-skip rules for orphaned proposals, and wallet-level retry-from-different-mempool-entrypoint UX.

### Bandwidth

The bandwidth budget per validator is targeted at under 50 Mbps at projected throughput (§12, §17). This number is the measurement target during the testnet validation that gates the v1.1 ship decision.

### Open question

The §16 open decision lists "v1.1 add-on (default; single-proposer at launch) versus v1 ship versus deferral to v2" as unresolved. Also open: whether UltraFast adopts Solana Constellation directly or a comparable alternative (Sei Giga, Braid, or a UltraFast-specific implementation).

---

## Part 2 - Deep Research on MCP and Constellation

### The MCP idea

Multi-Concurrent Proposer architectures break the single-leader monopoly on transaction ordering. Multiple proposers concurrently propose transaction batches. An attestation layer then ensures that any batch with sufficient attestation support must be included by the leader. The single leader is reduced from "decides what is in the block" to "assembles a block from already-attested pieces."

This converts censorship from a discretionary choice into a structural property: a block that omits an attested batch is invalid by construction.

### Solana Constellation

Solana Constellation is Anza's proposal to implement MCP on Solana. It is currently a proposal, not yet shipped. It is documented at `https://constellation.anza.xyz/` with the specification under development as part of SIMD work referenced as 03/25/2026.

**Architecture (Constellation specifics):**

- Approximately 16 proposers, randomly selected by stake, rotated every 1.6 seconds.
- 50 ms cycle window. Proposers accept transactions during the cycle and assemble accepted transactions into pslices.
- Approximately 256 attesters. Each pslice is erasure-coded into 256 pshreds with a recovery threshold of 64 (any 64 of 256 can reconstruct the pslice). Attesters timestamp and forward pshreds to the leader and sign attestations on what they receive.
- Leader (same role as in Alpenglow consensus) must include any pslice attested by at least 40 % of attesters. If fewer than 60 % of attesters participate overall, the block is skipped entirely.
- Double-signing detection removes equivocating proposers from aggregation regardless of attestation count.

**Status and timeline.** Constellation builds on Alpenglow (Solana's new consensus protocol, SIMD-0326), which targets a Q3 2026 mainnet launch. Constellation cannot ship before Alpenglow. Anza has confirmed that 200 ms slots will ship before Constellation arrives. A SIMD proposal for Constellation is expected to be formally voted on by the network later. Community debate continues on whether the proposal is mature (see Anagram's "Constellation Is Not Ready For the SIMD" critique and Solanafloor commentary).

**Who is building it.** Anza, led by Brennan Watt. The proposal acknowledges contributions from researchers including Max Resnick (also a co-author of the Ethereum Braid MCP proposal).

**Fee structure.** Constellation splits transaction costs into two components:
- An *inclusion fee* - fixed, size-based, paid to the proposer, charged per proposer the user submits to.
- An *ordering fee* - priority-fee based, charged once regardless of how many proposers included the transaction, because execution happens only once.

**Latency trade-off.** The Helius analysis distinguishes two latencies: *sequence latency* (submission to execution) increases under Constellation because of the attester round, the 50 ms cycle window, and batch assembly. *Inclusion latency* (the guaranteed inclusion window for a fee-competitive transaction) decreases, because now there is a protocol-enforced guarantee rather than a leader's discretion.

### Academic foundations

**Garimidi, Neu, Resnick - "Multiple Concurrent Proposers: Why and How", arXiv:2509.23984 (submitted 28 September 2025).** The formal treatment. The paper argues that traditional single-proposer chains let validators monopolise ordering. Existing MEV-auction mitigations require the underlying consensus to provide selective-censorship resistance and transaction hiding before the auction window closes. The paper proposes an MCP protocol that distributes proposer responsibilities across multiple concurrent validators using threshold-based attestations. It uses Hiding Erasure-Correcting Codes (HECC) to achieve full transaction hiding alongside censorship resistance. This is the theoretical gold standard that Constellation does not yet fully implement, because HECC at Solana scale remains an open engineering problem.

**Landers and Marsh - "MEV in Multiple Concurrent Proposer Blockchains", arXiv:2511.13080 (submitted 17 November 2025).** The MEV analysis. The paper analyses MEV in chains where multiple blocks achieve data availability concurrently before execution order is finalised. It identifies three MEV channels introduced by MCP: same-tick duplicate steals, proposer-to-proposer auctions, and timing races driven by proof-of-availability latency. It develops a hazard-normalised model of delay and inclusion with a closed-form delay envelope M(τ) characterising equilibria across censorship, duplication, and auction scenarios. The paper proposes that deterministic priority-DAG scheduling and duplicate-aware payouts neutralise same-tick MEV without requiring a centralised builder.

The Landers-Marsh result is the basis for UltraFast's §8.1 framing that MCP alone is insufficient and must be paired with an auction mechanism (FBA) at the matching layer.

### Related architectures and alternatives

**Sei Giga.** Lane-based MCP - every validator maintains a continuous proposal stream. Giga achieves asynchronous execution (which Constellation defers) and offers probabilistic rather than structural censorship resistance.

**Ethereum's Braid.** Implements MCP via parallel chain proposals within a slot, leaning heavily on encrypted mempools. Research stage; undeployed. Resnick is a co-author of both Braid and the Constellation-adjacent academic paper.

**SUAVE (Flashbots).** A separate domain for order flow and block-building auctions; not an MCP architecture per se, but in the same design space of decoupling proposer monopoly from block construction.

**Aggregate Block Building (Solana TPU work).** Predecessor work in the Solana ecosystem on multi-source block assembly without full MCP semantics.

**Shared sequencers (Espresso, Astria).** Cross-rollup ordering services. Decouple sequencing from execution but typically still use a single sequencer at any moment; some designs explore multi-proposer extensions.

No production blockchain has shipped MCP at the time of writing. Constellation is the leading candidate, with Sei Giga as the principal alternative.

### Erasure coding's role

The role of erasure coding (Reed-Solomon in Constellation; this is the same technology powering Solana's Turbine block-delivery system) is to spread a pslice's data across attesters such that:

1. No single attester sees the full pslice (relevant for hiding constructions like HECC).
2. Any sufficient subset of attesters can reconstruct it (256 pshreds with recovery threshold 64 in Constellation).
3. Bandwidth is amortised across the attester set rather than concentrated on the leader.

This is what makes the bandwidth budget plausible - each attester carries `pslice_size / 256` plus signature overhead, rather than the full pslice.

### Trade-offs

**Bandwidth cost.** Each attester sees 1/256 of every pslice plus the signature overhead of attesting. The aggregate is a multiplicative factor over the underlying transaction throughput, bounded by the recovery threshold ratio. UltraFast targets under 50 Mbps per validator at projected throughput.

**Latency overhead.** The attestation round adds at minimum one network round-trip between proposers and attesters before the leader can assemble the block. The 50 ms cycle is the budget for this round.

**Protocol complexity.** Constellation requires simultaneous implementation across both Agave and Firedancer client implementations on Solana - an unprecedented coordination challenge. UltraFast, as a greenfield chain, avoids this multi-client coordination problem at v1.1.

**Residual MEV vectors not solved by MCP alone.** Content visibility, timing manipulation, and cross-tick statistical arbitrage all survive MCP. These are the vectors that motivate Layer 2 (FBA) and the residual-MEV catalogue at §8.4.

**Complementarity to FBA.** MCP alone leaves content-visibility and timing vectors open. FBA alone leaves selective censorship open (a single proposer can drop orders before they enter the tick). The two layers compose: MCP forces transactions into the tick, FBA neutralises ordering inside the tick. This composition is why UltraFast does not treat either layer as sufficient on its own.

### Open problems

The academic literature flags three open problems for MCP that UltraFast inherits:

1. **Slashing for timing manipulation.** No cryptographic fingerprint distinguishes strategic delay from honest network latency. Garimidi-Neu-Resnick and Landers-Marsh both flag this. Anza's Constellation proposal suggests adapting "fisherman nodes" to detect statistical patterns of manipulation across many cycles.
2. **Full hiding.** HECC at production scale is not yet deployable. Jito's Block Assembly Marketplace offers partial solutions via TEEs at the cost of trusting hardware vendors. UltraFast accepts the partial-hiding outcome and uses FBA to neutralise the residual.
3. **Asynchronous execution.** Decoupling ordering from execution could narrow the content-visibility window. Sei Giga chose this path; Constellation and UltraFast defer it.

---

## Sources

- Solana Constellation proposal tracker - `https://constellation.anza.xyz/`
- Helius - "What is Constellation? Multiple Concurrent Proposers on Solana" - `https://www.helius.dev/blog/constellation`
- Garimidi, Neu, Resnick - "Multiple Concurrent Proposers: Why and How", arXiv:2509.23984 (28 Sep 2025) - `https://arxiv.org/abs/2509.23984`
- Landers, Marsh - "MEV in Multiple Concurrent Proposer Blockchains", arXiv:2511.13080 (17 Nov 2025) - `https://arxiv.org/abs/2511.13080`
- Anagram - "Constellation Is Not Ready For the SIMD" - `https://blog.anagram.xyz/constellation-is-not-ready-for-the-simd/`
- SIMD-0326 (Alpenglow) - `https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0326-alpenglow.md`
- Solanafloor - "Solana Community Divided Over Anza MCP Proposal" - `https://solanafloor.com/news/solana-community-divided-over-anza-mcp-proposal-impact-validators-perps-trading`
- UltraFast whitepaper §8.1, §8.2, §8.4, §14, §16, §17 - `/Users/g/git/mantra/ultrafast/whitepaper.md`
