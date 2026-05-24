# Threshold-Encrypted Mempools

Deep research note for the UltraFast whitepaper, covering how threshold-encrypted mempools (Shutter, Ferveo, TrX, EIP-8105/8184/8209) work, why UltraFast rejects them for v1, and the conditions under which the design is to be revisited at v2.

UltraFast is a pre-implementation Layer 1 designed by the MANTRA team for perpetual futures, scalar prediction markets, data sales, and an EVM lane. The derivatives workload sets the latency budget against which every other architectural decision is sized. The whitepaper (`/Users/g/git/mantra/ultrafast/whitepaper.md`) treats threshold-encrypted mempools in §8.5 (explicit rejection for v1), §16 (open decision on the revisit window), and §17 (v2 future path).

---

## Part 1: How UltraFast uses (or does not use) threshold-encrypted mempools

**Role at v1: none.** Threshold-encrypted mempools are explicitly rejected (§8.5) for the derivatives workload. UltraFast's pre-trade hiding is supplied by the composition of the MEV Capture Protocol (MCP) auction with the frequent-batch-auction (FBA) matching engine, not by cryptographic concealment of transaction contents in the public mempool.

**Stated rejection rationale (§8.5).** The whitepaper names three reasons:

1. **Latency.** Production transaction-to-inclusion latency on the Shutterized Gnosis Chain sits in the minute-scale range. This is the only mainnet deployment of a threshold-encrypted mempool on an EVM L1 at the time of writing. Reported averages run roughly three minutes to inclusion against five-second Gnosis blocks. The figure reflects a sparse keyper and validator set, not a fundamental protocol bound. The gap to a sub-second perpetuals tick is still large enough that the production system cannot serve a derivatives venue today.
2. **Slot-level overhead in EVM-side proposals.** Ethereum-side proposals to enshrine an encrypted mempool add at least one slot of latency to inclusion because encrypted transactions are included in one block and the decrypted bodies are executed in the next. The whitepaper cites EIP-8184 and EIP-8209 by number; the leading public draft at the time of this note is EIP-8105 ("Universal Enshrined Encrypted Mempool", Jannik Luhn), which sits on the same one-block-latency design point. Whichever number ships, the structural cost is a slot, and Ethereum's slot is twelve seconds.
3. **Committee halt risk.** A threshold-decryption committee that loses liveness halts inclusion. For a venue where missed price ticks during a stress event are the highest-stakes liveness failures, importing a second committee whose halt directly stops the chain's user-visible function is the wrong direction.

**Re-evaluation conditions (§8.5, §16, §17).** UltraFast targets v2 for re-evaluation, contingent on committee-liveness budgets reaching sub-100 ms. Ferveo-style threshold decryption remains a candidate for an opt-in lane parallel to the public FBA path. §16 lists the open decision as a three-way: reject permanently, revisit at v2 if Shutter-class committee liveness reaches sub-100 ms, or ship a Ferveo-style lane at v2 regardless. §17 enumerates the threshold-encrypted-mempool revisit as a named v2 future-work item.

**How pre-trade hiding is achieved without threshold encryption.** MCP plus FBA composition substitutes for cryptographic concealment in two ways. The FBA tick produces a uniform clearing price for every order admitted into the same window, which removes the rank-order exploits that front-running depends on. MCP separates the right to reorder from the right to extract by auctioning ordering as a tokenised resource. The combination yields a venue where the value of seeing an unencrypted order before the tick closes is bounded by the auction price, not by the latency edge of the fastest bot. The privacy-tier framework discussed in §11 is independent of the threshold-encryption decision. v2 can layer threshold encryption on top of FBA-plus-MCP without redesigning either component (§17 noted).

---

## Part 2: Deep research on threshold-encrypted mempools

### How the construction works

A threshold-encrypted mempool inserts a cryptographic veil between a user's transaction and the validators that order it. Users encrypt transaction payloads against a threshold public key whose corresponding secret is held in shares by a committee of decryption-key holders ("keypers" in Shutter, "validators acting as DKG participants" in Ferveo and TrX). The lifecycle is:

1. **Encrypt.** The user encrypts the transaction body under the current epoch's threshold public key. The encryption typically uses an identity-based or tag-based scheme so the ciphertext is bound to a specific slot, block height, or batch identifier and cannot be early-decrypted by replay.
2. **Submit and include.** The ciphertext is gossiped and included in a block in opaque form. Validators order the ciphertexts without seeing their contents.
3. **Reveal.** Once ordering is fixed, the committee runs a threshold decryption: each keyper publishes a partial decryption (a share), and any party with `t` shares (out of `n`) can reconstruct the plaintext.
4. **Execute.** The decrypted transaction is executed in the next block (or after a deterministic delay) against the state at the inclusion point.

The committee only releases decryption material after the ordering decision is committed. This means validators cannot reorder transactions based on their content. Sandwich attacks and atomic front-runs are eliminated. The censorship surface narrows to opaque-ciphertext-level, which is harder to target by content.

### Shutter Network

The flagship production deployment. Shutter (`https://shutter.network/`) uses BLS-based threshold encryption with a keyper committee that runs a DKG per epoch and rotates keys epoch-to-epoch. Shutter has been live on Gnosis Chain mainnet as the Shutterized Beacon Chain. Transactions are submitted through a dedicated RPC, encrypted under the current epoch key, included on chain by participating validators, and decrypted after inclusion. Reported figures place average transaction-to-inclusion latency at roughly three minutes against the five-second Gnosis block cadence. The driver is the limited number of participating validators and the permissioned keyper set, not the cryptography itself.

The Shutter team has answered a16z's "On the limits of encrypted mempools" critique on two points. Batched decryption compresses committee traffic to O(n). An Ethereum-sized block can be decrypted in roughly three seconds single-threaded, comfortably inside Ethereum's twelve-second slot. The gap between this engineering envelope and the production figure is the deployment-density gap, not a cryptographic one. Shutter has also extended onto an OP-stack testnet.

### Ferveo

Ferveo (`github.com/anoma/ferveo`, ePrint 2022/898) is Anoma's distributed-key-generation and threshold-encryption stack, designed specifically for front-running protection on the Namada chain and the broader Anoma ecosystem. Two pieces matter:

- A publicly verifiable DKG scheme that distributes the shared private key by relative staking weight, with validator-set membership determined an epoch in advance so the DKG has time to complete.
- A threshold public-key encryption scheme tuned for the consensus mechanism, aiming to scale to thousands of transactions per epoch.

Ferveo is the construction the UltraFast whitepaper names as the candidate for a v2 opt-in lane. It is designed to live alongside, not replace, a public ordering path. The DKG-per-epoch model matches a v2 design where threshold encryption is a privacy tier the user selects rather than the chain's default.

### TrX (ePrint 2025/2032)

Fernando, Policharla, Tonkikh, and Xiang, "TrX: Encrypted Mempools in High Performance BFT Protocols", Cryptology ePrint Archive 2025/2032 (`https://eprint.iacr.org/2025/2032`). TrX is the construction sitting underneath Aptos Labs' announced native encrypted mempool. It is a batched threshold encryption scheme that lets validators emit a single partial decryption covering an entire batch of ciphertexts. Computation drops from O(nB) to O(n + B) and communication to O(n), with partial decryptions bound to the batch to prevent replay. Aptos Labs reports a proposal-to-execution overhead of approximately 27 ms (a 14 percent increase over the baseline) and a lightweight online phase of under 20 ms per batch. Deployment is conditional on governance approval. If approved, Aptos would be the first L1 with a native encrypted-mempool option at this latency budget. The scheme uses BLS12-381 with 96-byte G2 elements, matching the curve used by Ethereum consensus.

TrX is the closest existing result to UltraFast's sub-100 ms committee-liveness condition. It demonstrates that the latency floor for threshold-encrypted mempools is not minute-scale or even slot-scale, but tens of milliseconds. This holds when the committee is the validator set itself (not a separate keyper committee) and the construction is batched. This is the construction class that makes the §8.5 revisit window plausible.

### Ethereum-side proposals: EIP-8105 (and the 8184 / 8209 references)

The whitepaper cites EIP-8184 and EIP-8209. At the time of this research note, the live draft EIP carrying the "encrypted mempool" name on the Ethereum standards track is EIP-8105 ("Universal Enshrined Encrypted Mempool", Jannik Luhn). It proposes a key-provider registry deliberately agnostic to the underlying scheme (threshold encryption, MPC committees, TEEs, delay encryption, FHE). EIP-8105's design admits a one-block latency. Encrypted transactions are included in block N with a nonce-increment effect on the envelope signer. The decrypted body is executed in block N+1 under the execution context of block N. EIP-8105 is currently a Draft, not a hard-fork candidate. The whitepaper's specific EIP numbers (8184, 8209) may track later iterations or sibling proposals. The structural one-slot-of-latency point holds across the design family.

### Related projects and constructions

- **Penumbra** uses shielded transactions (zk-based) rather than threshold decryption for the same anti-front-running goal, achieved by hiding transaction contents permanently from the validator set rather than under a reveal schedule.
- **SUAVE / Flashbots** explores TEE-attested kettles and encrypted-mempool variants as an out-of-protocol marketplace rather than an enshrined chain feature.
- **Aequitas, Themis, Pompe** are fair-order protocols that achieve front-running resistance through consensus-level order-fairness rules (FCFS or median-of-validator-receipt-order) without encryption.
- **Commit-reveal** is the unencrypted analogue: a hash of the intent is committed in one block and the body in the next, achieving a one-block reveal latency at the cost of forcing the user to come back online.
- **Intent-based systems** (CoW Protocol, Anoma's intent layer) externalise execution to solvers operating against an off-chain order pool; cryptographic concealment is replaced by solver-marketplace economics.
- **MCP-style designs** (Constellation) and **tokenised ordering** (Masquerade) auction ordering rights and bound MEV by the auction clearing price rather than hiding content.

### Trade-offs

- **Latency cost.** The gap between the deployed (Shutter / Gnosis, minute-scale) and the asymptotic-engineering (TrX / Aptos, ~27 ms overhead) latency envelopes is two-to-three orders of magnitude. The bottleneck has shifted from the cryptography to deployment density and committee membership choice.
- **Liveness coupling.** Every threshold-decryption committee adds a halt mode to the chain's user-visible function. Mitigations are committee-validator-set unification (TrX/Aptos), fallback to plaintext-mode execution (EIP-8105), and traitor-tracing for early decryption (advanced Shutter proposals).
- **Metadata leakage.** Encrypted bodies still leak size, submission timing, and (for some constructions) fee tags. Padding and batching mitigations cost throughput.
- **Hard-fork complexity.** Enshrining encryption at the protocol layer requires consensus-level changes (key-provider registries, decryption-reveal phases, slashing for misbehaving keypers).
- **Committee collusion.** A threshold of `t` colluding keypers can decrypt early. Mitigations include large committees, validator-set unification, traitor tracing with on-chain slashing, and TEE attestation as a second factor.

### Comparison to UltraFast's chosen path

UltraFast solves the same problem class - pre-trade information leakage and front-running - through a different stack: an FBA tick at the matching engine, MCP at the ordering layer, and a public mempool with no cryptographic concealment. The trade is:

- **In favour of FBA+MCP at v1:** sub-second tick is preserved; no decryption-committee halt mode is introduced; the chain's liveness budget is not coupled to a second cryptographic protocol; deployment can ship without waiting for a TrX-class production system to mature.
- **In favour of threshold encryption at v2:** TrX-class constructions are approaching the sub-100 ms committee-liveness budget that the §8.5 revisit condition names; a Ferveo-style opt-in lane composes cleanly with the privacy-tier framework of §11; users who value content-level concealment over the marginal tick of latency can opt in without forcing it on the whole venue.

### Maturity assessment

The encryption schemes themselves are mature: BLS threshold encryption, the Ferveo DKG, and the TrX batched-decryption construction are all well-studied, with concrete security analyses and reference implementations. The deployment latency budget is the active research front. Shutter's production figure of minutes is a deployment-density artefact; TrX's ~27 ms overhead is a paper-and-prototype figure with a pending Aptos governance vote. The v2 revisit decision for UltraFast (§16) hinges on whether a TrX-class deployment ships and demonstrates sub-100 ms committee-liveness at production load before UltraFast's v2 design window closes.

---

## References

- Shutter Network. "Shutter: Threshold-Encrypted Mempool for Front-Running Protection." `https://shutter.network/`. Gnosis Chain production deployment.
- Anoma / Namada. "Ferveo: Distributed Key Generation and Threshold Encryption." `https://github.com/anoma/ferveo`. ePrint 2022/898.
- Fernando, R., Policharla, G.-V., Tonkikh, A., and Xiang, Z. "TrX: Encrypted Mempools in High Performance BFT Protocols." Cryptology ePrint 2025/2032. `https://eprint.iacr.org/2025/2032`.
- Luhn, J. "EIP-8105: Universal Enshrined Encrypted Mempool." Ethereum Improvement Proposals, Draft. `https://eips.ethereum.org/EIPS/eip-8105`.
- Aptos Labs. "Introducing Encrypted Mempool: MEV protection native to Aptos." `https://medium.com/aptoslabs/aptos-encrypted-mempool-native-transaction-intent-confidentiality-on-aptos-e90da3cfb254`.
- a16z crypto. "On the limits of encrypted mempools." `https://a16zcrypto.com/posts/article/limits-encrypted-mempools/`.
- Shutter Network. "On the Limits of Encrypted Mempools — A Response to a16z Crypto's Analysts." `https://blog.shutter.network/on-the-limits-of-encrypted-mempools-a-response-to-a16z-cryptos-analysts/`.
- Gnosis Chain documentation. "Shutter Network on Gnosis Chain." `https://docs.gnosischain.com/shutterized-gc/`.
- UltraFast whitepaper, `/Users/g/git/mantra/ultrafast/whitepaper.md`, §8.5, §11, §16, §17.
