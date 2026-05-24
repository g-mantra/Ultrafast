# Renegade ZK+MPC Matching

Research notes on Renegade-style collaborative-SNARK matching as referenced in the UltraFast whitepaper (§11, §15, §17). Renegade is the canonical citation [37] in the whitepaper for the strongest dark-pool privacy tier on the UltraFast privacy ladder.

---

## Part 1: How UltraFast uses Renegade-style ZK+MPC and why

UltraFast is pre-implementation. ZK+MPC matching is not on the v1 critical path; it is the v2+ migration target for the dark-pool tier of the §11 privacy ladder.

**Role in UltraFast.** §11 defines four privacy tiers: Lit (default, v1), Position-private (Pedersen commitments + range proofs, v2), Dark pool TEE (Intel TDX or AMD SEV-SNP attested matching engine, v1.5), and Dark pool ZK+MPC (Collaborative-PLONK matching, Renegade-style, v2+). The ZK+MPC tier is the privacy-maximalist endpoint of the ladder. It is meant to hide exactly the same content as the TEE tier - full pre- and post-trade order detail, with on-chain settlement events still leaking aggregated size and price - but without the enclave-vendor trust assumption that the TEE tier inherits from Intel or AMD.

**Why not at v1.** §11 states plainly: Renegade-style ZK+MPC matching "currently adds tens to hundreds of milliseconds of proving overhead per match - too expensive to bootstrap a new venue against." TEE matching, by contrast, runs at sub-millisecond enclave latency. For a venue that has to attract flow against incumbents on execution quality, a per-match proving budget in the hundreds of milliseconds would force one of two unacceptable compromises: either drop the FBA tick down to something that wipes out fairness guarantees, or quote dark-pool execution at materially worse latency than the lit book. Neither is viable at the bootstrap stage.

**Staging.** The whitepaper sequences this deliberately. Phase 1 of the dark-pool tier is a single-vendor TEE (v1.5). Phase 2 is multi-vendor TEE with threshold-decrypt fallback. Phase 3 - targeted at v2+ - is migration to ZK+MPC once flow has been bootstrapped on the TEE tier and proving overhead is no longer a venue-economics question. §17 ("v2+ migration target") and §15 (Renegade reference, called out as "the privacy-maximalist endpoint") both treat the ZK+MPC tier as a known endpoint rather than an experiment.

**Risk framing.** §11's risk table notes that TEE-class risk (hardware side-channel attacks) is "irreducible without ZK+MPC; the migration path is the only structural fix." The TEE tier carries a documented migration path specifically because Renegade-style matching is the only known way to drop the enclave-vendor trust assumption while keeping pre- and post-trade privacy.

**Open question at v2+.** Whether Renegade's overhead has improved enough by v2+ to make migration economic without flow loss is left explicitly open (§15 lists this under "Dark-pool privacy technology (post-MVP)"). The working assumption is TEE-first with ZK+MPC migration, not ZK+MPC only.

---

## Part 2: Deep research on Renegade

### What Renegade is

Renegade is an on-chain dark pool: an MPC-based DEX for anonymous crosses at midpoint prices. It is live on Arbitrum One mainnet as of September 3, 2024, built on Arbitrum Stylus (which lets Renegade reuse its Rust cryptography on-chain instead of re-implementing in Solidity). Orders are pegged to the real-time midpoint of the Binance bid-ask spread; settlement costs around $0.30 per match. The product is operational with no whitelist.

The protocol specification is "Renegade Whitepaper: Protocol Specification, v0.6" by Christopher Bender et al., at `https://whitepaper.renegade.fi/`. The reference implementation is `renegade-fi/renegade` (Rust, ~2,273 commits, actively maintained). Cryptographic primitives live in `renegade-fi/mpc-jellyfish` and `renegade-fi/mpc-bulletproof`.

### How it works

Renegade uses **collaborative SNARKs** - a construction that lifts a single-prover zk-SNARK into an MPC protocol where N mutually distrusting parties jointly produce one proof over a witness that is shared among them. The foundational paper is Ozdemir and Boneh, "Experimenting with Collaborative zk-SNARKs: Zero-Knowledge Proofs for Distributed Secrets," USENIX Security 2022 (eprint 2021/1530).

The Renegade flow:

1. **State commitments.** Traders post hiding-and-binding commitments of their wallets on-chain; individual wallets are never revealed in plaintext. Each state transition (deposit, withdrawal, match) consumes a wallet commitment via a nullifier and produces a new commitment, in the same shielded-pool pattern used by Zcash-style systems.

2. **Relayer-mediated matching.** Relayers are p2p network nodes that hold their assigned traders' wallets in plaintext (the trader trusts their relayer for liveness, not for honesty about the protocol). Relayers gossip about encrypted order state and run pairwise 2-party MPCs to execute a CLOB matching engine against another relayer's order book - without either side learning the other's orders.

3. **VALID MATCH MPC circuit.** The MPC does not output the matched-token outputs directly. Instead, the two relayers collaboratively prove the NP statement `VALID MATCH MPC`: each party knows a valid input order and balance, the matching engine was executed correctly, and the matched outputs are correctly encrypted under each party's key. The output of the MPC is a single zk-SNARK proof.

4. **On-chain settlement.** The collaborative proof is posted to Arbitrum, the nullifiers for the consumed wallet commitments are revealed, and the new wallet commitments are written. Settlement is atomic: neither party can learn the match result without enabling the other party's settlement.

### Cryptographic stack

- **Proof system: PLONK.** Chosen for EVM verification cost and friendliness to collaborative proving. Renegade's helper docs note PLONK as "easy to verify in an EVM context and friendly to collaborative proving."
- **MPC scheme: maliciously-secure 2-party SPDZ.** A secret-sharing-style scheme picked because Renegade's circuits are arithmetic and the design needs a path to >2 parties in the future. SPDZ provides authenticated shares with active security.
- **Earlier-generation stack.** The `mpc-bulletproof` repo reflects an earlier design point using Bulletproofs (no trusted setup, transparent, but larger proofs and slower verification than PLONK on EVM). The PLONK-based stack in `mpc-jellyfish` is the production direction.
- **Curve.** EVM-friendly pairing-friendly curve (BN254-class) consistent with Arbitrum verification.

### Performance characteristics

Public benchmarks from Renegade put **order matching under ~750 ms** in the initial mainnet release, with order placement under ~3 seconds end-to-end. This is consistent with the §11 whitepaper claim of "tens to hundreds of milliseconds" of proving overhead per match - collaborative-PLONK proving for the VALID MATCH MPC circuit dominates the latency budget, before any L1/L2 settlement time. Renegade itself markets sub-1-second matching as a feature; for a dark pool dealing in midpoint crosses where latency-arbitrage is by design impossible, this is competitive. For a perp futures venue trying to win on execution quality against Hyperliquid-class infrastructure (~200 K ops/sec, sub-second submit-to-fill), the same numbers are a non-starter at bootstrap - which is why UltraFast stages it post-v2.

### Other projects in adjacent design space

- **Penumbra ZSwap.** Cosmos-ecosystem private L1 with an integrated DEX. ZSwap combines frequent batch auctions with anonymous concentrated liquidity positions; sealed-bid auctions reveal only the net flow across an asset pair per block. ZSwap is a *batch auction with shielded inputs*, not a collaborative-SNARK matching engine - relayers don't do pairwise MPC against each other; the chain itself processes shielded intents in batches. Different design point, similar privacy goals.
- **Aztec.** General-purpose privacy on EVM (Noir circuits, client-side proving). Not specifically a matching protocol; matching could be built on top, but Aztec itself is the proving and settlement layer, not the matching layer.
- **Aleo.** General-purpose ZK application platform (zkSnarkVM, Leo language). Similar story to Aztec - infrastructure for ZK apps, not matching-specific.
- **0xPARC research.** Applied-cryptography research org with work on collaborative proving, MPC tooling, and ZK circuit infrastructure; relevant as upstream research but not a matching venue.

Renegade is the only production deployment of *collaborative-SNARK matching* per se. Penumbra is the closest non-collaborative alternative for shielded trading.

### Theoretical foundations

- **Collaborative zk-SNARKs (Ozdemir–Boneh 2022).** Establishes the construction and gives the first systematic benchmarks: proving overhead scales sub-linearly in the number of parties for many circuits, making N-party collaborative proving practical for small N (the 2-party case Renegade uses). USENIX Security 2022 paper and eprint 2021/1530.
- **Malicious Security in Collaborative zk-SNARKs: More than Meets the Eye** (Springer, follow-up work) - addresses corner cases in the malicious-security model for the collaborative setting; relevant to the active-security guarantees Renegade claims.
- **PLONK** (Gabizon–Williamson–Ciobotaru, eprint 2019/953) - universal trusted setup, EVM-cheap verification, the workhorse SNARK for Renegade's production stack.
- **SPDZ family** (Damgård–Pastro–Smart–Zakarias and successors) - authenticated secret-sharing MPC with active security; foundation of Renegade's 2-party MPC layer.

### Limitations and why UltraFast defers

1. **Proving overhead.** The dominant cost. Tens to hundreds of milliseconds per match (whitepaper §11), ~750 ms end-to-end matching in production (Renegade benchmarks). Acceptable for midpoint dark-pool crosses; not acceptable as the default matching path for a perp futures venue that needs to compete on submit-to-fill.
2. **Relayer trust.** Renegade pushes the trust assumption from "trust the chain/enclave/vendor" to "trust your chosen relayer for liveness and for not denying you matches." A trader's own relayer sees their plaintext wallet - so the relayer is not zero-trust, just narrowly-scoped trust. This is a different trust model from a TEE, not a strictly stronger one along every axis.
3. **Throughput.** Pairwise MPC between relayers does not parallelize the same way a lit CLOB does. Renegade's cluster architecture ("fail-stop fault-tolerant clusters that replicate and horizontally scale matching engine execution") addresses replication, not the fundamental per-match proving cost.
4. **Information leakage on settlement.** Even with collaborative proving hiding the order book, on-chain settlement events leak aggregated size and price - the §11 whitepaper notes this is the same residual leakage as the TEE tier. Full content privacy at the matching layer does not imply full privacy end-to-end against a chain-graph analyst.
5. **Coordinator/relayer DoS surface.** A relayer that refuses to participate in MPC can stall matching for its assigned traders. This is a liveness issue, addressable by trader migration between relayers but it is operational overhead the lit tier does not carry.

### Status check (as of 2026)

Renegade has been live on Arbitrum One since September 2024 with spot trading (midpoint crosses on selected assets). The reference implementation is open source and actively developed. The team has not, to public knowledge, announced a perps product or a migration off Arbitrum. The protocol specification at v0.6 remains the latest published whitepaper version.

For UltraFast, the salient facts are: (a) the construction is production-validated for spot dark-pool crosses; (b) the proving-overhead number from the §11 whitepaper claim is consistent with Renegade's own product benchmarks; (c) no public benchmark yet exists for collaborative-PLONK matching of *perp* orders (which carry margin and liquidation state and are therefore heavier circuits than spot crosses). The v2+ migration target in §17 is well-defined as a direction but the exact proving-time gap that has to close before migration is economic remains an open research question - which is exactly why §11 frames it as "evaluated as a v2+ migration path from the TEE tier" rather than as a committed path.

---

## References

- Bender, C. et al. "Renegade Whitepaper: Protocol Specification, v0.6." `https://whitepaper.renegade.fi/`
- Codebases: `https://github.com/renegade-fi/renegade`, `https://github.com/renegade-fi/mpc-jellyfish`, `https://github.com/renegade-fi/mpc-bulletproof`
- Renegade docs: `https://docs.renegade.fi/` (MPC-ZKP architecture, cryptographic stack)
- Ozdemir, A. and Boneh, D. "Experimenting with Collaborative zk-SNARKs: Zero-Knowledge Proofs for Distributed Secrets." USENIX Security 2022. `https://www.usenix.org/conference/usenixsecurity22/presentation/ozdemir`, eprint `https://eprint.iacr.org/2021/1530`
- Gabizon, A., Williamson, Z., Ciobotaru, O. "PlonK: Permutations over Lagrange-bases for Oecumenical Noninteractive arguments of Knowledge." eprint `https://eprint.iacr.org/2019/953`
- Renegade mainnet launch: `https://substack.renegade.fi/p/renegade-goes-live-on-arbitrum-one` (September 2024)
- Arbitrum Stylus case study: `https://blog.arbitrum.io/renegade-stylus-case-study/`
- Penumbra ZSwap: `https://protocol.penumbra.zone/` and `https://www.penumbra.zone/`
- UltraFast whitepaper: `/Users/g/git/mantra/ultrafast/whitepaper.md` §11, §15, §17, reference [37]
