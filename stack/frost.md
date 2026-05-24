# FROST

Flexible Round-Optimized Schnorr Threshold Signatures. A two-round threshold signature scheme for Schnorr and EdDSA, standardised as IETF RFC 9591 in June 2024, and the protocol UltraFast uses for its Bitcoin Taproot, Solana, and Cosmos Ed25519 validator-operated vaults.

## Part 1: How UltraFast uses FROST and why

UltraFast accepts native deposits from external chains without wrapped-token intermediaries (§10). The validator set jointly controls a vault address on each foreign chain via a threshold signature scheme; signing requires a `2f+1` stake-weighted quorum, matching the consensus safety bound. FROST is the protocol of choice for every cryptographic regime that exposes a Schnorr or EdDSA verification surface: Bitcoin Taproot, Solana, and Cosmos Ed25519. The companion scheme DKLs23 covers ECDSA secp256k1 corridors (legacy Bitcoin, Ethereum, all EVM-L2s); CGGMP21 is held as an audited ECDSA fallback (§10.1).

**Role.** FROST is wrapped in ROAST (Robust Asynchronous Schnorr Threshold signatures) for guaranteed liveness under asynchronous network conditions and disruptive signers. The reference implementation is `ZcashFoundation/frost` in Rust (§10.1). The same TSS layer is what makes UltraFast's bridge architecture stake-weighted at the cryptographic layer rather than only at the accountability layer: validator $i$ runs $\lceil s_i / u \rceil$ FROST keyshares, where $s_i$ is bonded UFAST and $u$ is the share-unit parameter calibrated to bound key-rotation cost (§10.1). Spending any output requires keyshares whose corresponding stake sums to at least `2f+1` of total bonded stake.

**Why FROST specifically.** Three properties matter. First, it is post-TSSHOCK. The Verichains Black Hat 2023 attack class targeted ECDSA `tss-lib` derivatives (GG18, GG20, and many CGGMP21 implementations); FROST's Schnorr construction was unaffected. The whitepaper explicitly excludes GG18/GG20 (used by THORChain and the original Multichain) for new deployments (§10.1, §14). Second, FROST supports identifiable abort: protocol deviation is publicly attributable to a specific validator, enabling automated on-chain slashing under §13.4's TSS-deviation row. Third, the virtual-share construction tolerates the stake-weighted multi-share-per-validator pattern UltraFast needs, and Pedersen DKG with verifiable secret sharing (§10.2) generates keys with no trusted dealer.

**Rotation model.** Per epoch, UltraFast generates a fresh FROST wallet on each foreign chain rather than resharing the existing key in place. New deposits route to the new address; the old wallet sweeps into the new one over a bounded window, then retires. This is the tBTC v2 pattern, chosen over CHURP/D-FROST dynamic proactive secret sharing on the grounds that it sidesteps DPSS complexity and bounds the lifetime and custodied value of any single wallet (§10.3).

**Performance budget.** §13.3 sizes the validator set to TSS performance: FROST sign at $n = 100$ measures at roughly 150–300 ms over WAN.

**Closest production analog.** Chainflip - 150 PoS validators, FROST across Bitcoin, Ethereum, Solana, Polkadot, and Arbitrum vaults - is the closest architectural reference UltraFast names (§10.7, §15).

**Open decision.** Whether to ship the mixed protocol set (FROST + ROAST for Schnorr regimes, DKLs23 for ECDSA) or to standardise on a single universal scheme - including a "FROST-only with ECDSA pre-signature gateway" variant - is open in §16. The Phase 0 walking-skeleton (§16.1) validates FROST TSS for Bitcoin Taproot deposits and withdrawals end-to-end on a four-validator testnet; this is one of the four highest-risk integrations exercised before Phase A hardening.

## Part 2: Deep research on FROST

### Origin and protocol shape

FROST was introduced by Chelsea Komlo (University of Waterloo) and Ian Goldberg in the paper *FROST: Flexible Round-Optimized Schnorr Threshold Signatures* at Selected Areas in Cryptography (SAC) 2020. The IACR ePrint version is 2020/852. The motivation was that previous Schnorr threshold protocols with strong liveness required at least three rounds of signing and did not support concurrent sessions safely, while applications wanted a two-round protocol with an optional pre-processing stage.

Concretely, FROST splits a Schnorr private key $x$ via Shamir secret sharing across $n$ participants such that any $t$-of-$n$ subset can jointly produce a Schnorr signature verifiable under the single public key $X = g^x$. Signing is two rounds:

1. **Commit.** Each participant in the signing set generates two nonces $(d_i, e_i)$, computes commitments $(D_i, E_i) = (g^{d_i}, g^{e_i})$, and publishes the pair.
2. **Sign.** Given the message $m$ and the set of commitments, each participant computes a binding factor $\rho_i = H(i, m, \{(D_j, E_j)\})$, derives a per-signer nonce $D_i \cdot E_i^{\rho_i}$, aggregates these into the group nonce $R$, computes its partial signature $z_i = d_i + e_i \rho_i + \lambda_i \cdot x_i \cdot c$ where $c = H(R, X, m)$ and $\lambda_i$ is the Lagrange coefficient, and sends $z_i$ to the aggregator.

The aggregator sums the $z_i$ into $z$ and outputs the standard Schnorr signature $(R, z)$, indistinguishable from one produced by a single signer holding $x$. Commitments may be pre-generated and stored, collapsing the online cost to a single round.

### Variants: FROST1, FROST2, FROST3

The literature now distinguishes three variants. FROST1 is Komlo and Goldberg's original protocol, secure under a non-standard heuristic argument and a variant of Pedersen DKG with proofs (PedPoP). FROST2 simplifies the binding-factor computation. FROST3, due to Ruffing, Ronge, Schneider-Bensch, Jin, and Schröder, aggregates protocol messages before broadcasting to signers, yielding significant bandwidth savings in the pre-processing phase; FROST3 is the variant Olaf (Crites, Komlo, Maller) proves unforgeable in the random oracle model under the algebraic one-more discrete logarithm (AOMDL) assumption, combined with a Pedersen-style DKG.

### Standardisation

IETF RFC 9591, *The Flexible Round-Optimized Schnorr Threshold (FROST) Protocol for Two-Round Schnorr Signatures*, was published in June 2024 by D. Connolly, C. Komlo, I. Goldberg, and C. A. Wood. It is a product of the Crypto Forum Research Group (CFRG) in the IRTF and is informational rather than Standards Track. The RFC specifies ciphersuites instantiating FROST over several prime-order groups paired with cryptographic hash functions, including ristretto255/SHA-512, P-256/SHA-256, secp256k1/SHA-256, and ed25519/SHA-512 (the last yielding signatures compatible with RFC 8032 EdDSA verifiers).

### Reference implementations

`ZcashFoundation/frost` is the most widely used implementation. It is written in Rust, conforms to RFC 9591, and reached v1.0.0 stable in 2024 after a full audit by NCC Group. The v2.0.0 release of `frost-core` extends the API. Sibling crates implement the standardised ciphersuites: `frost-secp256k1`, `frost-ed25519`, `frost-ristretto255`, `frost-p256`. `frost-rerandomized` adds an unlinkable variant required by Zcash's Sapling and Orchard spend-authorisation signatures. `ZcashFoundation/frost-tools` provides `frostd` (a coordinator server) and `frost-client` (CLI).

Other implementations exist in Rust (`lit-protocol/lit-frost`), Go (`mkhattat/frost`, used in research code), and other languages, though the Zcash Foundation crate is the de facto reference. `BlockstreamResearch/bip-frost-dkg` is a Python reference for ChillDKG - a Pedersen-DKG variant with identifiable aborts targeted for use with FROST in Bitcoin contexts. `nickfarrow/roast` provides a ROAST wrapper around FROST in Rust.

### Production users

- **Zcash.** FROST-rerandomized signs spend-authorisation signatures for the Sapling and Orchard shielded pools. The Threshold Shielded Signing Kit (TSSK) is the user-facing FROST-powered multisig product.
- **Chainflip.** 150-validator permissionless cross-chain swap network. FROST is used for aggregate keys controlling vaults on Bitcoin, Ethereum, Solana, Polkadot, and Arbitrum at a 100-of-150 threshold. Chainflip publicly documents the choice as a move away from GG20-class ECDSA TSS.
- **Spark (Lightspark).** Bitcoin scaling protocol using FROST threshold signatures for distributed key generation as a core architectural component.
- **Other.** Various Bitcoin-adjacent infrastructure projects use FROST or ROAST-wrapped FROST for multisig and federation-style custody, including projects building on Taproot's Schnorr verification path.

### DKG, identifiable abort, and ROAST

FROST itself defines the threshold signing protocol but not key generation. The standard pairing is Pedersen DKG with verifiable secret sharing, modified by Komlo and Goldberg to include a Schnorr proof of knowledge of each participant's secret in the first round (preventing rogue-key attacks). FROST is designed with an abort-on-misbehaviour model: a misbehaving participant is identified and excluded out of band rather than tolerated within a single signing session. This is the property UltraFast uses for the §13.4 slashing schedule: "TSS protocol deviation (malformed shares, wrong messages)" is detected via FROST/ROAST identifiable abort and triggers a hard slash scaled to attempted theft.

ROAST (Ruffing, Ronge, Jin, Schneider-Bensch, Schröder; CCS 2022) wraps FROST to deliver guaranteed liveness under asynchronous networks and up to $t-1$ disruptive signers. The construction starts multiple FROST sessions in parallel through a semi-trusted coordinator and guarantees that a quorum of honest signers obtains a valid signature in bounded time even under adversarial network latency. The published benchmark - 67 honest signers producing a signature within seconds in a 67-of-100 setup with 33 malicious signers - is the basis for UltraFast's §13.3 latency budget.

### Security posture

FROST and its variants are proven secure in the random oracle model. FROST2 and FROST3 require the algebraic one-more discrete logarithm (AOMDL) assumption; FROST1's argument was heuristic. Sparkle (Crites, Komlo, Maller, CRYPTO 2023) is a contemporary alternative proven secure under standard assumptions at the cost of an additional round; subsequent analysis has noted gaps in some of Sparkle's proof steps. For practical deployment, FROST3 with Pedersen DKG (Olaf scheme) is the strongest available combination as of late 2025.

The TSSHOCK attack class (Verichains, Black Hat USA 2023) does **not** apply to FROST. The three key-extraction attacks demonstrated by Nguyen et al. targeted GG18, GG20, and many CGGMP21 implementations - all ECDSA threshold protocols - and exploited the Paillier-based range proofs and zero-knowledge sub-protocols specific to that lineage. Affected libraries included Axelar's `tofn`, ING Bank's `threshold-signatures`, and ZenGo X's `multi-party-ecdsa`. FROST has no analogous sub-protocol; its security reduction is to discrete-log-type assumptions in a prime-order group. This is the reason UltraFast pairs FROST for Schnorr corridors with the post-TSSHOCK DKLs23 (Doerner-Kondi-Lee-Shelat 2023, Paillier-free) for ECDSA corridors rather than reaching for any GG-family scheme.

A separate denial-of-service vulnerability in the Pedersen DKG component of `ZcashFoundation/frost` was reported and remediated in 2024; the fix shipped in the v1.x line.

### Comparison to alternatives

- **Classical Schnorr threshold (Stinson-Strobl, 2001).** Three rounds, non-concurrent. Superseded by FROST.
- **GG18 / GG20.** ECDSA threshold scheme. Not a Schnorr scheme; vulnerable to TSSHOCK in most published implementations. Excluded by UltraFast.
- **Lindell17.** Two-party ECDSA. Deprecated for `n > 2`.
- **CGGMP21.** Audited ECDSA threshold scheme with identifiable abort; UltraFast retains it as an ECDSA fallback per §10.1.
- **DKLs23.** Three-round, Paillier-free ECDSA TSS; UltraFast's main ECDSA scheme for Bitcoin legacy/SegWit, Ethereum, and EVM-L2s.
- **Sparkle / Sparkle+.** Newer Schnorr TSS with standard-model security at the cost of an extra round; not yet as widely audited or implemented as FROST.
- **ROAST.** Not a separate scheme but a liveness wrapper around FROST.

### Status as of late 2025

FROST is the modern Schnorr threshold signature. It is standardised (RFC 9591), audited at the reference-implementation level, deployed in production by Zcash and Chainflip, and actively maintained. The FROST3 variant combined with Pedersen DKG (the Olaf scheme) is the current state of the art. For new validator-controlled-vault designs in the Schnorr/EdDSA family, FROST wrapped in ROAST is the default choice; UltraFast adopts this default and treats the working assumption as confirmed pending only the §16 open decision on whether the mixed protocol set or a single-protocol design is the right ship configuration.
