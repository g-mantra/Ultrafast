# Engine API

Research notes on the Ethereum Engine API as referenced by the UltraFast whitepaper (§6.1). UltraFast is a pre-implementation Layer 1 from the MANTRA team; the execution lane runs stock reth driven by the Engine API, the same architectural shape Tempo and Monad have converged on.

## 1. How UltraFast uses the Engine API, and why

UltraFast splits the node into a consensus layer (Threshold Simplex with the Minimmit single-round fast path, with MCP slated for v1.1) and an execution layer (stock reth running the EVM). The interface between the two is the Ethereum Engine API. The consensus layer drives reth via the three core method families:

- `engine_newPayloadV*` - hand a candidate block to reth for validation and execution.
- `engine_forkchoiceUpdatedV*` - tell reth which head and finalised block to track, and optionally request payload assembly.
- `engine_getPayloadV*` - retrieve a payload reth has built for proposal.

This is the same post-Merge consensus/execution split that Ethereum mainnet runs, and the same shape Tempo (Stripe/Paradigm, reth-based) and Monad (custom C/C++ execution client, Rust consensus) adopt for their own non-Ethereum L1s. The whitepaper names both as architectural precedents.

The design intent is fivefold.

First, **clean CL/EL split**: consensus changes (Threshold Simplex, Minimmit, MCP, the FBA-tick coupling) ship inside the UltraFast consensus binary without forking reth. Reth stays close to upstream and inherits Cancun parity for free.

Second, **execution-client portability**: any Engine-API-compatible execution client (reth, geth, erigon, nethermind, besu) could in principle plug into the UltraFast consensus driver. The v1 commitment is to reth, but the interface choice keeps the door open to client diversity later.

Third, **smallest audit surface among considered paths**. The whitepaper calls this out explicitly in §6.1: driving stock reth via the Engine API avoids the Cosmos-EVM bug class catalogued in GHSA-mjfq-3qr2-6g84 (`Run` methods not atomic; deferred `HandleGasError` failing to revert StateDB on out-of-gas, allowing partial-state-write claims; CVSS 8.3) that previously affected Evmos. By isolating EVM execution inside reth and refusing to expose state-mutation precompiles, UltraFast avoids the integration seam that produced those bugs.

Fourth, **speculative execution against the proposal (§6.4)** layers on top of the standard Engine API contract. Reth begins executing the proposal on `engine_newPayload` before the threshold-signature certificate arrives; the QMDB state-root commit gates on finality. If Threshold Simplex skips the view, the speculative state is discarded deterministically before the next proposal. This is the lever that compresses p50 finality from roughly the 280–320 ms range (Minimmit plus a two-region topology alone) toward the 200 ms target.

Fifth, **constrained precompile surface**: reth exposes UltraFast-specific custom precompiles for matching-engine reads, oracle reads, the Aptos-style aggregator surface, and data-marketplace entitlement checks (§6.6, §9.4). State mutation never happens inside a precompile - that constraint is the direct lesson from the Cosmos-EVM bug class.

None of this is implemented yet. The Phase 0 walking-skeleton validates the integration: consensus driving reth via the Engine API, QMDB shimmed in as the state-DB backend, speculative-commit and rollback paths deterministic, no observable speculative state escaping to the user before finality.

## 2. The Engine API: deep notes

### 2.1 Origin and purpose

The Engine API is the JSON-RPC interface defined as part of Ethereum's Merge transition (September 15, 2022) to decouple the consensus layer (CL) from the execution layer (EL). Before the Merge, an Ethereum full node was a monolith - it produced proof-of-work blocks and executed them in the same binary. After the Merge, proof-of-stake consensus runs in a separate beacon node, and the EL is reduced to a state-transition engine driven externally. The Engine API is the protocol over which the beacon node drives the EL.

The specification lives in the `ethereum/execution-apis` repository at `src/engine/`, with one file per hard-fork (`paris.md`, `shanghai.md`, `cancun.md`, `prague.md`) plus `common.md` for shared structures and `authentication.md` for the JWT scheme.

### 2.2 Core method families

Three method families do the work:

- **`engine_newPayloadV{N}`** - the CL submits a candidate block to the EL. The EL validates it (state transition, signature checks, gas accounting), executes it against current state, and returns a status (`VALID`, `INVALID`, `SYNCING`, `ACCEPTED`). This is the method UltraFast triggers speculative execution off.
- **`engine_forkchoiceUpdatedV{N}` (fcU)** - the CL tells the EL the current head block, the safe block, and the finalised block. Optionally, the CL passes `payloadAttributes` to request that the EL begin assembling a new payload on top of the head. The EL returns a `payloadId`. This is how leaders trigger payload assembly.
- **`engine_getPayloadV{N}`** - given a `payloadId` from a prior fcU, the EL returns the assembled execution payload (the candidate block body) for the CL to propose.

Supporting methods include `engine_exchangeCapabilities` (negotiate supported method versions between CL and EL), `engine_getPayloadBodiesByHashV1` / `engine_getPayloadBodiesByRangeV1` (historical payload retrieval), and Prague's `engine_getBlobsV1`.

The specification is explicit that "The Consensus Layer drives the Execution Layer and thus can drive many of them independently." Method versions are independent: `engine_newPayloadV3` and `engine_forkchoiceUpdatedV2` can be used together if both sides advertise them via capability exchange.

### 2.3 Version evolution

Engine API versions track Ethereum hard-forks. The pattern is that any payload-shape change (new fields, new request types, new commitments) bumps the method version.

- **V1** - Paris / The Merge (September 15, 2022). Initial post-Merge interface. `ExecutionPayloadV1`.
- **V2** - Shanghai / Capella (April 12, 2023). Adds withdrawals (validator exits from beacon chain to execution layer). `PayloadAttributesV2` and `ExecutionPayloadV2` carry the withdrawals list.
- **V3** - Cancun / Deneb (March 13, 2024). Adds EIP-4844 blob transactions: blob-versioned hashes, `parentBeaconBlockRoot` passed into the EVM, blob gas accounting. `engine_newPayloadV3` takes `expectedBlobVersionedHashes` and `parentBeaconBlockRoot` as additional parameters alongside `ExecutionPayloadV3`.
- **V4** - Prague / Electra ("Pectra"), activated on mainnet May 7, 2025. Adds `executionRequests` per EIP-7685: an array of typed request blobs (first byte = `request_type`, remainder = `request_data`, ordered ascending by type) carrying execution-layer-triggered operations such as deposit requests (EIP-6110), withdrawal requests, and consolidation requests.

UltraFast is at Cancun parity in v1 (§6.1 of the whitepaper), which means V3-level Engine API semantics on the wire. UltraFast does not need the V4 surface in v1 because the V4 additions (deposits, withdrawal requests, consolidations) all encode Ethereum-mainnet validator-set operations that have no UltraFast analogue - UltraFast runs its own validator-set logic in the consensus layer.

### 2.4 Authentication

The Engine API is JWT-authenticated. The EL exposes the Engine API on a port independent of the public `eth_*` JSON-RPC port; the default is **8551**. The default public JSON-RPC port (8545) does not authenticate Engine API calls.

The CL and EL share a `jwt-secret` - a hex-encoded 256-bit symmetric key, typically stored in a `jwt.hex` file on the filesystem. Every Engine API request carries an HTTP `Authorization: Bearer <token>` header containing a JWT signed with HS256 over a small claim set. The required claim is `iat` (issued-at); the EL accepts `iat` values within ±60 seconds of its own clock. This is the standard authentication scheme across all major client pairs.

The JWT model is light: there is no per-user identity, no fine-grained authorisation, just "is this caller my paired consensus client?" The threat model the design defends is a malicious local process making Engine API calls - without the shared secret it cannot drive the EL.

### 2.5 Implementations

Every production Ethereum execution client implements the Engine API:

- **geth** (go-ethereum, Go)
- **reth** (Paradigm, Rust) - UltraFast's choice
- **erigon** (Go, performance-optimised)
- **nethermind** (C#/.NET)
- **besu** (Hyperledger, Java)

Every production consensus client drives it:

- **Prysm** (Offchain Labs, Go)
- **Lighthouse** (Sigma Prime, Rust)
- **Teku** (ConsenSys, Java)
- **Nimbus** (Status, Nim)
- **Lodestar** (ChainSafe, TypeScript)

In Ethereum mainnet operation, an operator runs one CL and one EL paired by shared JWT secret. The Engine API is the only required interaction surface between them.

### 2.6 Status

In production on Ethereum mainnet continuously since The Merge (September 15, 2022). The specification has shipped four full version generations through Pectra (May 7, 2025) and continues to evolve alongside Ethereum hard-forks. Releases are tagged on `ethereum/execution-apis`; informal "devnet" iterations precede each mainnet fork.

### 2.7 Adopters outside Ethereum L1

The Engine API has become the de facto integration interface for chains that want EVM execution without forking an execution client. Notable adopters:

- **Tempo** (Stripe + Paradigm). Announced September 4, 2025; mainnet March 18, 2026. Built on Paradigm's reth SDK. Consensus is Commonware-based Simplex (the same family as UltraFast). The whitepaper cites Tempo at reference [23] as the architectural precedent for "reth driven by the Engine API as the EVM lane of a non-Ethereum L1."
- **Monad**. Parallel EVM L1, mainnet 2025. Custom execution client (C/C++) and custom consensus client (Rust, pipelined HotStuff variant). The EL-CL boundary is Engine-API-shaped though the EL is not reth. The whitepaper cites Monad at reference [24] for the parallel-EVM-via-Engine-API architectural pattern at a different point in the design space.
- **Optimism (OP Stack)**. `op-node` (Go consensus-equivalent) drives `op-geth` or `op-reth` (forked execution clients) via the Engine API with OP-specific extensions. Base, Optimism Mainnet, and most OP-Stack L2s use this shape.
- **Arbitrum**. Custom architecture - not a clean Engine API consumer; the comparison is weaker here than in the whitepaper's list.
- **Polygon CDK** and similar SDK-style L2 stacks generally exhibit Engine-API-shaped CL/EL splits, varying in fidelity to the upstream spec.
- **Reth-based experiments** (AlphaNet, reth ExEx, custom rollups) are routinely Engine-API-driven.

### 2.8 The "modular L1" pattern

The pattern UltraFast, Tempo, and Monad share is the modular-L1 recipe:

1. Take an EVM execution client (reth for UltraFast and Tempo; custom for Monad).
2. Drive it via the Engine API.
3. Write your own consensus client implementing whatever protocol you want - HotStuff variant, Simplex, DAG, partial-synchrony BFT - provided it can produce the Engine-API drive sequence (fcU with payload attributes → getPayload → newPayload → fcU with new head).
4. Optionally substitute the state-DB backend, add custom precompiles, expand the system-contract surface.
5. The result is an EVM L1 with your own consensus, your own validator economics, and Ethereum tooling compatibility inherited for free.

This pattern has overtaken the alternative (forking an EVM-in-Cosmos or EVM-in-Substrate implementation) because the integration seam between consensus and execution is now standardised, audited at scale, and operationally hardened by years of Ethereum mainnet use.

### 2.9 Limitations and ongoing work

- **JSON-RPC overhead.** The Engine API is JSON over HTTP. Each call carries the encoding cost of JSON-RPC plus the cost of marshalling block payloads. For Ethereum mainnet's 12-second slot, this overhead is negligible; at sub-second cadence it becomes a meaningful slice of the latency budget. Engine API spec issue #321 and adjacent discussions cover proposals to reduce overhead. Tempo, Monad, and UltraFast can use the standard Engine API at the wire level while running it in-process between consensus and execution modules in the same binary - eliminating the network leg without abandoning the interface contract.
- **JWT auth model.** Single shared symmetric secret; no key rotation flow defined in the spec. Operationally manageable, conceptually thin.
- **No streaming.** The Engine API is request/response. Streaming variants (CL pushes a stream of payload-attributes updates as the leader's view of mempool evolves) are not specified. UltraFast's speculative-execution path nudges against this limit: it wants to start executing the proposal as soon as the leader has it, before the certificate forms.
- **Version sprawl.** Capability negotiation works, but the matrix of `(newPayload V_x, fcU V_y, getPayload V_z)` combinations grows with each hard-fork. Mature CL/EL pairs handle this; younger consumers (like a new L1 consensus driver) carry the implementation cost.
- **Versioning tied to Ethereum forks.** A non-Ethereum L1 using the Engine API inherits an upgrade cadence it does not control. UltraFast's choice to pin v1 at Cancun parity is a deliberate freeze; later versions are an opt-in upgrade decision rather than a forced one.

## 3. References

- Ethereum execution-apis repository, `ethereum/execution-apis`, particularly `src/engine/common.md`, `src/engine/authentication.md`, `src/engine/paris.md`, `src/engine/shanghai.md`, `src/engine/cancun.md`, `src/engine/prague.md`.
- "Engine API: A Visual Guide", `danielrachi`, HackMD.
- Pectra mainnet activation: ethereum.org/roadmap/pectra/, May 7, 2025.
- Reth: `paradigmxyz/reth`, Rust EVM execution client.
- Tempo: `tempo.xyz`, announced September 4, 2025; mainnet March 18, 2026.
- Monad documentation: `docs.monad.xyz`.
- Optimism OP Stack: `ethereum-optimism/optimism` (op-node), `ethereum-optimism/op-geth`, `ethereum-optimism/op-reth`.
- UltraFast whitepaper, §3 (architecture), §6.1 (reth via Engine API), §6.4 (speculative execution), §15 (related work; Tempo at [23], Monad at [24]), GHSA-mjfq-3qr2-6g84 at [12].
