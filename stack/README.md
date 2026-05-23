# UltraFast Deep Research Index

This directory contains one markdown file per technology referenced in the [UltraFast whitepaper](../whitepaper.md). Each file has two parts:

- **Part 1.** How UltraFast uses the technology and why, sourced from the whitepaper.
- **Part 2.** Deep research on the technology — mechanism, implementations, current status, other adopters, limitations.

Files are organised by area below.

## Consensus and cryptography

- [threshold-simplex.md](threshold-simplex.md) — base consensus protocol (Commonware refinement of Chan & Pass)
- [minimmit.md](minimmit.md) — single-round fast path on top of Threshold Simplex
- [bls12-381.md](bls12-381.md) — pairing-based signature curve for threshold aggregation
- [rejected-consensus-alternatives.md](rejected-consensus-alternatives.md) — HotStuff, CometBFT, DAG protocols considered and rejected (§5.5)

## State backend

- [qmdb.md](qmdb.md) — Quick Merkle Database; reth state-DB shim

## Execution layer

- [reth.md](reth.md) — Rust EVM execution client by Paradigm
- [engine-api.md](engine-api.md) — CL ↔ EL interface used to drive reth
- [block-stm.md](block-stm.md) — optimistic parallel transaction execution
- [aptos-aggregators.md](aptos-aggregators.md) — typed commutative ops on hot keys
- [speculative-execution.md](speculative-execution.md) — pipelined execution against the proposal

## Matching

- [frequent-batch-auctions.md](frequent-batch-auctions.md) — uniform-price tick auction (Budish-Cramton-Shim)
- [speedex.md](speedex.md) — Stanford in-validator-solver precedent

## MEV resistance

- [multi-concurrent-proposer.md](multi-concurrent-proposer.md) — MCP / Solana Constellation pattern (v1.1)
- [masquerade-tokenized-ordering.md](masquerade-tokenized-ordering.md) — tokenized ordering bolt-on for un-batched paths
- [threshold-encrypted-mempools.md](threshold-encrypted-mempools.md) — Shutter / Ferveo / TrX (rejected for v1)

## Custody and bridges

- [frost.md](frost.md) — Schnorr/EdDSA threshold signatures (BTC Taproot, SOL, Cosmos)
- [roast.md](roast.md) — robust async wrapper around FROST
- [dkls23.md](dkls23.md) — 3-round, Paillier-free ECDSA TSS (BTC legacy, ETH, EVM)
- [cggmp21.md](cggmp21.md) — ECDSA TSS fallback
- [tbtc-v2-fresh-wallet.md](tbtc-v2-fresh-wallet.md) — per-epoch wallet rotation pattern
- [thorchain-incentive-pendulum.md](thorchain-incentive-pendulum.md) — bond-to-custodied-value cap
- [succinct-zk-light-client.md](succinct-zk-light-client.md) — Telepathy/SP1 Ethereum-corridor ZK bridge
- [chainflip-tss.md](chainflip-tss.md) — closest production analog for §10

## Privacy

- [trusted-execution-environments.md](trusted-execution-environments.md) — Intel TDX, AMD SEV-SNP (dark pool v1.5)
- [renegade-zk-mpc.md](renegade-zk-mpc.md) — collaborative SNARK matching (dark pool v2+)
- [pedersen-commitments-range-proofs.md](pedersen-commitments-range-proofs.md) — position-private tier (v2)

## Standards

- [eip-712.md](eip-712.md) — typed structured-data signing for gasless orders
- [eip-1559.md](eip-1559.md) — EVM-lane base-fee dynamics
- [erc-4626.md](erc-4626.md) — Community Vault share interface
- [hip-listing-primitives.md](hip-listing-primitives.md) — HIP-1/2/3 market deployment patterns

## Oracle and dispute

- [uma-optimistic-oracle.md](uma-optimistic-oracle.md) — bond-and-dispute pattern for prediction markets and data-market disputes

## Validator economics and security

- [axelar-square-root-voting.md](axelar-square-root-voting.md) — bridge-specific anti-concentration weighting (under consideration)
- [dydx-v4-fee-architecture.md](dydx-v4-fee-architecture.md) — precedent for the 5% commission floor and 100%-to-IF policy

## Formal methods

- [tla-plus.md](tla-plus.md) — formal-specification umbrella (consensus safety, MCP, FBA, risk-engine, gasless-DoS, speculative-rollback)
