# Succinct ZK Light-Client (Telepathy / SP1)

Reference research for the UltraFast whitepaper, §10.6 (Ethereum-corridor ZK light-client bridge), §10.5 (foreign-chain bridge contracts), §14 (security analysis of bridge custody), §12.1 (bridge withdrawal latency target), §16 (open decision on prover hosting), §17 (future work — self-hosted prover migration).

UltraFast is pre-implementation. Nothing in this note is a measured property of UltraFast; references to production status concern Succinct's own deployments and the broader ZK light-client landscape.

## Part 1 — How UltraFast uses the Succinct ZK light-client and why

UltraFast operates one validator-controlled TSS vault per foreign-chain corridor — Bitcoin, Ethereum, all EVM L2s, Solana, Cosmos — under FROST / ROAST or DKLs23 with stake-weighted `2f+1` signing (§10). Custodied value is bounded globally by a 2× bonded-stake-to-custody cap (§10.4), so a `2f+1` validator collusion to drain a vault is unprofitable in expectation.

On the Ethereum L1 corridor specifically — the highest-volume USDC inflow path and therefore the largest single custodied-value pool — UltraFast layers a Succinct-style ZK light-client bridge alongside the TSS vault (§10.6). The light-client proves UltraFast's state transition function on Ethereum and proves Ethereum's sync-committee state on UltraFast. The pair gives Ethereum-side cryptographic certainty that whatever the UltraFast validator set committed to was the result of correctly applying the published STF.

What the ZK bridge buys: cryptographic certainty that the STF was applied correctly. What it does not buy: protection against `2f+1` validator collusion. A colluding majority can still censor, front-run, or pass a malicious STF; the proof attests that they did not deviate from the rules they ran, not that the rules themselves are decentralised. The ZK bridge complements the bond-to-custody cap; it does not replace it. The whitepaper marks this nuance as non-negotiable for marketing and audit communications.

Why Ethereum first: it is the largest USDC corridor and the largest single point of collusion incentive. BTC, Solana, Cosmos, and EVM-L2 corridors stay TSS-only at v1; several of those L2s already proof-bridge to Ethereum L1, so the UltraFast-to-Ethereum ZK path inherits their security transitively.

The L1 bridge contract carries a force-withdrawal escape hatch — same dispute-window-with-finaliser-kill-switch policy as §10.5 — that activates after a documented timeout if validators stall (§10.6, §14).

Two items are open. First, prover hosting (§16): Succinct-hosted (working assumption at v1, on the Succinct decentralized prover network), self-hosted, or hybrid migration. Self-hosting is named as v2 future work in §17, conditioned on volume justifying the capital expenditure. Second, the bridge withdrawal dispute-window length (§16). The §12.1 latency target is "minutes," bound by Ethereum sync-committee period and prover SLA — not the 200 ms p50 / 300 ms p99 cadence that applies to on-UltraFast finality.

## Part 2 — Succinct, Telepathy, and SP1

### Telepathy versus SP1

Two generations of Succinct technology are conflated in casual discussion; the whitepaper reference [16] cites Telepathy, but the production path UltraFast would integrate against in 2026 is the SP1-based light client.

**Telepathy** (c. 2022-2023) was Succinct's first ZK light-client for Ethereum, implemented as a hand-written ZK circuit (Circom / Plonky2 family) that verified Ethereum's Altair sync-committee BLS signatures and chained slot headers. It was relayed cross-chain to destination contracts that verified the SNARK in roughly 230k-500k gas, dropping per-message cost dramatically versus naive in-EVM BLS verification (Polyhedra and others independently report a similar ~350x cost reduction over naive on-chain verification). Telepathy's flagship production integration was the Gnosis Omnibridge: in 2023 the Omnibridge added Succinct's ZK validator contract alongside its existing 5/7 multisig, securing over $40M TVL and >$1.5B in cumulative stablecoin flow from Ethereum to Gnosis Chain at the time of integration. Succinct has since announced that the Telepathy platform is being deprecated, with the SP1-based implementation as its replacement.

**SP1** is Succinct's general-purpose zero-knowledge virtual machine, shipped to testnet in 2024 and to mainnet in August 2024 (the Succinct prover-network mainnet with the PROVE token followed in August 2025). SP1 proves the correct execution of arbitrary Rust programs compiled to RISC-V. The architectural shift from Telepathy to SP1 is the move from circuit-per-application to program-per-application: instead of writing a Circom circuit for sync-committee verification, you compile the existing Rust sync-committee verifier into an SP1 program and prove it. This is dramatically more maintainable. SP1 has been audited by Veridise, Cantina, Zellic, and KALOS and is publicly recommended for production use by Succinct.

**SP1 Helios** is the specific light-client of interest for UltraFast. It is an on-chain Ethereum light client built by Succinct using SP1, wrapping the a16z Helios Rust implementation (see below) as the program proved inside the zkVM. SP1 Helios verifies the consensus of a source chain in the execution environment of a destination chain — for example, an SP1 Helios instance deployed on chain X verifies Ethereum mainnet's sync-committee state. This is the direct architectural template UltraFast would deploy: SP1 Helios on UltraFast verifying Ethereum, and a symmetric SP1 program on Ethereum verifying UltraFast's STF against the QMDB state commitment.

### How a sync-committee ZK light-client works

The Ethereum sync committee (introduced in Altair, 2021) consists of 512 validators randomly selected every 256 epochs — roughly every 27 hours — to sign each block header during their period. A finalised header carries a BLS12-381 aggregate signature from a supermajority of the 512.

A ZK light-client proves, inside a SNARK:

1. The aggregate BLS signature over a given header verifies against the committee public-key set for the active period.
2. The committee public-key set for the active period is derived correctly from the previous-period committee (sync-committee rotation is the recursive step).
3. Optionally, an arbitrary Merkle-Patricia inclusion proof against the state root in the verified header (account balance, contract storage, log).

The destination chain runs only the verifier: a constant-cost SNARK check, typically a few hundred thousand gas. The relayer (or the prover-network operator) runs the prover, which is the expensive part.

Latency is dominated by two factors: prover wall-clock (minutes for a sync-committee-period proof on optimised hardware), and the underlying sync-committee period itself (~27 hours between committee rotations, though slot-by-slot updates within a period are much faster). UltraFast's §12.1 "minutes" withdrawal target is consistent with a slot-update or finalised-header proof path, not a full committee-rotation proof per withdrawal.

### The broader ZK light-client / ZK bridge landscape

- **zkBridge (UC Berkeley)** — the foundational 2022 paper (Xie, Zhang, Song, Wang, Shi) introducing trustless cross-chain bridges via SNARKs over sync-committee signatures. Reference design rather than a deployed product. The deVirgo proof system in the paper reports under-10-second proving for billion-size circuits.
- **Polyhedra zkBridge** — productionised the zkBridge approach. Reports 40M+ proofs generated, 25+ chain integrations, $75M total raised at a $1B post-money valuation (March 2024 round). Independent of Succinct; alternative vendor for the same architectural pattern.
- **a16z Helios** — Rust implementation of an Ethereum light client (sync-committee-based) that converts an untrusted RPC into a verified local RPC. Helios is not itself a ZK system; it is the canonical Rust reference implementation that SP1 Helios wraps inside the zkVM.
- **Lodestar light client (ChainSafe), Lighthouse light client (Sigma Prime)** — non-ZK consensus-client light-client implementations, useful as reference checkers.
- **Electron Labs / cosmos-zk-bridge** — earlier exploration of ZK light-client bridging into Cosmos; less production traction than Polyhedra or Succinct.
- **Polymer** — IBC-shaped cross-chain messaging, complementary rather than competitive.

Succinct itself has expanded well past Telepathy. SP1 currently secures over $1B in TVL (over $4B if including the August 2025 mainnet's first-quarter figures) across 35+ partners including Polygon, Celestia, Lido, and Mantle. Mantle migrated to OP Succinct on mainnet, with Succinct's blog characterising it as the largest single ZK rollup deployment at the time. Taiko has integrated SP1 into its multi-proof Raiko system. The Succinct prover network on Ethereum is a decentralized marketplace where prover operators bid to fulfil proof requests, settled in PROVE; this is the architecture UltraFast would use if the "Succinct-hosted" path in §16 is the resolution rather than self-provisioning prover hardware.

### Performance, cost, and the hosting decision

Public proving-cost figures for sync-committee proofs sit in the cents-per-proof range on modern GPU provers, with SP1's GPU prover stack reporting up to 10x improvement over its CPU baseline. Sync-committee-period verification is well within the regime where the proof cost is small relative to the corridor's USDC throughput. SP1 Hypercube (announced 2025) claims real-time Ethereum-block proving on 16 RTX 5090 GPUs, which is dramatically more aggressive than what a sync-committee light-client needs and indicates the architecture has substantial headroom for the lighter UltraFast workload.

The hosting decision in §16 turns on two factors. First, capital expenditure: a self-hosted prover cluster sized for sync-committee-period work is modest by ZK-prover standards (low-tens-of-GPU range), but it adds operational surface that the validator set must manage. Second, governance and liveness: a Succinct-hosted path means a single off-chain SLA dependency for the highest-volume corridor; the force-withdrawal escape hatch in §10.6 is the bound on the worst case. Hybrid migration (working assumption per §17) accepts the Succinct dependency at v1, builds the self-hosted cluster against demonstrated mainnet volume at v2, and migrates without changing the on-chain verifier contract since the proof system is unchanged.

### Trade-offs and residual risk

- **Prover liveness is not consensus liveness.** If the prover stalls, the L1 bridge stalls; the §14 mitigation is the force-withdrawal escape hatch after a documented timeout. UltraFast on-chain liveness is independent.
- **Sync-committee security is weaker than full Ethereum finality.** The light-client trusts that a supermajority of 512 randomly-sampled validators per 27-hour period is honest. The Ethereum security community generally treats this as adequate for bridging but distinct from full Casper-FFG finality. A "finalised-block" path (one extra level of proof) closes this gap at additional prover cost.
- **Reorg robustness.** ZK light-clients are subject to source-chain reorgs at the depth their relayer chooses to track. UltraFast's §14 mitigation (32-epoch ETH confirmation depth for deposits) is consistent with the conservative end of this trade-off.
- **Proof-system maturity.** SP1 has multiple independent audits and >$1B TVL secured; the proof-system risk is no longer the dominant residual on the Ethereum corridor relative to, say, TSS implementation risk in libraries that are themselves only recently post-TSSHOCK. Reorg-robustness, prover-liveness, and circuit-correctness-of-the-STF-program (which is now Rust code rather than Circom, but still has to be correct) remain the named exposures.

### Cross-reference summary

- §10.6 — the integration point. Succinct-style ZK light-client on the Ethereum corridor, complementing TSS plus the bond-to-custody cap.
- §10.5 — bridge contracts and dispute window with finaliser kill-switch; the ZK light-client inherits this dispute-window policy.
- §10.4 — the 2× bonded-stake-to-custodied-value cap that the ZK light-client complements but does not replace.
- §12.1 — withdrawal latency target "minutes," bound by sync-committee period and prover SLA.
- §14 — `2f+1` collusion remains the named residual; ZK proof does not address it at the policy level.
- §16 — prover hosting open: Succinct-hosted (default) versus self-hosted versus hybrid migration.
- §17 — self-hosted prover migration named as v2 future work.
- Reference [16] — Succinct Labs, Telepathy, with Gnosis Omnibridge production integration; SP1 / SP1 Helios is the current-generation successor and the actual production path.

## Sources

- [SP1 is live (Succinct blog)](https://blog.succinct.xyz/sp1-is-live/)
- [SP1 testnet launch / feature-complete announcement](https://blog.succinct.xyz/sp1-testnet/)
- [SP1 Hypercube on mainnet](https://blog.succinct.xyz/sp1-hypercube-is-now-live-on-mainnet/)
- [The Block: Succinct SP1 Hypercube real-time Ethereum proving](https://www.theblock.co/post/355013/succinct-introduces-zkvm-sp1-hypercube-claims-real-time-ethereum-proving)
- [sp1-helios on GitHub (Succinct)](https://github.com/succinctlabs/sp1-helios)
- [SP1 Helios documentation](https://succinctlabs.github.io/sp1-helios/)
- [SP1 main repo (succinctlabs/sp1)](https://github.com/succinctlabs/sp1)
- [Gnosis: Succinct's Ethereum ZK Light Client and Hashi](https://www.gnosis.io/blog/succincts-ethereum-zk-light-client-and-the-road-to-trust-minimzed-bridges-with-hashi)
- [Succinct Series A $55M led by Paradigm (Succinct blog)](https://blog.succinct.xyz/series-a/)
- [The Block: Succinct prover-network mainnet and PROVE token](https://www.theblock.co/post/365606/succinct-mainnet-prove-token)
- [Succinct prover network mainnet announcement](https://blog.succinct.foundation/mainnet/)
- [Mantle upgrades to OP Succinct on mainnet](https://blog.succinct.xyz/mantle/)
- [Taiko: introducing SP1 to Raiko](https://taiko.mirror.xyz/_3RbETXwvtYmK0T8j7VOllPw2DXT4gt_e54qqs8V-Lc)
- [a16z Helios light client repo](https://github.com/a16z/helios)
- [Building Helios: fully trustless access to Ethereum (a16z crypto)](https://a16zcrypto.com/posts/article/building-helios-ethereum-light-client/)
- [zkBridge paper (UC Berkeley, Xie et al.)](https://rdi.berkeley.edu/zkp/uploads/paper.pdf)
- [Polyhedra zkBridge documentation](https://docs.zkbridge.com)
- [Messari: State of Polyhedra Q4 2024](https://messari.io/report/state-of-polyhedra-q4-2024)
