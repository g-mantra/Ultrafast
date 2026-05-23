# Pedersen Commitments and Range Proofs

## Part 1: Role in UltraFast

UltraFast is a pre-implementation Layer 1 from the MANTRA team carrying perpetual futures, scalar prediction markets, a data marketplace, and an EVM lane. Its privacy model is tiered (§11). The default lit tier publishes every order, fill, and position on-chain; the dark-pool tiers (TEE at v1.5, ZK + MPC at v2+) hide the full pre- and post-trade order detail at the cost of either enclave-vendor trust or heavy proving overhead. Between these extremes sits the **position-private** tier, which is the slot Pedersen commitments and range proofs fill.

The position-private tier hides three specific quantities — **position sizes, margin ratios, and liquidation levels** — by storing them as Pedersen commitments and attaching range proofs that bound the committed values without revealing them. The validator set and outside observers see commitment blobs and small proofs; they do not see how large a trader's position is, how close that position is to liquidation, or what margin ratio it carries. Counterparties to a fill still settle through the public margin engine, so collateral solvency is enforced; what is masked is the exposure profile that would otherwise let MEV searchers and competing traders snipe known liquidation prices or fade visibly large positions.

Two design points are worth being explicit about.

First, this tier is the **baseline privacy step that does not require a TEE or a full ZK matching engine**. The cryptography has been deployed in production for over five years on Monero, Grin, Beam, and MobileCoin; the constructions are non-interactive, transparent (no trusted setup with Bulletproofs), and well audited. The position-private tier therefore gives users meaningful confidentiality without committing UltraFast to enclave attestation in v1 or to MPC matching latency in v2.

Second, the position-private tier **targets v2 and is not on the v1 critical path** (§11 table; §17). The whitepaper's v1 ships with the lit tier only; v1.5 adds the single-vendor TEE dark pool; v2 adds the position-private tier alongside the multi-vendor TEE phase. The position-private framework is also **independent of the threshold-encrypted mempool revisit** discussed at the end of §11 — the §8.5 mempool decision is separate plumbing and is not assumed by this tier.

UltraFast does not yet specify the curve, the exact range-proof flavour, or whether commitments are scoped per-position or per-account. Those choices are open; the whitepaper commits only to the family of constructions (Pedersen commitments plus range proofs over positions and margin ratios).

## Part 2: Deep Research

### Pedersen commitments

A Pedersen commitment to a scalar value `v` is `C = g^v · h^r` (multiplicative notation) or `C = v·G + r·H` (additive elliptic-curve notation), where `r` is a uniformly random blinding factor and `G`, `H` are group generators whose discrete-log relation is unknown to the committer. The scheme has two properties that matter for confidential ledgers:

- **Perfectly hiding.** Because `r` is uniform, `C` is statistically indistinguishable from a random group element regardless of `v`. An unbounded adversary still cannot recover `v`.
- **Computationally binding.** Opening `C` to a different `v'` would require finding `log_G(H)`, which is hard under the discrete-logarithm assumption on the chosen group.

(Choosing a different parameterisation can swap these — statistically binding and computationally hiding — but the perpetually-hiding flavour is the standard one used in confidential transactions.)

The second property that makes Pedersen commitments load-bearing for ledgers is **additive homomorphism**: `C(v1, r1) + C(v2, r2) = C(v1 + v2, r1 + r2)`. A protocol can verify that committed inputs equal committed outputs in commitment space without ever opening any of them — the "value-balance" check that Monero's RingCT, Grin, Beam, and Penumbra all rely on. Penumbra extends this to multi-asset balances: each Penumbra action commits to a `(value, asset)` pair, and a transaction is valid iff the homomorphic sum is a commitment to a zero balance, evaluated per asset type.

The hole that homomorphism alone leaves is **overflow / negative-value attacks**: because group arithmetic is modular, a committer could claim a "negative" amount and create value out of thin air. Range proofs close this hole.

### Range proofs

A range proof attached to a commitment `C` proves, in zero knowledge, that the value inside `C` lies in `[0, 2^n)` for some agreed `n` (typically 64 bits for amounts; 32 or 16 may be enough for margin ratios). The committer never reveals `v`.

The history of practical range-proof constructions, in roughly chronological order:

- **Bit-decomposition + Sigma-protocol range proofs.** The original confidential-transactions construction (Maxwell, 2015) wrote out `v` as a sum of bit-commitments and proved each bit was 0 or 1 with a Sigma protocol. Linear in `n` and large in practice — a 64-bit range proof took several kilobytes per output.
- **Bulletproofs (Bünz, Bootle, Boneh, Poelstra, Wuille, Maxwell, IEEE S&P 2018).** Non-interactive zero-knowledge with no trusted setup. Proof size is `2·log₂(n) + 9` group and field elements — logarithmic in `n` rather than linear. Aggregating `m` range proofs adds only `O(log m)` group elements over the cost of a single proof, which made multi-output transactions dramatically cheaper. Proving and verification are linear in `n` (and in `m·n` for aggregates). The construction is based on the discrete-log assumption and uses an inner-product argument that has since been reused widely outside range proofs.
- **Bulletproofs+ (Chung, Han, Ju, Kim, Seo, eprint 2020/735).** Refines the inner-product argument; produces proofs roughly 96 bytes smaller than a Bulletproofs proof regardless of output count, with slightly faster verification. Adopted by Monero in its August 2022 hard fork ("Bulletproofs+").
- **Bulletproofs++ (Eagen et al.).** Further size reduction (~38% over base Bulletproofs in reported deployments). Beldex's "Obscura" hardfork scheduled for late 2025 is one of the first major production deployments.
- **SNARK-based range proofs.** A range check is just an arithmetic-circuit constraint, so any general-purpose SNARK (Groth16, PLONK, Halo2, STARKs) can prove it. The trade-off flips: proofs are tiny and constant-size, verification is fast (often constant time), but proving is much more expensive and many constructions (Groth16, original PLONK) require a trusted setup. Halo2 (PLONK arithmetisation, IPA-based, no trusted setup) is the in-production SNARK that Zcash's Orchard pool has used since the NU5 upgrade in May 2022; the same stack is used by Scroll, Taiko, and the Ethereum Foundation's PSE work.

### Implementations

- **`dalek-cryptography/bulletproofs`** — pure-Rust Bulletproofs over the Ristretto group on Curve25519. Audited by Quarkslab in 2019 (commissioned by Tari Labs); no critical findings. The reference Rust implementation for the wider ecosystem.
- **Monero** — production C++ Bulletproofs since the October 2018 hardfork, replacing the earlier Borromean-ring range proofs and cutting per-transaction range-proof size from kilobytes to a few hundred bytes. Migrated to Bulletproofs+ in August 2022.
- **Grin and Beam** — Rust (Grin) and C++ (Beam) Mimblewimble implementations using Pedersen commitments end-to-end (no addresses, only commitments and kernels) plus Bulletproofs for ranges. Live since 2019.
- **MobileCoin** — Pedersen + RingCT-style transactions on a CCF / SGX-attested ledger.
- **Penumbra** — Rust Cosmos-SDK chain; Pedersen commitments over `(value, asset)` pairs with a homomorphic value-balance argument, combined with Groth16/PLONK circuits for the rest of each action. Audited by zkSecurity in 2023.
- **Aztec** — UTXO ("notes") private state on Ethereum; Pedersen hashes and commitments are used for note commitments inside Noir/Plonk circuits.
- **Zcash Orchard / Halo2** — Pedersen commitments are still used for note commitments; the range and spend logic moved into Halo2 circuits with the May 2022 NU5 upgrade, retiring the per-output Bulletproofs that Sapling did not actually use (Sapling used Groth16, not Bulletproofs — a common confusion).

### Comparison to other commitment schemes

- **Hash / Merkle commitments** — perfectly binding and very cheap, but not homomorphic. Useful for membership proofs (Merkle trees of note commitments), not for value-balance arguments.
- **KZG polynomial commitments** — homomorphic over polynomials, constant-size openings, but require a trusted setup ceremony and are not the right primitive for committing to a single scalar amount.
- **ElGamal commitments** — additively homomorphic, support encrypted-balance account models (no UTXO required), but each commitment is twice the size and supports decryption by a key holder, which is sometimes a feature (auditable confidentiality) and sometimes a leak. Some recent designs prefer ElGamal precisely because it preserves the account model that Pedersen forces away.

### Trade-offs that matter for UltraFast

- **No trusted setup.** Bulletproofs and Bulletproofs+ rely only on the discrete-log assumption on the chosen curve. A v2 launch of the position-private tier does not need a ceremony.
- **Logarithmic proof size, linear verification.** A 64-bit Bulletproof range proof is around 672 bytes; verifying it costs `O(n)` group operations. Aggregating across the positions in a block amortises both prover and verifier cost, which fits UltraFast's per-block settlement model better than per-transaction verification on Ethereum mainnet.
- **UTXO-vs-account constraint.** Pedersen's homomorphism does not survive a mutable-balance account model, so a position-private tier built on Pedersen typically represents each position as a UTXO-like note. This is a design constraint UltraFast will hit when it specifies how positions are referenced by the margin engine.
- **Quantum.** Discrete-log assumptions break under a sufficiently large quantum computer. Bulletproofs and Pedersen commitments are not post-quantum. This is shared by every elliptic-curve-based construction currently in production and is not specific to the position-private tier.

### Maturity

Pedersen commitments are textbook cryptography from 1991. Bulletproofs have been in production on Monero since October 2018, on Grin and Beam since 2019, and on MobileCoin and Penumbra since their respective mainnets. The dalek implementation has a public audit. The construction's limitations (linear-time verification, no post-quantum security, UTXO-shaped state) are well understood. For a v2 tier whose purpose is to ship meaningful confidentiality without taking on TEE or MPC dependencies, the maturity profile is the strongest case for the choice.

## Sources

- [Bulletproofs: Short Proofs for Confidential Transactions and More (Bünz, Bootle, Boneh, Poelstra, Wuille, Maxwell, IEEE S&P 2018)](https://web.stanford.edu/~buenz/pubs/bulletproofs.pdf)
- [Bulletproofs paper, Cryptology ePrint Archive 2017/1066](https://eprint.iacr.org/2017/1066.pdf)
- [Bulletproofs+ paper, Cryptology ePrint Archive 2020/735](https://eprint.iacr.org/2020/735.pdf)
- [dalek-cryptography/bulletproofs (Rust implementation)](https://github.com/dalek-cryptography/bulletproofs)
- [Quarkslab audit of dalek libraries (2019)](https://blog.quarkslab.com/security-audit-of-dalek-libraries.html)
- [Monero becomes Bulletproof (Digital Asset Research)](https://medium.com/digitalassetresearch/monero-becomes-bulletproof-f98c6408babf)
- [Penumbra Assets and Values documentation](https://protocol.penumbra.zone/main/assets.html)
- [zkSecurity audit of Penumbra's circuits](https://www.zksecurity.xyz/blog/posts/penumbra/)
- [Aztec UTXO syntax — partial commitments](https://forum.aztec.network/t/utxo-syntax-3-support-for-partial-commitments/46)
- [Explaining Halo 2 (Electric Coin Company)](https://electriccoin.co/blog/explaining-halo-2/)
- [On the Security of Halo2 (Kudelski Security Research)](https://kudelskisecurity.com/research/on-the-security-of-halo2-proof-system)
- [Bulletproofs and Mimblewimble (Tari Labs University)](https://tlu.tarilabs.com/cryptography/bulletproofs-and-mimblewimble)
- [Grin protocol overview (Tari Labs University)](https://tlu.tarilabs.com/protocols/grin-protocol-overview)
- [Beam Mimblewimble documentation](https://www.beam.mw/docs/dev/beam-technology/mimblewimble/)
- [Stay in Range: Deeper Into Bulletproofs (zkSecurity Quarterly)](https://blog.zksecurity.xyz/posts/bulletproofs-range-proofs/)
- [Obscura Hardfork: Bulletproofs++ (BeInCrypto)](https://beincrypto.com/obscura-hardfork-bulletproofs-plus-plus/)
