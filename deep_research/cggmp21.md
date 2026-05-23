# CGGMP21

Research notes on CGGMP21 — "UC Non-Interactive, Proactive, Threshold ECDSA with Identifiable Aborts" — referenced in the UltraFast whitepaper as the ECDSA fallback TSS protocol in the §10.1 working-assumption table, and as a sizing input in §13.3 and §13.4. Compiled for internal use during the pre-implementation research phase.

---

## Part 1: How UltraFast uses CGGMP21 and why

### Role in the architecture

CGGMP21 appears in UltraFast as the **ECDSA fallback** for secp256k1 corridors — Bitcoin (legacy and SegWit), Ethereum L1, and every EVM L2 — sitting alongside DKLs23, which is the working-assumption primary ECDSA protocol per the §10.1 TSS-per-curve table. The fallback designation has a specific meaning: if Phase-0 benchmarking or audit review surfaces a problem with the chosen DKLs23 implementation (`silence-laboratories/dkls23`), or if a future implementation-class incident takes that library out of the trusted set, CGGMP21 — via `LFDT-Lockness/cggmp21` — is the pre-vetted swap-in. The two are listed in the same table row family for that reason: same curve, same threshold-ECDSA problem, different cryptographic constructions and different operational profiles.

CGGMP21 also defines the upper bound on the §13.3 validator-set sizing exercise. The whitepaper records "FROST sign at $n = 100$ measures at ~150–300 ms over WAN; DKG at $n = 100$ measures at a few seconds for DKLs23 and **tens of seconds for CGGMP21**." The DKG cost ratio between the two ECDSA protocols at $n=100$ is the single biggest reason the table entries are not interchangeable — running CGGMP21 as primary would extend the epoch boundary at which UltraFast generates a new TSS wallet on each foreign chain (§10.3 fresh-wallet rotation) from seconds to a minute-class operation, which forces a wider sweep window and a larger stale-wallet attack surface.

### Why UltraFast lists it at all

Three properties decide the §10.1 inclusion:

1. **Identifiable abort.** Protocol deviation is publicly attributable to a specific validator, which is the §13 slashing prerequisite. Every TSS family the whitepaper admits — FROST/ROAST, DKLs23, CGGMP21 — has this property; GG18/GG20 (used by THORChain and original Multichain) is excluded for being post-TSSHOCK [31] and not for missing identifiable abort.
2. **UC proof and proactive secret sharing built in.** CGGMP21 is universally composable under standard assumptions (strong RSA, DDH, Paillier), withstands adaptive corruption, and ships proactive refresh in the same protocol — which matches UltraFast's §10.3 fresh-wallet rotation model and the §13.4 slashing schedule's assumption that share refresh can run on a cadence independent of DKG.
3. **Audited Rust implementation under a Linux-Foundation-hosted umbrella.** `LFDT-Lockness/cggmp21` was audited by Kudelski Security with the report committed to the repository, and is now part of Lockness under LF Decentralized Trust governance. The audit and the foundation governance make it the working assumption for an ECDSA fallback that has to survive enterprise legal review at custody onboarding.

### What is different from typical usage and what is open

CGGMP21 is usually deployed by custody platforms (Fireblocks's MPC-CMP, Dfns, Taurus) as the **primary** ECDSA scheme in a 2-of-3 or small-$n$ configuration — exactly the regime where Paillier overhead is dominated by network latency and DKG cost is a one-off. UltraFast's regime is the opposite: $n \approx 30$ at launch with a milestone path to ~100, frequent epoch-bounded re-DKGs against multiple foreign chains, and a hard latency target on the bridge signing path. That changes the constants enough that DKLs23 wins the working-assumption slot and CGGMP21 takes the fallback slot.

Open in §16: the TSS-protocol-selection decision is explicitly named as unresolved — "mixed (FROST/ROAST + DKLs23, working assumption) versus single-protocol universal scheme versus FROST-only with ECDSA pre-signature gateway." CGGMP21 sits inside the mixed-protocol option as the ECDSA arm's backup.

Status: pre-implementation. Nothing is deployed; the Phase 0 walking-skeleton (§16.1) exercises only FROST TSS for Bitcoin Taproot. DKLs23 and CGGMP21 are both queued for Phase-1 ECDSA-corridor bring-up.

---

## Part 2: Deep research on CGGMP21

### Paper and provenance

CGGMP21 is the protocol introduced by Ran Canetti, Rosario Gennaro, Steven Goldfeder, Nikolaos Makriyannis, and Udi Peled in "UC Non-Interactive, Proactive, Threshold ECDSA with Identifiable Aborts", ACM CCS 2020 (DOI: 10.1145/3372297.3423367). The full version is Cryptology ePrint Archive Paper 2021/060, which is the canonical reference because the conference version is condensed and several of the proofs and the proactive-refresh construction only appear in full there. The naming convention follows the authors' surnames plus the year of the full ePrint version, which is the convention the implementation ecosystem has settled on; the conference version is sometimes called "CGGMP" without a year.

The paper is the second in a line by overlapping author sets. It improves on the earlier Canetti-Gennaro-Goldfeder-Makriyannis-Peled CCS '20 paper ("UC Non-Interactive, Proactive, Threshold ECDSA"), and that paper in turn builds on Gennaro-Goldfeder CCS '18 (GG18) and Lindell-Nof CCS '18. CGGMP21 is best understood as the version that adds **identifiable abort** to the earlier UC-secure non-interactive proactive ECDSA construction.

### How it works

The protocol is a threshold ECDSA scheme over secp256k1 (and any curve with sufficiently large prime order; secp256k1 is the universally deployed instantiation) built on the following primitives:

- **Paillier additive homomorphic encryption** for the secret multiplication step. Threshold ECDSA reduces, fundamentally, to computing $k \cdot x$ across shares without reconstructing $k$ or $x$; the Paillier route — used by GG18, GG20, and CGGMP21 — is one of the two classical families, the other being oblivious transfer (used by DKLs23 and predecessors). Paillier brings ciphertext expansion and modular-exponentiation cost; it pays for itself in protocol structure because the addition-homomorphic property collapses what would otherwise be multi-round OT extensions into a small fixed number of rounds plus zero-knowledge proofs.
- **Zero-knowledge range proofs** on the Paillier ciphertexts, which are how identifiable abort is realised. Every party publishes ZK proofs that its contribution lies in the correct range and was computed correctly; a failed proof identifies the specific deviating party and produces transferable evidence usable by the §13 slashing module.
- **Paillier-Blum modulus proofs** that the Paillier modulus is well-formed. This is the proof that has had implementation problems historically — the original CGGMP21 paper omitted one of the required soundness checks in the proof description, and the corresponding implementation bug is part of the vulnerability surface discussed below.
- **Distributed key generation** that produces an additively-shared secret with no dealer; the public key is reconstructed by the parties from broadcast share commitments.
- **Proactive refresh** that rotates the additive shares while preserving the public key. Two corruptions in different epochs cannot be combined to reconstruct the secret; this is the "proactive" half of the paper title.

The protocol exposes **two signing variants**:

- **4-round online (interactive) signing**, where all four rounds happen after the message is known. This is closer in shape to GG18/GG20 and is the simpler deployment.
- **3+1-round non-interactive signing with presignatures**, where 3 rounds of preprocessing run before the message is known and produce a presignature, and a single online round finishes the signing once the message arrives. The full paper also discusses a 7-round variant (6 preprocessing + 1 online) that exposes more identifiable-abort information at the cost of more rounds. The 3+1/4-round split is what the Lockness Rust implementation ships; the Taurus Go implementation ships both the 4-round online and the 7-round presigning variants.

The presignature mode is the one that makes CGGMP21 attractive operationally: signing latency on the critical path is one network round-trip plus local computation, and the heavy Paillier work is amortised offline.

### Implementations

- **`LFDT-Lockness/cggmp21` (Rust).** Originally developed at Dfns by Denis Varlakov (lead) with Jonathan Katz as scientific advisor, open-sourced 2024 under MIT/Apache-2.0, contributed to the Linux Foundation Decentralized Trust as part of the Lockness project on 16 September 2024. The Lockness contribution included eight related crates: `round-based`, `generic-ec`, `fast-paillier`, `cggmp21`, `stark-curve`, `slip-10`, `udigest`, and `generic-ec-zkp`. Audited by Kudelski Security; the audit report is committed to the repository. The implementation supports DKG, the 3+1-round signing path, key refresh, identifiable abort, and SLIP-10 HD-wallet derivation. A successor crate `cggmp24` exists with a tightened API following the 2025 vulnerability fixes (see below).
- **`taurushq-io/multi-party-sig` (Go),** previously `taurusgroup/multi-party-sig` and `taurusgroup/cmp-ecdsa`. Implements both the 4-round online and 7-round presigning variants with identifiable abort. Apache-2.0. The repository ships a disclaimer that further testing and auditing is required before production use; this is the closest thing to a reference Go implementation but it is not the recommended production candidate.
- **`entropyxyz/synedrion` (Rust).** A separate Rust implementation by Entropy.
- **Fireblocks MPC-CMP.** Closed-source enterprise implementation; announced May 2020 as the production CGGMP variant. Fireblocks is the largest publicly identified production deployment.
- **Dfns.** Production use of the Lockness library for ECDSA signing keys, alongside their own KU23 protocol for the bulk of customers per their public disclosures.

### Current security status (as of 2026-05)

The protocol is mature on paper; the **implementations have had a non-trivial vulnerability history** that any new adopter has to track.

**CVE-2025-66017 / RUSTSEC-2025-0128 ("CGGMP21 presignatures can be used in a way that significantly reduces security"),** disclosed late 2025, affecting `cggmp21` versions through 0.6.3 and `cggmp24` 0.7.0-alpha.1. Two distinct attack vectors:

1. **HD-wallet derivation-path malleability.** `Presignature::set_derivation_path` allowed the SLIP-10 derivation path to be changed after presignature creation, which a malicious participant could exploit to weaken the effective security level of derived keys.
2. **Raw-hash signing → signature forgery.** `Presignature::issue_partial_signature` accepted a pre-hashed message without binding to the original message, allowing an attacker to craft a scalar that produces a valid signature on a different message of their choice.

Fixed in `cggmp24` 0.7.0-alpha.2 with API changes that prevent presignatures from being used insecurely. The patch is the reason Lockness now ships `cggmp24` as the recommended branch alongside the audited-but-frozen `cggmp21`.

**Earlier Paillier-Blum modulus ZK proof issue.** The original CGGMP21 paper omitted a required check in the Paillier-Blum modulus ZK proof description, which propagated into multiple implementations before being identified and patched. Dfns has written about both this and the CVE-2025-66017 vector in their CGGMP21-vulnerabilities post.

**TSSHOCK class.** The Verichains TSSHOCK disclosures at Black Hat USA 2023 documented key-extraction attacks across many `tss-lib` derivatives implementing GG18/GG20/CGGMP21. The whitepaper's §10.1 statement that GG18/GG20 are excluded is direct: those families are too compromised to ship. CGGMP21 implementations have generally been patched against the TSSHOCK class but the lesson is that audit is necessary and not sufficient — implementation-class risk in this family is real and is the reason §16 keeps the TSS-selection decision open.

### Comparison to alternatives

- **DKLs23 (`silence-laboratories/dkls23`, IEEE S&P 2024, ePrint 2023/765).** Three-round, OT-based, **Paillier-free**. DKG measures at a few seconds at $n=100$ versus tens of seconds for CGGMP21 per §13.3. Security rests on the same assumptions as ECDSA itself rather than on strong RSA + DDH + Paillier, which is a meaningful trust-model simplification. Smaller code surface for the underlying primitives. Trade-off: younger protocol, fewer enterprise deployments, less battle-testing. UltraFast's working-assumption choice for ECDSA primary.
- **GG18 / GG20.** Paillier-based, the direct predecessors of CGGMP21. Excluded by §10.1 because of the TSSHOCK-class implementation attacks against `tss-lib` derivatives. Conceptually CGGMP21 is a strict improvement: it adds identifiable abort and a UC proof, and the paper resolves several issues identified in GG20.
- **Lindell17.** Two-party only; not applicable at UltraFast's $n \approx 30$.
- **FROST / ROAST.** Schnorr, not ECDSA. Used by UltraFast on the Ed25519 and Schnorr corridors (Bitcoin Taproot, Solana, Cosmos), not the secp256k1-ECDSA corridors. Linear structure makes FROST cheaper than CMP per the Taurus implementation note; CGGMP21 does not compete with FROST on the same curves.

### What CGGMP21 buys UltraFast that DKLs23 does not

- Longer production track record (Fireblocks MPC-CMP since 2020, Dfns, Taurus, and several enterprise custody platforms).
- Identifiable abort in two configurable strengths (3+1-round vs 7-round), letting the slashing layer trade rounds for finer-grained attribution.
- Proactive refresh as a first-class protocol component rather than a separate construction layered on top.
- A Linux-Foundation-governed Rust implementation with a published Kudelski audit report.

### What CGGMP21 costs UltraFast that DKLs23 does not

- Paillier ciphertexts and Paillier-Blum proofs make every signing round heavier. Signature material during refresh phases is larger.
- DKG at $n=100$ runs in tens of seconds, not seconds. This is the §13.3 limit and the reason CGGMP21 is the fallback rather than the primary.
- The Paillier stack is the source of every implementation-class vulnerability in the GG18/GG20/CGGMP21 line including TSSHOCK and the Paillier-Blum modulus issue. The attack surface is wider than DKLs23's OT-based stack.
- Code-base churn: the active branch as of mid-2026 is `cggmp24`, post the CVE-2025-66017 fixes; depending on the audited `cggmp21` branch means freezing on a known-but-patched vintage, while depending on `cggmp24` means re-auditing the API-changed successor.

### Implications for UltraFast

- The §10.1 fallback designation is correct on the merits: DKLs23 is the lower-latency, lower-attack-surface primary for a chain that re-DKGs frequently; CGGMP21 is the conservative-second-choice with the deeper enterprise track record.
- Library-hygiene policy from §16 applies tightly: pin to the audited Lockness release, do not fork, track CVEs against `cggmp21` and `cggmp24`, re-audit on any major version bump. The CVE-2025-66017 episode is the worked example.
- Validator-set milestone math from §13.3 binds: any growth past $n \approx 100$ in a regime where CGGMP21 has been promoted from fallback to primary forces a hard look at epoch-rotation cadence, because tens-of-seconds DKG at every epoch boundary across every foreign-chain vault is a meaningful operator-side load that does not show up in single-corridor benchmarks.
- The implementation-class history is the strongest single argument for keeping the §16 TSS-selection decision open rather than locking in.

---

## Sources

- Canetti, R., Gennaro, R., Goldfeder, S., Makriyannis, N., and Peled, U. "UC Non-Interactive, Proactive, Threshold ECDSA with Identifiable Aborts." ACM CCS 2020. DOI: 10.1145/3372297.3423367. Full version: Cryptology ePrint Archive, Paper 2021/060, `https://eprint.iacr.org/2021/060`.
- `LFDT-Lockness/cggmp21` repository, `https://github.com/LFDT-Lockness/cggmp21`. Kudelski Security audit report committed to `docs/audit_report.pdf`.
- LF Decentralized Trust. "Lockness: A new home for trusted key cryptography." 16 September 2024. `https://www.lfdecentralizedtrust.org/blog/lockness-a-new-home-for-trusted-key-cryptography`.
- Dfns. "CGGMP21 In Rust, At Last." `https://www.dfns.co/article/cggmp21-in-rust-at-last`.
- Dfns. "CGGMP21 Vulnerabilities Patched and Explained." `https://www.dfns.co/article/cggmp21-vulnerabilities-patched-and-explained`.
- GitHub Security Advisory GHSA-8frv-q972-9rq5 / CVE-2025-66017 / RUSTSEC-2025-0128. "cggmp24 and cggmp21 are vulnerable to signature forgery through altered presignatures." `https://github.com/advisories/GHSA-8frv-q972-9rq5`, `https://rustsec.org/advisories/RUSTSEC-2025-0128.html`.
- `taurushq-io/multi-party-sig` repository, `https://github.com/taurushq-io/multi-party-sig`.
- Doerner, J., Kondi, Y., Lee, E., and Shelat, A. "Threshold ECDSA in Three Rounds" (DKLs23). IEEE S&P 2024. Cryptology ePrint 2023/765, `https://eprint.iacr.org/2023/765`.
- Verichains. "TSSHOCK: New Key Extraction Attacks on Threshold Signature Scheme (TSS)." Black Hat USA 2023. `https://verichains.io/tsshock/`.
- TÜBİTAK BİLGEM Blockchain Laboratory. "A Comparative Examination of Some Threshold ECDSA Protocols Used in Custody."
- Fireblocks. "Announcing the Fireblocks MPC-CMP Protocol" (MPC-CMP / CGGMP), May 2020.
- UltraFast whitepaper, `whitepaper.md`, §§10.1, 10.3, 10.4, 13.3, 13.4, 16.
