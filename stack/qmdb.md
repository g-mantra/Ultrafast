# QMDB

Research notes for UltraFast whitepaper §5.4. Status: pre-implementation. QMDB is referenced as the planned state backend behind a `reth`-based EVM execution client.

---

## Part 1 - How UltraFast uses QMDB and why

UltraFast plans to ship QMDB as the state backend for its EVM execution lane. The integration form named in §5.4 of the whitepaper is a **state-DB shim that implements `reth`'s state-DB trait surface**, sitting underneath the EVM. In stock `reth` that trait surface is satisfied by MDBX as the key-value store and a hexary Merkle-Patricia Trie (MPT) for the state commitment. UltraFast replaces both: QMDB unifies the key-value store and the Merkle store in one append-only structure, organised as immutable fixed-size subtrees called **twigs**.

The reason for the swap is the workload, not a generic preference for novel databases. UltraFast's anchor workload is a perpetual-futures and scalar-prediction-market exchange driven by an in-protocol Frequent Batch Auction (§7). Order flow concentrates heavy writes onto a small set of hot keys per tick: the open-interest counter, the funding accumulator, the user-margin slot, the order-book head pointer, and the price-time-priority queue cell. The hexary MPT path under stock `reth` issues `O((log N)²)` SSD I/Os per state update, with random reads scattered across the trie at every hot-path mutation. At the throughput targets in §12 that path becomes I/O-bound before consensus does. QMDB collapses this to one SSD read per state access and `O(1)` I/Os for updates, with the Merkle work done in DRAM at roughly 2.3 bytes per entry. For the perp churn profile this is the right shape: most state touched per tick is small in cardinality and high in update frequency.

The integration deliberately accepts one constraint. **Ethereum-MPT-root compatibility is not a v1 requirement.** UltraFast's state root is a QMDB twig-tree root, not a hexary-MPT root computed over the same accounts. The whitepaper argues this is acceptable because Foundry, standard wallets, and the Solidity toolchain depend on EVM **execution** semantics - opcode behaviour, gas costs, log emission, `eth_call`, `eth_estimateGas` - not on the byte layout of the state root. User contracts still see standard EVM execution. Proofs are served through `eth_getProof`-style RPCs synthesised against the twig store, so applications that want inclusion proofs get them. What they cannot do is hand a v1 UltraFast block header to a stock Ethereum MPT verifier and have it round-trip. The Succinct-style ZK light-client bridge referenced in §10 is built **against the QMDB commitment**, not against an MPT shadow root, which removes one of the usual reasons to maintain MPT-root parity.

This is a divergence from the EVM-client default. Stock `reth` ships MDBX. `geth` ships LevelDB (now Pebble) under an MPT. `erigon` ships MDBX under flat-state plus the MPT. **None of these chains ship QMDB in production today.** UltraFast is not implemented; the QMDB-backed `reth` integration is one of the Phase 0 walking-skeleton items called out in §16.1, and its exit criteria are the latency thresholds in §12.2. The risk of the swap - including QMDB's own research-stage maturity and the fact that no production L1 has yet adopted it - is enumerated rather than papered over.

---

## Part 2 - Deep research on QMDB

### Provenance and paper

QMDB ("Quick Merkle Database") was published by **LayerZero Labs Research** as arXiv:2501.05262, first version 9 January 2025, latest revision (v3) February 2025. Authors: Isaac Zhang, Ryan Zarick, Daniel Wong, Thomas Kim, Bryan Pellegrino, Mignon Li, Kelvin Wong. arXiv category is `cs.NI`. A reference implementation is open-sourced at **`github.com/LayerZero-Labs/qmdb`**, written in Rust (~98%), dual-licensed Apache-2.0 / MIT. As of mid-2025 the repository was active but had **no tagged releases**; the README itself flags QMDB as "ongoing research" with "some features still evolving."

### How it works

The core data structure is the **twig**, a fixed-depth subtree containing exactly **2048 leaf entries** in the reference implementation. Each entry is a key-value pair. A "fresh" twig lives entirely in DRAM; new entries are appended to its leaf nodes sequentially. Once a twig is full (2048 entries), it is asynchronously flushed to SSD as a single large sequential write and dropped from DRAM. Twigs progress through a lifecycle of **Fresh → Full → Inactive → Pruned**. A full twig's contents on disk are summarised in DRAM by a single 32-byte hash plus a 256-byte activity bitmap - roughly 99.9 % compression of the data needed to re-Merkleise the twig's 2048 entries and their upper nodes.

Above the twig layer is an **in-memory Merkle tree** that hashes twig roots up to the global state root. Because the twig population grows append-only, the tree depth grows as `log₂(U)` of the total number of state **updates** (not unique keys); the paper notes that after one year of operation at 10K TPS and five updates per transaction the tree depth tops out around 41.

State **lookup** uses a separate in-memory **indexer**, default a sharded B-tree variant consuming approximately **15.4 bytes of DRAM per key** (the often-quoted "2.3 bytes per entry" refers to the in-memory Merkle footprint above the twigs, not the indexer). The indexer extracts the 9 most significant bytes of each key - 2 for sharding, 7 for in-DRAM key fragment - with a pointer to the SSD position of the live entry. With 16 GB of DRAM the indexer addresses over one billion entries. Sharding gives parallelism on multi-core hosts.

I/O profile: **one SSD read per state access** (chase indexer pointer, read the entry's twig slab), **`O(1)` SSD I/Os per update** (append to fresh twig in DRAM, asynchronously flush full twig). Writes are large sequential blocks rather than random page-level updates, which is the SSD-friendly access pattern and minimises write amplification at the device level. The Merkleisation path issues **zero SSD reads and zero SSD writes** of world state, because twig hashes are computed in DRAM from the entry stream.

### Benchmark numbers

From the paper, on **AWS c7gd.metal** (64 vCPUs, 2 NVMe SSDs):
- Up to **2.28 million state updates per second**
- Up to **1 million token transfers per second** (the headline TPS figure, on a synthetic transfer workload)
- Up to **6× higher state-update throughput than RocksDB**, **8× higher than NOMT** (the previous published verifiable-DB leader)
- Scaled to **15 billion entries** (≈ 10× Ethereum's 2024 live state) in benchmarks
- Demonstrated capacity to **280 billion entries** on a single server (`i8g.metal-24xl`, 6 SSDs)
- Runs on commodity hardware: a Mini PC at ≈ \$540 (AMD R7-5825U, 64 GB DDR4, 4 TB NVMe) reproduced meaningful throughput

These are single-node, synthetic-workload numbers measured by the authors. There is no third-party reproduction published as of this writing.

### Crash safety and recovery

QMDB itself does **not** provide blockchain-grade ACID. The paper is explicit that "QMDB expects blockchains to build a buffering layer on top" - the chain is responsible for only flushing finalised data, and for replaying any in-flight blocks from the consensus log on restart. Recovery in QMDB consists of **replaying up to the last checkpoint and trimming inactive entries**. The implication for UltraFast is that the speculative-execution path (§6.4) must guard the QMDB commit behind threshold-signature finality - exactly what §6.4 says: "the QMDB state-root commit gates on finality."

### Proof system

QMDB supports **historical proofs**: it can serve inclusion / exclusion / historical-state proofs against any past block, not only the latest one. Proof size is `O(log U)` in update count rather than `O(log N)` in unique keys. This is relevant for `eth_getProof` synthesis and for the Ethereum-corridor light-client bridge.

### Comparison to other state-tree designs

| System | Tree shape | Backing store | Merkleisation I/O | Notes |
|---|---|---|---|---|
| **Ethereum MPT** (`geth`, `reth`, `erigon`) | Hexary Merkle-Patricia Trie | LevelDB/Pebble or MDBX | `O((log N)²)` SSD reads per update | Random-access I/O; root format is the Ethereum standard. |
| **Aptos / Diem Jellyfish Merkle Tree (JMT)** | Binary sparse trie, compacted | RocksDB (LSM) | LSM-tree-friendly but still random-read on lookup | Optimised for LSM write amplification; binary depth `log₂(N)`. |
| **Sui** | Accumulator over objects (no global state trie at the storage tier) | RocksDB | Per-object commitments | Different abstraction - object-centric rather than account/slot-centric. |
| **Celestia NMT** | Namespaced Merkle Tree over **data**, not state | n/a | `O(log N)` per insertion | Different problem domain (data-availability, not state). |
| **Sovereign Labs JMT** | Penumbra-style async JMT | Generic KV (pluggable) | LSM-friendly | Re-uses the Diem JMT shape; Rust-native. |
| **NOMT** (Thrum Research) | Binary Merkle, page-based | Custom page store | Targets one SSD read per access | Direct comparison point for QMDB; QMDB claims 8×. |
| **QMDB** | Twig-tree (fixed 2048-leaf subtrees over append log) | Append-only entry log + DRAM indexer | One SSD read per access, `O(1)` per update, **0 SSD I/O for Merkleisation** | DRAM indexer is the working-set bound. |

The structural family QMDB belongs to is the **append-only verifiable log**, closer in spirit to Certificate Transparency's history tree or to a JMT in version-control mode than to the Ethereum MPT. The key trick is that the twig boundary makes the upper tree small enough to keep in DRAM cheaply while pushing the leaf data to a sequential SSD log.

### SSD wear

The append-only design is favourable for flash. Page-level rewrites are eliminated; the write pattern is large sequential writes at twig-flush boundaries (2048 entries × entry size, batched). Garbage collection of inactive entries is the wear consideration; the paper does not give explicit device-level write-amplification numbers but argues the architecture is "designed to take advantage of modern SSDs and minimize flash write amplification." For UltraFast's perp workload, where the same hot keys are rewritten many times per second, this matters: an MPT-on-MDBX path would cause severe page-rewrite amplification at the device level, while QMDB writes new entries linearly.

### Adoption status

Beyond the LayerZero-internal **FAFO** system (arXiv:2507.10757, July 2025) which builds a parallel-EVM scheduler on top of QMDB and claims over 1.1 M ETH transfers per second on a single node while Merkleising every block, **no production L1 has shipped QMDB** as of the time of writing. UltraFast would be among the earliest external adopters. The GitHub repository shows steady but small-team development, no tagged releases, no published audit, and a README that flags ongoing research. There is no public bug-bounty programme of the size customary for production state databases.

### Maturity caveats

Honest list for the whitepaper to internalise:

1. **No production deployment** of QMDB exists at the time of UltraFast's design draft. The closest data point is FAFO, also from LayerZero, which is itself a research prototype.
2. **No third-party reproduction** of the headline benchmarks has been published. The numbers (2.28 M state updates/s, 1 M TPS) are author-measured on author-chosen hardware.
3. **No public audit** of the implementation. State databases are a high-blast-radius component for a chain holding custody.
4. **No tagged release** in the reference repository. API stability and on-disk format stability are not guaranteed.
5. **EVM/MPT compatibility was not a design goal** of QMDB. UltraFast accepts this and synthesises `eth_getProof`-style proofs at the shim layer rather than maintaining an MPT shadow root.
6. **Recovery is delegated to the host chain.** UltraFast must ensure the consensus replay log can reconstruct any in-flight state QMDB hasn't yet checkpointed.
7. **In-DRAM indexer is the working-set bound.** At ~15.4 bytes per key, a chain with 10 billion live entries needs ≈ 150 GB of RAM just for the indexer. The 2.3-bytes-per-entry figure is the Merkle layer only; it is sometimes misquoted as the whole working set.

These are exactly the points Phase 0 of UltraFast's walking-skeleton (§16.1) needs to convert from claim to measurement before the architecture is anything more than a proposal.

---

## Sources

- LayerZero Labs Research. "QMDB: Quick Merkle Database." arXiv:2501.05262, January 2025 (v3 February 2025). https://arxiv.org/abs/2501.05262
- LayerZero-Labs/qmdb reference implementation. https://github.com/LayerZero-Labs/qmdb
- LayerZero Labs. "FAFO: Over 1 million TPS on a single node running EVM while still Merkleizing every block." arXiv:2507.10757, July 2025. https://arxiv.org/abs/2507.10757
- LayerZero-Labs/fafo. https://github.com/LayerZero-Labs/fafo
- LayerZero research page. https://layerzero.network/research/qmdb
- Diem Foundation. "Jellyfish Merkle Tree." 2021. https://developers.diem.com/papers/jellyfish-merkle-tree/2021-01-14.pdf
- Penumbra JMT (Rust async port). https://github.com/penumbra-zone/jmt
- Paradigm. `reth`. https://github.com/paradigmxyz/reth
- Moonlight literature review of QMDB. https://www.themoonlight.io/en/review/qmdb-quick-merkle-database
