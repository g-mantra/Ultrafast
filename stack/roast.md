# ROAST

Research notes on ROAST (Robust Asynchronous Schnorr Threshold Signatures), the robustness wrapper UltraFast applies on top of FROST for Schnorr / Ed25519 corridor TSS custody (whitepaper §10.1, with related references in §10.7, §13.4, and §16). Compiled for internal use during the pre-implementation research phase.

---

## Part 1: How UltraFast uses ROAST and why

### Role in the architecture

ROAST sits one layer above FROST in the §10.1 TSS protocol table. FROST [13] handles the threshold Schnorr / EdDSA signing primitive itself - Pedersen DKG for keygen, two-round semi-interactive sign, identifiable abort on protocol deviation. ROAST [14] wraps that primitive as a coordinator-level robustness shim. The signing protocol completes even when some validators in the chosen signing set go silent, time out, or actively misbehave. In the §10.1 table ROAST is listed only for the Schnorr / EdDSA family: Bitcoin Taproot, Solana, and Cosmos Ed25519 vaults. The ECDSA corridor (Ethereum, EVM-L2s) uses CGGMP21 [18] instead, which has its own internal identifiable-abort handling and does not need a separate wrapper.

The wrapper is invoked any time the BTC, SOL, or Cosmos vault has to sign - sweeping deposits, paying out withdrawals, executing epoch-boundary wallet rotation under the tBTC v2 pattern of §10.3, or sweeping a retiring vault into the new one. The §13.4 slashing schedule relies on FROST / ROAST's identifiable-abort property. A validator that deviates from the protocol is publicly attributable and gets hard-slashed scaled to attempted theft. A validator that merely refuses to participate gets soft-slashed on quorum timeout, escalating with repetition. Both paths require the underlying signing protocol to attribute deviation correctly, which is FROST's job; ROAST's job is to make sure honest signers still produce a valid signature in the meantime.

### Why UltraFast chose this composition

Three reasons.

First, validator-set churn. UltraFast's bridge custody is bonded-validator-operated, not a fixed multisig (§10). The signer set turns over on roughly the consensus cadence, and an arbitrary subset of validators can be offline at any given moment - network partition, hardware failure, version-upgrade churn, ordinary operational noise. Vanilla FROST requires every member of the chosen signing subset to complete the protocol honestly; one straggler stalls the whole signature. For a custody layer that must remain liveness-capable to process withdrawals on a continuous basis that's not acceptable. ROAST trades off some communication overhead for the guarantee that signing completes as long as enough honest signers exist in the broader set.

Second, slashing integration. The §13.4 hard-slash row depends on identifiable abort holding through the wrapped protocol, not just inside the inner FROST round. ROAST's design preserves identifiable abort. Signers that abort are excluded from the next parallel session, and the underlying FROST abort evidence is retained for accountability. The wrapper does not blur attribution.

Third, ecosystem precedent. Chainflip [35] is the closest production architectural reference (§10.7): a multi-chain FROST-based TSS bridge with 150 PoS validators producing signatures for BTC / ETH / SOL / Polkadot / Arbitrum vaults. It composes FROST with ROAST in exactly this way. Arch Network uses the same FROST + ROAST composition for its Bitcoin-native execution layer. The pattern is not novel research; it is what the post-GG20 Schnorr TSS deployments have converged on.

### What is open

§16 lists "TSS protocol selection" as an open decision: the mixed-protocol stack (FROST / ROAST for Schnorr corridors plus DKLs23 for ECDSA corridors, current working assumption) versus a single universal scheme versus FROST-only with an ECDSA pre-signature gateway. ROAST is the working assumption for the Schnorr side of the mix but is not load-bearing for the overall design. If a future audit cycle prefers a different robustness wrapper or a single-protocol universal scheme, only the §10.1 table cell changes. Nothing is shipped; the Phase 0 walking-skeleton (§16.1) exercises FROST TSS on Bitcoin without yet exercising the ROAST wrapper at scale.

---

## Part 2: ROAST in depth

### The problem

Schnorr threshold signatures had a robustness gap. FROST [13] (Komlo and Goldberg, SAC 2020, standardised as IETF RFC 9591) is a `t`-of-`n` Schnorr threshold scheme with a two-round semi-interactive sign protocol. Round one is a nonce-commitment exchange. Round two is a partial-signature exchange. A coordinator (or any participant) aggregates `t` valid partials into a final Schnorr signature. FROST achieves identifiable abort - any deviation from the protocol by a signer is publicly attributable - and is unforgeable under concurrent signing sessions, but it provides no liveness guarantee. Any of the `t` chosen signers can refuse to send the round-two share, or can send a malformed one, and the session aborts. The honest signers can identify the culprit and start a fresh session with a different subset, but the adversary can repeat the attack: each new session of size `t` may contain a new aborter, and in the worst case the protocol never terminates.

The naive defence - run a separate FROST session for every `t`-sized subset of the `n` signers in parallel - does not scale. The number of subsets is binomial in `n`, and concurrent FROST sessions interact through shared nonces in ways the security proof has to account for. What was needed was a wrapper that runs only a small number of concurrent sessions while still guaranteeing one of them completes.

### The paper

Ruffing, Ronge, Jin, Schneider-Bensch, and Schröder, "ROAST: Robust Asynchronous Schnorr Threshold Signatures," ACM CCS 2022, DOI [10.1145/3548606.3560583](https://doi.org/10.1145/3548606.3560583); IACR ePrint [2022/550](https://eprint.iacr.org/2022/550). Tim Ruffing was at Blockstream at the time; the rest of the authors were at the Chair of Applied Cryptography, Friedrich-Alexander-Universität Erlangen-Nürnberg.

ROAST is presented as a *generic wrapper* rather than a new threshold scheme. It takes any threshold signing protocol that is (i) semi-interactive (two-round, with round one independent of the message), (ii) provides identifiable abort, and (iii) is unforgeable under concurrent signing sessions, and produces a robust asynchronous version of that protocol. FROST satisfies all three preconditions; the paper instantiates ROAST over FROST as its primary contribution.

### How the wrapper works

ROAST adds a semi-trusted coordinator that maintains a *set of pending signers*: signers that have completed a round but not yet been assigned to a new session. The coordinator runs multiple concurrent FROST signing sessions, with the invariant that each signer participates in at most one session at a time. When a signer completes their share of a session, the coordinator piggybacks fresh round-one nonces onto the signature share, immediately enabling that signer to be drafted into a new session without an extra round-trip.

The session-scheduling argument is the cleverness. With `n` signers and threshold `t`, suppose `f = n - t` is the number of aborters the adversary controls. Each aborter can stall at most one session (because of the one-session-per-signer invariant). If the coordinator opens `f + 1` parallel sessions, the aborters can stall at most `f` of them, so at least one session has a fully honest subset and completes. The wrapper therefore needs only `O(n - t + 1)` concurrent sessions in the worst case rather than the binomial blow-up of the naive approach.

The coordinator is semi-trusted in a precise sense: even a fully malicious coordinator cannot forge a signature, because forgery still requires `t` honest FROST partials, which only the actual signers can produce. The coordinator is trusted only for liveness - it decides which signers go into which session and how messages route between them. The paper notes that the coordinator can be run on the same machine as one of the signers. In deployment the coordinator role is typically rotated or run by every validator with the network resolving the ordering separately.

Communication complexity is `O((n - t + 1) · t)` messages in the worst case, with sub-second wall-clock performance demonstrated empirically: the paper reports an 11-of-15 setup across San Francisco and Frankfurt (153 ms one-way latency) completing in under a second, and a 67-of-100 setup completing in ~0.7 s under simulated crashes. ROAST adds latency over plain FROST in proportion to how many sessions need to be opened, but on a happy path with no aborters the wrapper degenerates to a single FROST session plus minimal coordinator overhead.

The asynchronous network model is critical: ROAST does not require synchrony assumptions on message delivery, which matches the threat model of a WAN-deployed validator set. Liveness is guaranteed as long as `f < n` (i.e. at least one honest signer exists in the broader set of `n`, beyond the `t` minimum), which is a strictly weaker assumption than FROST's implicit requirement that the *chosen subset* be fully honest.

### Implementations

The ZcashFoundation/frost Rust crates implement FROST per RFC 9591 and are the reference implementation UltraFast targets per the §10.1 table. A separate ROAST implementation built on top of the Zcash Foundation's FROST cryptography exists at `StackOverflowExcept1on/roast` (Rust), and there is an earlier prototype at `nickfarrow/roast`. Neither ROAST implementation has yet had the same audit treatment as the underlying FROST crates. The Zcash Foundation marks ROAST integration as not-yet-finalised and unaudited as of the latest tracked release. Chainflip ships a production ROAST-over-FROST stack inside its own validator software rather than depending on any of these libraries, and Arch Network similarly maintains its own implementation. For UltraFast the working assumption is to use `ZcashFoundation/frost` as the FROST primitive and to either upstream a coordinator implementation or maintain a thin in-house wrapper, audited before mainnet alongside the rest of the TSS stack (§16).

### Adoption

ROAST is the standard robustness wrapper for production FROST deployments. Chainflip's 100-of-150 FROST setup [35] uses ROAST under the hood, and Trail of Bits's review of Chainflip's FROST implementation explicitly covers the wrapper composition. Arch Network's FROST + ROAST consensus is built around the same paper, citing it directly in their consensus documentation. The pattern has not seen the breadth of deployment that BLS-aggregation has on the consensus side, but for Schnorr / EdDSA TSS specifically it is the dominant choice for any deployment that needs robustness rather than just unforgeability.

### Trade-offs

The cost of robustness is not zero. ROAST adds coordinator-state complexity, increases worst-case message count, and introduces a parallel-session scheduling concern that has to be reasoned about during DKG and rotation. The semi-trusted coordinator is a new role in the system - not a security-critical one in the forgery sense, but a liveness-critical one. The §10.1 table footnote on identifiable abort silently absorbs the wrapper's preservation of that property. If the implementation gets identifiable abort wrong inside the wrapper, the §13.4 slashing schedule loses its attribution guarantee for the wrapped corridors.

The alternatives considered and not chosen are:

- **Vanilla FROST without a robustness wrapper.** Acceptable when the signing protocol has external fallback (e.g. retry-with-different-subset coordinated at the application layer). For a custody layer with a continuous withdrawal queue and a slashing schedule that depends on bounded liveness this is not acceptable, hence the wrapper.
- **Sparkle / Sparkle+ (Crites, Komlo, Maller, 2023).** A different Schnorr threshold scheme with stronger security in the adaptive corruption model. Not yet at the deployment-readiness level of FROST + ROAST and not part of UltraFast's working assumption.
- **GG18 / GG20 (Gennaro and Goldfeder).** A different threshold model (ECDSA, not Schnorr), explicitly excluded by §10.1 due to the TSSHOCK [31] class of attacks against `tss-lib` derivatives that affected THORChain and Multichain. Not comparable on the Schnorr side.
- **CGGMP21 [18] on the ECDSA side.** Used by UltraFast for ECDSA corridors, with its own internal identifiable-abort handling. Not a substitute for ROAST on the Schnorr side because the protocols are scheme-specific.

### Status for UltraFast

ROAST is in the working-assumption column of §10.1 and §16. The Phase 0 walking-skeleton (§16.1) exercises FROST TSS on Bitcoin but does not require the ROAST wrapper for the four-validator skeleton; the wrapper becomes load-bearing at the `n = 30` v1 set size where independent signer failures during a signing session become statistically inevitable. The implementation path is to integrate `ZcashFoundation/frost` for the primitive, layer a coordinator on top either upstream-contributed or maintained in-house, and treat the wrapper as part of the TSS audit perimeter alongside the DKG and the rotation protocol of §10.3.

---

## References

- Ruffing, T., Ronge, V., Jin, E., Schneider-Bensch, J., Schröder, D. "ROAST: Robust Asynchronous Schnorr Threshold Signatures." ACM CCS 2022. DOI: [10.1145/3548606.3560583](https://doi.org/10.1145/3548606.3560583). ePrint: [2022/550](https://eprint.iacr.org/2022/550).
- Komlo, C., Goldberg, I. "FROST: Flexible Round-Optimized Schnorr Threshold Signatures." SAC 2020. Standardised as IETF [RFC 9591](https://www.rfc-editor.org/rfc/rfc9591.html).
- Chainflip. "FROST Signature Scheme." [docs.chainflip.io/protocol/frost-signature-scheme](https://docs.chainflip.io/protocol/frost-signature-scheme).
- Arch Network. "ROAST and FROST Consensus." [book.arch.network/docs/core-concepts/consensus](https://book.arch.network/docs/core-concepts/consensus).
- `ZcashFoundation/frost` - Rust implementation of FROST per RFC 9591. [github.com/ZcashFoundation/frost](https://github.com/ZcashFoundation/frost).
- `StackOverflowExcept1on/roast` - Rust ROAST implementation atop Zcash Foundation cryptography.
- `nickfarrow/roast` - earlier Rust ROAST prototype.
- Verichains. "TSSHOCK: Threshold Signature Implementation Class Attacks." Black Hat USA 2023. [verichains.io/tsshock/](https://verichains.io/tsshock/).
