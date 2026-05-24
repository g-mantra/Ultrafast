# Block-STM

Block-STM (Block Software Transactional Memory) is an optimistic concurrency-control protocol for executing a pre-ordered block of transactions in parallel on multi-core hardware. Introduced by Aptos Labs in March 2022, it is now the dominant parallel-execution primitive for Move-based chains and the closest available reference implementation for parallelising the EVM. UltraFast adopts it as the per-block execution engine inside the reth EVM lane. Aptos-style aggregator primitives are layered on top to defuse the hot-key pathology that vanilla Block-STM exhibits on a derivatives workload.

---

## Part 1: How UltraFast uses Block-STM, and why

### Role in the stack

UltraFast runs a Cancun-parity EVM via reth driven through the Engine API (whitepaper §6.1). Inside reth, transactions in a finalised block are executed under Block-STM rather than the stock sequential EVM executor. Each transaction speculatively executes in parallel against a multi-version in-memory store, and the runtime tracks per-transaction read sets and write sets. A validation phase compares those sets against the canonical block order, and conflicting transactions are aborted and re-executed in dependency order.

Validation and re-execution are scheduled by Block-STM's collaborative scheduler. The scheduler prioritises tasks for transactions earlier in the preset order to keep the dependency front advancing.

The output is deterministic: the final state is identical to what serial execution in the preset order would produce. Block-STM is therefore safe to use under deterministic-replay consensus (Threshold Simplex with the Minimmit fast path, §5), where every validator must arrive at the same post-state.

### Why Block-STM specifically

Three considerations:

1. **Near-linear speedup under low contention.** Aptos benchmarks report up to ~160k–170k TPS on workloads with low conflict density and roughly 20x speedup over the sequential baseline at 32 threads. For UltraFast's mixed EVM workload (vaults, lending markets, structured products, liquidator bots, builder-code routers) most transactions touch disjoint storage, so the regime is favourable.
2. **No upfront access-list discipline.** Unlike Solana's Sealevel, Block-STM does not require contracts or transaction submitters to declare read-write sets ahead of time. This preserves stock EVM semantics: any Solidity contract compiled against Cancun parity runs unmodified, and inherits the Ethereum tooling stack (Foundry, Hardhat, Etherscan) without a parallel-aware compiler pass.
3. **Production evidence.** Block-STM has been live in Aptos since mainnet (October 2022). It was ported to Polygon PoS Bor and shipped in the Bhilai hardfork (July 2025). Monad adopted it as the basis for its optimistic parallel EVM (testnet February 2025, mainnet November 2025). The architectural pattern reth + Block-STM is the path Tempo and Monad have converged on, and the one UltraFast follows (§15).

### The hot-key pathology and the aggregator fix

Block-STM's optimism collapses under hot-key contention. If every transaction in a block writes the same storage slot, every speculative execution conflicts with every other. The scheduler then degenerates to sequential re-execution, slower than a plain sequential executor because of the validation overhead.

The canonical perp-DEX workload triggers this exactly. Every fill writes the fee accumulator; every funding tick writes the funding accumulator; every liquidation writes the insurance fund; every vault deposit or withdraw writes the share-supply slot. Under stock Block-STM these become serialisation points.

UltraFast addresses this with Aptos-style aggregator primitives (§6.3). The `SLOAD; ADD; SSTORE` pattern is lifted to a typed `Incr(key, delta)` operation that the runtime knows to be commutative. Two concurrent `Incr` calls on the same key do not abort each other. They commute, with the materialised value computed at the next read or at the tick boundary.

The aggregator surface is exposed day-1 for the system contracts that own the hot keys: CLOB fee accumulator, funding accumulator, insurance fund, vault share supply, builder-code accumulator. Whether the surface is exposed to general user contracts is an open decision (§16).

This pairing is the standard Aptos pattern, transposed to an EVM context. Block-STM handles parallelism on the cold majority of state, and aggregators handle commutativity on the small set of hot system keys. Monad's parallel EVM is the closest published analogue, although Monad does not yet ship a comparable aggregator surface for user contracts. UltraFast is pre-implementation. The Phase 0 walking-skeleton (§16) is the validation gate that converts this design into measured throughput numbers.

---

## Part 2: Block-STM in depth

### Origins and paper

The protocol is described in Gelashvili et al., **"Block-STM: Scaling Blockchain Execution by Turning Ordering Curse to a Performance Blessing"**, arXiv:2203.06871 (first version March 2022, v3 August 2022). Authors: Rati Gelashvili, Alexander Spiegelman, Zhuolun Xiang, George Danezis, Zekun Li, Dahlia Malkhi, Yu Xia, Runtian Zhou. The paper was published in the Proceedings of the 28th ACM SIGPLAN Symposium on Principles and Practice of Parallel Programming (PPoPP 2023), DOI 10.1145/3572848.3577524. Reported peak: 110k TPS in Diem benchmarks and 170k TPS in Aptos benchmarks, with up to 20x speedup over sequential at 32 threads under low contention.

### Algorithm

Block-STM combines three classical ideas into a scheduler tuned for the blockchain block model: optimistic concurrency control (OCC), software transactional memory (STM), and deterministic serialisation via a preset order.

**Preset order as ground truth.** Transactions enter Block-STM with a total order fixed by the block producer. The protocol's correctness criterion is that the final post-state must be identical to the sequential execution of that order. Any speculative re-ordering is acceptable as long as conflicts that violate the preset order are detected and resolved by re-execution.

**Multi-version in-memory data structure.** Every write is recorded as `(key, version)` where version is the transaction index in the preset order. Reads obtain the value written by the highest-version transaction that precedes the reader. The structure is in-memory only, living for the duration of block execution; the committed state is written to the underlying store (in UltraFast's case QMDB) after the block resolves. Multi-versioning lets transaction T_i read the speculative output of T_j (j < i) without waiting for T_j to commit. It also lets the system retain the original pre-block value as version "−1" for rollback.

**Read and write sets.** Each speculative execution records its read set (the keys read and which version it read) and its write set (the keys written and the new values). Validation re-checks the read set against the multi-version store. If any key in the read set now has a higher-priority writer than what was observed, the read is invalidated and the transaction is aborted.

**Collaborative scheduler.** Worker threads pull two task types from a shared scheduler. Execution tasks run transaction T_i speculatively; validation tasks re-check T_i's read set after some lower-index transaction was re-executed. The scheduler prioritises low-index transactions for both task types. This is the "turning ordering curse to a performance blessing" idea: the preset order is exactly the information needed to schedule the dependency front efficiently. When T_j (low index) is re-executed, all higher-index transactions whose reads depended on T_j's writes are marked for re-validation, and a cascade of re-execution may follow.

**Abort and re-execute.** A failed validation marks the transaction as aborted and increments its incarnation counter. The scheduler will re-execute it in a later task, reading fresh values from the multi-version store. The protocol guarantees liveness. With a finite number of transactions and a finite number of conflict edges, the scheduler always makes progress. It eventually reaches a fixed point where every transaction has been executed and validated against the final state.

**Determinism.** The post-state and the commit order are deterministic functions of the input block. Re-running the same block on a different machine with a different number of cores produces an identical result.

### Production implementations

**Aptos (Move).** Reference implementation. Source: `aptos-labs/aptos-core` on GitHub, primarily the `aptos-vm` and `aptos-block-executor` crates. In production since Aptos mainnet (October 17, 2022). Aggregators ship in `aptos-framework/aggregator_v2`, exposed via AIP-47 (proposed) and AIP-79 (delayed-fields generalisation). This is the codebase UltraFast's design takes its cues from.

**Polygon PoS (Go / EVM).** Polygon ported Block-STM to Bor (Polygon's go-ethereum fork), branch `0xPolygon/bor` at `block-stm`. It shipped to mainnet as part of the **Bhilai hardfork in July 2025**, lifting throughput to over 1,000 TPS and the block gas limit from 30M to 45M. The Bor port uses a "minimal metadata" approach. The block builder appends a dependency-DAG hint to the block header, so validators can begin scheduling without re-deriving the dependency graph from scratch. Reported result: ~1.6x gas-throughput improvement on mainnet traffic with a path to 2x; roughly 55% of mainnet transactions were observed to be parallelisable.

**Monad (parallel EVM).** Monad's execution engine is described as optimistic parallel execution with re-execution on conflict: a Block-STM-style approach adapted to EVM semantics. It is paired with an asynchronous "order first, execute after" pipeline so consensus does not block on execution. Public testnet launched February 19, 2025; mainnet went live November 24, 2025. Reported testnet peaks around 3,000 TPS on real workloads, with the architecture targeting 10,000 TPS at mainnet.

**Movement (Move / EVM hybrid).** Movement Labs employs Block-STM in its MoveVM-on-Ethereum rollup design. Public mainnet beta launched March 10, 2025 with ~$250M TVL at launch. Movement is the closest production reference for running Block-STM in a rollup setting, although its execution shape (Move primary, EVM secondary) differs from UltraFast's (EVM primary).

**Other ports.** RiseChain's `pevm` (originally branded `block-stm-revm`) is an open-source Block-STM port targeting revm. BNB Chain has published research on a parallel EVM for opBNB using Block-STM-style techniques.

### Comparison to other parallel-execution models

**Solana's Sealevel.** Pessimistic concurrency control with mandatory access lists. Every transaction declares the accounts it will read and write before execution; the scheduler partitions transactions into non-conflicting batches and runs each batch in parallel under read-write locks. Strengths: zero validation overhead, predictable scheduling, no wasted speculative work. Weaknesses: requires programs and clients to know and declare access lists statically; conservative access lists serialise more than necessary; storage models that don't map cleanly to account-key declarations (e.g. dynamic mappings indexed by runtime data) are awkward.

UltraFast chose Block-STM over Sealevel-style scheduling because EVM does not have an access-list discipline at the application layer. A Sealevel-style port would require either a parallel-aware Solidity dialect or aggressive static analysis, both surfaces UltraFast does not want to introduce.

**Sui's object model.** Sui sidesteps STM entirely. State is modelled as discrete objects with explicit owners; transactions that touch only owned objects (single-writer) are committed in parallel without consensus. Shared objects still require consensus and a sequencer. This is structurally elegant but requires applications to be written against an object-oriented state model, which the EVM is not.

**Tron / classical lock-based runtimes.** Several EVM-style chains have shipped lock-based parallel executors with explicit critical sections. These tend to be conservative in practice: locks are wide-grained, and the achievable speedup on realistic Solidity workloads has been modest.

**Empirical analyses** of Ethereum and Solana mainnet transaction conflicts (e.g. arXiv:2505.05358) show meaningful headroom for optimistic parallelism on Ethereum-style workloads. Even before aggregator-style fixes, Block-STM-style execution can extract significant parallel speedup on real mainnet traffic. The reason: hot-key density on a general-purpose chain is lower than on a derivatives venue. UltraFast's perp-DEX workload sits at the high-contention end of this spectrum, which is precisely why the aggregator surface is required.

### Limitations and how UltraFast addresses them

**Hot-key pathology.** As above. Vanilla Block-STM degenerates to sequential under same-slot write contention. Mitigations: Aptos aggregators (UltraFast's choice, §6.3), Sui-style object orientation (incompatible with EVM), Solana-style explicit access lists (incompatible with stock Solidity). The aggregator surface is exposed day-1 for system contracts; whether to expose it to general user contracts via precompile + Solidity library is an open decision (§16).

**Validation overhead.** Block-STM does real work on aborted transactions: speculative execution, multi-version writes, validation, then re-execution. Under pathological contention this overhead can make Block-STM slower than sequential. The Aptos paper measures this at no more than ~30% overhead under high contention. UltraFast cannot take that figure for granted on a derivatives workload, so Phase 0 must measure it directly.

**Memory pressure.** The multi-version data structure must retain every version produced during block execution. For long blocks under high write density this is a real memory cost. UltraFast's tick cadence (100 ms, §7.1) and block cadence (one block per tick) keep per-block transaction counts bounded, which limits the worst case.

**Determinism under non-deterministic scheduling.** Block-STM commits to a deterministic post-state regardless of how its threads schedule. This requires care in the implementation: any non-determinism (e.g. relying on iteration order over a hashmap, or on the wall-clock to break ties) breaks the safety property. The reth-side Block-STM integration must be audited for this exactly.

**Speculative-execution interaction with consensus.** UltraFast also runs speculative execution against the proposal before the threshold-signature certificate arrives (§6.4). This is a different speculation, block-level rather than transaction-level, but composes with Block-STM cleanly. The speculative block is run under Block-STM internally, and the entire speculative state is discarded deterministically if Threshold Simplex skips the view. The combination is what unlocks the ~200 ms p50 finality target.

### Status for UltraFast

Not implemented. The execution-layer design is settled at the architectural level: reth via Engine API, Block-STM as the in-block executor, aggregators for hot keys. The integration work is Phase 0 / Phase A work and has not been done. That work covers porting Block-STM into reth, wiring the aggregator surface as a custom precompile, and exercising the multi-version store against QMDB. It also requires measuring throughput and abort rates on a derivatives-shaped workload.

The whitepaper distinguishes design targets from measurements throughout, and the Block-STM integration falls on the design-target side of that line.

---

## References

- Gelashvili, R., Spiegelman, A., Xiang, Z., Danezis, G., Li, Z., Malkhi, D., Xia, Y., Zhou, R. "Block-STM: Scaling Blockchain Execution by Turning Ordering Curse to a Performance Blessing." arXiv:2203.06871 (March 2022, v3 August 2022). PPoPP 2023, DOI 10.1145/3572848.3577524.
- Aptos Labs. "Block-STM: How We Execute Over 160k Transactions Per Second on the Aptos Blockchain." Medium, 2022.
- Aptos Labs. "Aggregators: How Sequential Workloads Are Executed in Parallel on the Aptos Blockchain." Medium, 2023.
- Aptos source: `aptos-labs/aptos-core` (`aptos-vm`, `aptos-block-executor`, `aptos-framework/aggregator_v2`). AIP-47, AIP-79.
- Polygon. "Innovating the Main Chain: A Polygon PoS Study in Parallelization." Polygon blog. Bor source: `0xPolygon/bor` branch `block-stm`. PIP-63 (Bhilai hardfork, July 2025).
- Monad. "Parallel Execution." docs.monad.xyz. Testnet February 2025, mainnet November 2025.
- Movement Network Foundation. Public mainnet beta announcement, March 2025.
- RiseChain. `risechain/pevm` (formerly `block-stm-revm`) Block-STM port to revm.
- "Block-STM vs. Sealevel: A Comparison of Parallel Execution Engines." Eclipse / HackerNoon, 2023.
- "Empirical Analysis of Transaction Conflicts in Ethereum and Solana for Parallel Execution." arXiv:2505.05358 (2025).
- UltraFast whitepaper §6.1 (reth via Engine API), §6.2 (Block-STM), §6.3 (aggregator primitives), §6.4 (speculative execution), §15 (Monad reference), §16 (aggregator-surface and EVM-compatibility open decisions).
