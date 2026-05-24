# DKLs23

Research notes on DKLs23 ("Threshold ECDSA in Three Rounds" - Doerner, Kondi, Lee, Shelat, IEEE S&P 2024), the threshold-ECDSA scheme designated in the UltraFast whitepaper for all secp256k1 corridors (Bitcoin legacy/SegWit, Ethereum, all EVM L2s). Compiled for internal use during the pre-implementation research phase.

---

## Part 1: How UltraFast uses DKLs23 and why

### Role in the architecture

DKLs23 is the ECDSA threshold-signature scheme of UltraFast's validator-operated custody layer (§10). It signs withdrawals from every foreign-chain vault whose source chain uses ECDSA over secp256k1: Bitcoin in its legacy and SegWit (pre-Taproot) output forms, Ethereum mainnet, and every EVM L2 in the corridor set. The protocol-by-curve mapping in §10.1 puts DKLs23 alongside FROST/ROAST on the Schnorr/EdDSA corridors (Bitcoin Taproot, Solana, Cosmos Ed25519). It names CGGMP21 only as a fallback should DKLs23 be displaced by audit or implementation risk. The candidate library is the Rust crate `silence-laboratories/dkls23` (and the lower-level `silent-shard-dkls23-ll`); UltraFast does not plan to fork it.

The custody pattern wrapped around DKLs23 is the same as for FROST. Stake-weighted virtual shares per §10.1: validator $i$ runs $\lceil s_i / u \rceil$ keyshares against share-unit $u$, and any spend requires keyshares whose corresponding stake sums to at least $2f+1$ of total bonded stake. Per-epoch fresh-wallet rotation per §10.3, following the tBTC v2 pattern: new deposits route to a freshly DKG'd address and the old wallet sweeps into it over a bounded window. Protocol-native DKG with no trusted dealer per §10.2.

### Why UltraFast chose it

Four reasons, all stated or implied by §10.1, §13.3, §13.4, and §14:

1. **Post-TSSHOCK lineage.** §10.1 and §13.4 explicitly exclude GG18 / GG20, the `tss-lib` family used by THORChain and the original Multichain bridge. The TSSHOCK class of attacks disclosed by Verichains at Black Hat USA 2023 (10 August 2023) targets that family. DKLs23 descends from an independent research line built on oblivious transfer, not Paillier additively-homomorphic encryption. It is not in scope for TSSHOCK's α-shuffle / c-split / c-guess attacks.
2. **Paillier-free.** CGGMP21, the other major post-TSSHOCK candidate, retains Paillier as its multiplication primitive. Paillier carries a history of subtle parameter-validation bugs (CVE-2023-33241; Fireblocks's BitForge disclosure). It adds dependency surface UltraFast does not want on the hot path of every BTC and ETH withdrawal. DKLs23 replaces Paillier-based multiplication with OT-based multiplication.
3. **DKG speed at $n = 100$.** §13.3 reports DKG-at-$n=100$ measurements of "a few seconds for DKLs23 and tens of seconds for CGGMP21". DKG is the bottleneck of the fresh-wallet rotation model (§10.3). A per-epoch rotation across BTC, ETH, and every EVM L2 vault has to complete in well under a block-time budget. The order-of-magnitude gap is the deciding factor over CGGMP21.
4. **Identifiable abort.** §13.4 enumerates the slashing schedule: malformed shares or out-of-protocol messages are publicly attributable to a specific validator, allowing automated stake-weighted slashing for TSS protocol deviation. DKLs23 satisfies this; GG18/GG20 do not satisfy it cleanly.

### How UltraFast's usage differs from typical usage

Typical DKLs23 deployments (Silence Laboratories' Silent Shard, Vultisig) are $2$-of-$2$ or $2$-of-$3$ wallet TSS for individual or enterprise custody. UltraFast runs DKLs23 at validator-set scale: $n = 30$ at v1 launch (per the §13.3 milestone path), with the share count amplified by stake-weighted virtual shares per §10.1. The threshold is $2f+1$ of stake-weighted share count, not a fixed small constant. This is the same scaling regime as Chainflip (150 PoS validators running FROST across BTC/ETH/SOL/Polkadot/Arbitrum vaults), applied to the ECDSA side of the protocol matrix. The §16 open decision flags the alternative of running a single universal scheme (DKLs23 only, or FROST-only with an ECDSA pre-signature gateway) instead of the mixed FROST + DKLs23 working assumption.

### What is implemented vs not

Nothing is shipped. UltraFast is pre-implementation. Phase 0 (§16.1) wires only FROST TSS for Bitcoin Taproot deposits and withdrawals; DKLs23 lands in a later phase when the Ethereum and EVM-L2 corridors are added. The TSS protocol selection itself is listed as an open decision in §16, with the table in §10.1 as the working assumption rather than a final commitment. The §14 bug-class section flags TSS implementation bugs as a residual risk: TSSHOCK-class, BitForge-class, and the more recent Devious Transfer OT-based attacks. Library hygiene rather than protocol design has to mitigate them.

---

## Part 2: Deep research on DKLs23

### How it works

DKLs23 is a threshold-ECDSA signing protocol with malicious security against a dishonest majority. It UC-realises a standard threshold-signing functionality (information-theoretically, in an ideal-commitment / ideal-two-party-multiplication hybrid model). The headline number is the round count: three rounds for signing, down from five or six in CGGMP21 and the GG-family protocols. With pre-signing pipelined across consecutive signatures, the amortised round count drops to two.

The protocol's distinguishing primitive is **oblivious-transfer-based multiplication**, not Paillier additively-homomorphic encryption. In the GG-family and CGGMP21, the multiplication-to-addition step that converts shared multiplicative inverses into shared additive form runs through a Paillier ciphertext. In DKLs23, it runs through a batch of OT extensions. The OT-based approach was introduced in the same research line in 2018 (DKLS18, the two-party case) and 2019 (DKLS19, the multi-party case). DKLs23 is the round-optimised culmination. It drops the round count by combining message flows and eliminating the zero-knowledge-proof rounds that the earlier OT-based protocols still carried.

The DKG used to set up DKLs23 keys is protocol-specific and does not require a Paillier setup or modulus-validity proof. The shared public key is a standard secp256k1 group element; from any blockchain's point of view a DKLs23-produced signature is indistinguishable from a single-party ECDSA signature. There is no on-chain artefact of the threshold scheme.

The paper is precise about what is and is not proven. The protocol assumes ideal commitment and ideal two-party multiplication. Realising the latter in the standard model (i.e. via a concrete OT extension) is the implementer's responsibility. The security argument is **statistical** in the hybrid model but **computational** once the OT realisation is plugged in. A 2026 follow-on paper ("On the Statistical vs Computational Security of the DKLs23 Multiparty ECDSA Protocol", IACR ePrint 2026/929) sharpens this distinction.

### Available implementations

- **`silence-laboratories/dkls23`** (Rust): the production reference. Silence Laboratories built it for the Silent Shard product, then open-sourced both the high-level `dkls23` crate and the lower-level `silent-shard-dkls23-ll` crate. Also published on crates.io as `sl-dkls23`. This is the implementation §10.1 names by URL.
- **`silence-laboratories/silent-shard-dkls23-ll`**: the underlying library, exposing the OT and multiplication primitives directly.
- **`mpecdsa`**: the academic reference implementation of DKLS19 (the predecessor) by the paper's authors. Not a DKLs23 implementation, but the lineage from which the OT primitives were inherited. Cited by the Fordefi "Devious Transfer" disclosure as one of the three vulnerable OT implementations.
- **Vultisig**: uses a fork / wrapping of the Silence Laboratories implementation for its multi-chain wallet.
- **Utila**: independent enterprise-custody implementation. Blog posts describe their DKLs23 deployment but the code is not open-sourced.

CGGMP21, the explicit fallback in §10.1, has a separate production-quality Rust implementation at `LFDT-Lockness/cggmp21` (formerly `dfns-labs/cggmp21`, donated to Linux Foundation Decentralized Trust in 2024).

### Current status

- **Paper.** Doerner, Kondi, Lee, Shelat, "Threshold ECDSA in Three Rounds." Cryptology ePrint Archive 2023/765, posted 26 May 2023. Presented at IEEE Symposium on Security and Privacy (Oakland) 2024.
- **Audits.** Trail of Bits audited the Silence Laboratories `dkls23` library in October 2023 and published the public report on 10 April 2024 (`ToB-SilenceLaboratories_2024.04.10.pdf`, in the repo's `docs/` directory). The audit reported 15 issues including two high-severity findings: one enabling a key-destruction attack and one with a potential path to key recovery. Silence Laboratories fixed all of them before public disclosure. The Trail of Bits write-up "What we learned reviewing one of the first DKLs23 libraries from Silence Laboratories" (10 June 2025) is the public retrospective.
- **Production deployment.** Silent Shard (Silence Laboratories' product) ships in production. MetaMask Institutional has integrated Silence Laboratories TSS. Vultisig is a consumer wallet built on a DKLs23 derivative. Utila and Copper are reportedly running DKLs23 in enterprise custody, though specific protocol attribution is not always publicly confirmed. Fireblocks, BitGo, and Coinbase Custody have ECDSA TSS in production but the public information does not confirm which family their current deployments use. Fireblocks publicly documented its move off GG-family after the TSSHOCK and BitForge disclosures.
- **Follow-on research.** "On the Statistical vs Computational Security of the DKLs23 Multiparty ECDSA Protocol" (ePrint 2026/929) clarifies the security model boundary.

### TSSHOCK context and the OT-based bug class

Two separate disclosure waves frame DKLs23's security narrative:

The first wave is **TSSHOCK** (Verichains, Black Hat USA, 10 August 2023). The α-shuffle, c-split, and c-guess attacks extract private keys from GG18, GG20, and (the CCS 2020 conference version of) CGGMP21. They work by exploiting the way `tss-lib` and its derivatives validated Paillier parameters and zero-knowledge proofs. The attacks require no protocol abort and leave no trace. Verichains began reporting in December 2022; the public disclosure in August 2023 was coordinated with affected projects.

CVE-2023-33241 is the GG18/GG20 Paillier-key vulnerability. Fireblocks's separate BitForge disclosure covers an overlapping but distinct class against the same family. The fix surface is implementation-specific (input validation, ZK-proof reconstruction) and the protocol authors of CGGMP21 published an updated paper that closes the analytical gap. **DKLs23 is not in TSSHOCK's scope**. It descends from the Doerner / Kondi / Lee / Shelat line, predates the Paillier-based GG family in its multiplication design, and uses OT rather than Paillier in the part of the protocol TSSHOCK exploits.

The second wave is the **Devious Transfer** disclosure (Fordefi cryptography team, July 2024). Fordefi found key-extraction vulnerabilities in three OT-based threshold-ECDSA implementations: `mpecdsa` (the academic DKLS19 reference, exploitable by an **active** adversary), `sl-crypto` (the Silence Laboratories DKLs23 implementation, exploitable by a **passive** adversary), and `docknetwork/crypto` (a separate cryptographic library). The class of bug is OT-extension correctness: a malformed or under-validated OT extension can leak a party's secret state across signing sessions. All three implementations patched.

The disclosure makes the same point the Trail of Bits review makes: OT-based protocols carry their own implementation-bug class, distinct from Paillier's bug class but not absent. §14 of the UltraFast whitepaper covers this. The mitigation for TSSHOCK-class bugs is library hygiene (use only audited libraries, never fork, run independent audits before mainnet), not protocol design.

### Comparison to alternatives

- **GG18 / GG20 (Gennaro-Goldfeder 2018/2020).** The original `tss-lib` family. Used in production by THORChain, the original Multichain bridge, and many early MPC custodians. Killed for new deployments by TSSHOCK and BitForge. UltraFast §10.1 explicitly excludes it.
- **CGGMP21 (Canetti, Gennaro, Goldfeder, Makriyannis, Peled, ACM CCS 2020 / ePrint 2021/060).** Paillier-based, six rounds, identifiable abort, UC non-interactive proactive variant. The post-TSSHOCK reference for Paillier-based threshold ECDSA, audited 2024–25, available in Rust at `LFDT-Lockness/cggmp21`. UltraFast §10.1 designates it as the ECDSA fallback. Slower DKG at $n=100$ (tens of seconds vs DKLs23's few seconds, per §13.3) and carries Paillier dependency surface.
- **Lindell17.** Two-party threshold ECDSA, also Paillier-based. Limited to $n=2$ and so unsuitable for a $30$-validator vault. Used by some 2-of-2 wallet products.
- **DKLS18 / DKLS19.** Predecessor protocols in the same research line; OT-based but with more rounds. DKLS19 is the protocol the Fordefi `mpecdsa` finding hits.
- **KU23, Doerner-Kondi-Lee-Shelat 2024+ continuations.** Successor research aimed at further round and bandwidth optimisation. Not yet at the production-implementation stage of DKLs23.

### Security caveats relevant to UltraFast

1. **OT realisation is implementer's responsibility.** The protocol's UC proof is in an ideal-OT hybrid model. The concrete OT extension chosen, and its parameter validation, are the implementation's job and the locus of the Devious Transfer bug class.
2. **DKG is not the same code path as signing.** Audit coverage on the DKG is typically thinner than on signing because signing dominates production traffic; UltraFast's per-epoch fresh-wallet rotation (§10.3) puts DKG on the hot path.
3. **Identifiable abort is per-message, not per-session.** A validator can deviate at one round and abort to force a re-run. UltraFast's slashing schedule (§13.4) has to handle the difference between a one-shot deviation and a sustained liveness fault.
4. **Library hygiene.** §14 commits to using `silence-laboratories/dkls23` unforked and requiring an independent cryptographic audit before mainnet. The Trail of Bits 2024 audit covers an earlier snapshot; a fresh audit on the version shipped is the standing requirement.

### Sources

- Doerner, Kondi, Lee, Shelat. "Threshold ECDSA in Three Rounds." IACR ePrint 2023/765, May 2023. IEEE S&P 2024. https://eprint.iacr.org/2023/765
- Silence Laboratories. `silence-laboratories/dkls23` (Rust). https://github.com/silence-laboratories/dkls23
- Silence Laboratories. `silent-shard-dkls23-ll`. https://github.com/silence-laboratories/silent-shard-dkls23-ll
- Trail of Bits. "What we learned reviewing one of the first DKLs23 libraries from Silence Laboratories." 10 June 2025. https://blog.trailofbits.com/2025/06/10/what-we-learned-reviewing-one-of-the-first-dkls23-libraries-from-silence-laboratories/
- Trail of Bits audit report: `dkls23/docs/ToB-SilenceLaboratories_2024.04.10.pdf` (in the repo).
- Verichains. "TSSHOCK: New Key Extraction Attacks on Threshold Signature Scheme." Black Hat USA, 10 August 2023. https://verichains.io/tsshock/
- CVE-2023-33241 (GG18 / GG20 Paillier key vulnerability). https://github.com/advisories/GHSA-5cjx-95fx-68q9
- Fireblocks. "GG18 and GG20 Paillier Key Vulnerability: Technical Report" (BitForge). https://www.fireblocks.com/blog/gg18-and-gg20-paillier-key-vulnerability-technical-report
- Fordefi cryptography team. "Devious Transfer: Breaking Oblivious Transfer-Based Threshold ECDSA." July 2024. https://blog.fordefi.com/devious-transfer-breaking-oblivious-transfer-based-threshold-ecdsa
- "On the Statistical vs Computational Security of the DKLs23 Multiparty ECDSA Protocol." IACR ePrint 2026/929. https://eprint.iacr.org/2026/929
- Canetti, Gennaro, Goldfeder, Makriyannis, Peled. "UC Non-Interactive, Proactive, Threshold ECDSA with Identifiable Aborts" (CGGMP21). ACM CCS 2020 / ePrint 2021/060.
- `LFDT-Lockness/cggmp21` (Rust). https://github.com/LFDT-Lockness/cggmp21
- Doerner, Kondi, Lee, Shelat. "Secure Two-Party Threshold ECDSA from ECDSA Assumptions" (DKLS18). IACR ePrint 2018/499.
- Doerner, Kondi, Lee, Shelat. "Threshold ECDSA from ECDSA Assumptions: The Multiparty Case" (DKLS19). IEEE S&P 2019.
- Vultisig DKLs23 documentation. https://docs.vultisig.com/threshold-signature-scheme/threshold-signature-schemes-used-by-vultisig/how-dkls23-works
- DKLs.info project page. https://dkls.info/
