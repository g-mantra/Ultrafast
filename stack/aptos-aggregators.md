# Aptos Aggregator Primitives

Reference research for UltraFast whitepaper §6.3 ("Aggregator primitives"), §6.2 ("Block-STM"), and §16 (open decision on aggregator general-contract surface). Citation [5] in the whitepaper points at `aptos-labs/aptos-core`, `aptos-framework/aggregator_v2`.

## Part 1 - How UltraFast uses aggregator primitives

The execution layer (§6.1–6.4) is reth driven via the Engine API, parallelised by Block-STM. Block-STM is optimistic concurrency control: transactions in a block execute speculatively in parallel, conflicts are detected by read/write-set comparison, and conflicting transactions abort and re-execute in dependency order. Under low contention this approaches linear speed-up in core count. Under hot-key contention it collapses toward sequential. This is the canonical perp-DEX pathology: one funding accumulator per market, one fee accumulator, and one insurance fund attract concurrent writes that all conflict on the same storage slot.

The aggregator surface is the lever UltraFast pulls to keep Block-STM in its parallel regime on that pathology. It lifts the standard `SLOAD; ADD; SSTORE` triple to a typed `Incr(key, delta)` operation that the runtime knows to be commutative. Two concurrent `Incr` operations on the same key do not produce a Block-STM abort. Addition commutes, so the multi-version data structure can record both deltas and resolve the final value at materialisation time. The same property holds for subtraction.

The VM records *operation type*, not just before/after diffs, and that is what unlocks parallelism on the hot key.

UltraFast exposes the surface day-1 for system contracts:

- CLOB fee accumulator (per-tick fees credited to the fee vault, hot on every fill).
- Funding accumulator (per-market cumulative funding index, written every funding interval and on rate updates).
- Insurance fund (debited on liquidation shortfall, credited on liquidation surplus - concurrent in volatile windows).
- Vault share supply (mint / burn on deposit / withdraw - the canonical "total supply" hot key).
- Builder-code accumulator (§13.6 - fee share credited per fill, one slot per builder code).

A general-contract surface is named in §16 as an explicit open decision. The surface would be a custom precompile plus a Solidity library that any user contract can call. The §16 phrasing: "native precompile for all user contracts versus reserved for system contracts only versus not exposed." The argument for opening it: general user contracts (vaults, lending markets, structured products) hit the same hot-key pathology. The day-1 system-contract surface does not help them. The argument against is precompile-surface bloat and the additional audit footprint.

The supported operations are `add`, `sub`, `read`, and `read_with_overflow_check`. Reads materialise the current value and force a serialisation point: every preceding `Incr` against that key has to be applied before the read returns. This is acceptable at tick boundaries (the FBA settles, the fee accumulator is read once per tick to credit the fee vault) and rare on the mid-tick path. The overflow policy is a hard cap at `u128`: an over-cap operation aborts the transaction rather than silently saturating, matching Aptos `aggregator_v2` `try_add` semantics.

UltraFast diverges from Aptos in surface only: Aptos exposes the primitive as a Move resource type, accessed via a framework module. UltraFast is EVM, so the equivalent has to ship as a precompile plus a Solidity library that wraps the precompile call. The Block-STM-side machinery is the same - the executor needs a delayed-fields multi-version data structure that records `Incr(key, delta)` rather than `(key, old_value, new_value)`.

## Part 2 - Deep research on Aptos Aggregators

### The core idea

Aggregators are typed commutative counters in Move. Instead of an `SLOAD; ADD; SSTORE` triple against a `u64` or `u128` storage cell, contract code calls `aggregator_v2::try_add(&mut agg, delta)` or `try_sub`. The Move VM and the Block-STM executor cooperate to record the operation as a *delta against a delayed field*. It is not recorded as a read of the current value followed by a write of the new value. Concurrent `try_add` / `try_sub` calls against the same aggregator commute and do not produce read/write conflicts in Block-STM's multi-version data structure.

The Aptos Labs design note states the design intent directly. Aggregators "delay the reads from the blockchain state and defer the writes back to the state." The conflicting parts are captured and speculatively predicted so the main body of the transaction can run fully in parallel.

The trick depends on Block-STM's pre-existing multi-version map: write-write conflicts on the same key were already resolved by version stamps. Aggregators extend the same mechanism to address read-after-write. A `try_add` does not have to read the current value; it only has to confirm the result would stay inside the configured bounds. Block-STM speculatively predicts the bound check and only re-executes if the prediction was wrong.

### The two generations

**Aggregator V1** (AIP-43, framework module `aptos_framework::aggregator`) shipped the basic idea: a resource type with `add`, `sub`, `read`, plus a fixed cap. It addressed the immediate pathology - every Aptos transaction burns gas, so the native-token total-supply counter was a global hot key that serialised the entire chain. V1 was framework-only and gated; user contracts could not allocate aggregators directly.

**Aggregator V2** (AIP-47, framework module `aptos_framework::aggregator_v2`) is the current generation. AIP-47 was authored by `georgemitenkov`, `vusirikala`, `gelash` (Rati Gelashvili, who is also the Block-STM author), and `igor-aptos`, accepted on 2023-09-08 as a Core / Framework AIP. V2 adds:

- Generic `IntElement` parameter (currently `u64` and `u128`).
- `try_add` / `try_sub` returning `bool` rather than aborting (the unconditional `add` / `sub` wrappers abort on overflow / underflow).
- `is_at_least(min)` - a parallelism-friendly comparison that does not force a read.
- `snapshot` / `read_snapshot` - capture an aggregator's value at a moment in time without materialising it on the read side.
- `derive_string_concat` - derive a string (e.g. an NFT name `"Token #N"`) from a snapshot, so collection minting can stamp a unique name per token without serialising on the supply counter.
- `create_unbounded_aggregator` - no `max_value` beyond the type width.

The framework module's own doc comment is the canonical statement of the parallelism contract:

> From parallelism considerations, there are three different levels of effects:
> - enable full parallelism (cannot create conflicts): `max_value`, `create_*`, `snapshot`, `derive_string_concat`
> - enable speculative parallelism (generally parallel via branch prediction): `try_add`, `add`, `try_sub`, `sub`, `is_at_least`
> - create read/write conflicts, as if you were using a regular field: `read`, `read_snapshot`, `read_derived_string`

Source: `aptos-move/framework/aptos-framework/sources/aggregator_v2/aggregator_v2.move`, lines 15–22.

### API in detail (from the V2 source)

```move
struct Aggregator<IntElement> has store, drop {
    value: IntElement,
    max_value: IntElement,
}

struct AggregatorSnapshot<IntElement> has store, drop {
    value: IntElement,
}

public native fun create_aggregator<IntElement: copy + drop>(max_value: IntElement): Aggregator<IntElement>;
public native fun create_unbounded_aggregator<IntElement: copy + drop>(): Aggregator<IntElement>;

public native fun try_add<IntElement>(self: &mut Aggregator<IntElement>, value: IntElement): bool;
public native fun try_sub<IntElement>(self: &mut Aggregator<IntElement>, value: IntElement): bool;

public fun add<IntElement>(self: &mut Aggregator<IntElement>, value: IntElement);  // aborts on overflow
public fun sub<IntElement>(self: &mut Aggregator<IntElement>, value: IntElement);  // aborts on underflow

public fun is_at_least<IntElement>(self: &Aggregator<IntElement>, min_amount: IntElement): bool;

public native fun read<IntElement>(self: &Aggregator<IntElement>): IntElement;  // forces serialisation
public native fun snapshot<IntElement>(self: &Aggregator<IntElement>): AggregatorSnapshot<IntElement>;
public native fun read_snapshot<IntElement>(self: &AggregatorSnapshot<IntElement>): IntElement;  // forces serialisation
public native fun derive_string_concat<IntElement>(before: String, snapshot: &AggregatorSnapshot<IntElement>, after: String): DerivedStringSnapshot;
```

Error codes are `EAGGREGATOR_OVERFLOW = 1`, `EAGGREGATOR_UNDERFLOW = 2`, `EUNSUPPORTED_AGGREGATOR_SNAPSHOT_TYPE = 5`, `EAGGREGATOR_API_V2_NOT_ENABLED = 6`, `EUNSUPPORTED_AGGREGATOR_TYPE = 7`. The error class is `error::out_of_range` for overflow / underflow.

The `is_at_least` API is the parallelism-friendly substitute for `read(agg) > threshold`. The source comment notes it can be composed into `is_at_most` and `is_equal` without forcing a read.

### Implementation in Block-STM

The Block-STM side of the implementation lives in `aptos-core/aptos-move/`. The relevant files are:

- `aptos-move/mvhashmap/src/versioned_delayed_fields.rs` - the multi-version data structure that records delayed `Incr` / `Decr` deltas keyed by aggregator ID and transaction version.
- `aptos-move/block-executor/src/executor.rs` - handles validation and materialisation of delayed fields when a transaction reads an aggregator or when the block commits.
- The VM-side `TDelayedFieldView` interface tracks `CapturedReads.delayed_field_reads`.

Conceptually: every `try_add` writes a delta entry into the versioned delayed-fields map. The bound check uses a speculative branch prediction - assume the most-likely branch (does not overflow), and re-execute only if the assumption was violated. A `read` forces the executor to apply all preceding deltas in version order and materialise the value. From that point the aggregator is treated as a regular read for conflict-detection purposes within the transaction.

### Production status

Aggregators (V1, framework total-supply pattern) shipped on Aptos mainnet early in the chain's life. V2 (AIP-47) was rolled out via framework upgrade.

The Aptos Labs aggregators blog reports order-of-magnitude speed-ups on the canonical workloads. A 1 M-item NFT collection minted in roughly 90 s (~10× over the non-aggregator path); 5 M items in 8 minutes; and roughly 9× on an unbounded-counter benchmark. Tapos in May 2024 sustained ~326 M transactions over three days with no fee spikes. That workload was heavy on the NFT-mint pattern that V2 unblocks.

### Use cases on Aptos

- Coin total-supply (`aptos_coin`, all `Coin<T>` and `FungibleAsset` totals).
- NFT collection supply and per-collection sequence numbers, with `derive_string_concat` stamping the unique name without serialising.
- Gas-fee burn counters.
- Per-account sequence-number-adjacent counters where the conflict pattern is monotonic.

### Limitations

- Only commutative integer addition / subtraction is safe. Multiplication is not commutative with addition; arbitrary state transitions are not aggregator-eligible.
- Reads (and `read_snapshot`, `read_derived_string`) materialise and serialise. A contract that reads the aggregator in the mid-block hot path defeats the parallelism. The framework module's doc comment warns explicitly that `read` is "resource-intensive and reduces parallelism". Calling it in a mid-block transaction can serialise that transaction up to `concurrency_level` times slower.
- The cap policy is a design choice. Hard-cap-with-abort (Aptos `try_add` returning `false`, `add` aborting) preserves correctness but propagates failure to the caller. Silent saturation would be cheaper to handle but breaks accounting invariants on counters like total supply or insurance-fund balance.
- Only `u64` and `u128` are supported; signed types and arbitrary `IntElement` are not yet wired through the native side (the source comments mark this as "waiting for integer traits").
- The aggregator value is consensus-private from the caller until `read` is called, which is the whole point - but it means a contract that needs to branch on the exact value cannot do so without paying the serialisation cost.

### Other projects

**Sui.** Sui takes a different route. The Sui object model parallelises by *partitioning state into objects*: independent transactions on different objects run in parallel without needing aggregator semantics. Shared objects (e.g. a counter that everyone writes to) are sequenced through consensus and execute serially against that object. Transactions on disjoint shared objects can still run in parallel. Sui has no direct aggregator-equivalent type; the parallelism story is "structure your state so there is no shared hot object."

**Move-family chains.** Movement and other Move-VM chains inherit the framework. `aptos_framework::aggregator_v2` is part of the Move framework Aptos publishes, and downstream Move chains can adopt it directly. Sui's variant of Move does not include this module because Sui's parallelism model does not need it.

**Monad / parallel-EVM.** Monad shipped mainnet in late 2025 with a parallel EVM executor (optimistic concurrency over MonadDb), targeting ~10 k TPS and 1 s finality. Public Monad documentation as of 2025 does not describe a typed-commutative-operation primitive equivalent to Aptos aggregators. The architectural pattern UltraFast adopts (reth via Engine API plus Block-STM) is the same pattern Monad uses at a different layer of the stack. The aggregator surface is the UltraFast-specific addition on top.

**Sei, MegaETH, other parallel-EVM efforts.** Public documentation does not describe an EVM-side typed-commutative primitive comparable to `aggregator_v2`. The general pattern in parallel-EVM research is to rely on read/write-set partitioning hints declared by the contract. The aggregator approach is more general: typed effect, runtime-known commutativity, no hint needed at the call site. UltraFast adopts that approach.

### Open questions for UltraFast

1. **Precompile address and ABI.** Solidity library wrapping a precompile at a stable address. Method selectors for `add`, `sub`, `try_add`, `try_sub`, `read`, `is_at_least`, `snapshot`, `read_snapshot`.
2. **Storage layout.** Aggregator allocations need stable IDs that survive contract storage layout. One option: an aggregator-table system contract that hands out IDs and stores the materialised values on `read`; the precompile dispatches against the ID.
3. **General-contract surface decision (§16).** Day-1 system-contract only, or expose to all user contracts. If general-contract, gas pricing for `add` / `read` needs to discourage hot-key reads.
4. **Signed aggregators.** Funding accumulators are signed in the general case (a market can owe longs or owe shorts). Aptos V2 is unsigned `u64` / `u128`; UltraFast either inherits unsigned and folds sign into a pair of aggregators (add-on-credit, add-on-debit) or extends the primitive.
5. **Snapshot equivalent.** Whether to expose `snapshot` / `derive_string_concat` on the EVM side. The string-derive use case is NFT-mint-shaped; less obviously useful for the UltraFast workloads, but the snapshot-of-counter primitive itself (capture without materialising) is useful for end-of-tick fee accounting.

## Sources

- Aptos `aggregator_v2.move` source: `aptos-move/framework/aptos-framework/sources/aggregator_v2/aggregator_v2.move` in `aptos-labs/aptos-core` (https://github.com/aptos-labs/aptos-core)
- Aptos `aggregator_v2.md` framework doc: https://github.com/aptos-labs/aptos-core/blob/main/aptos-move/framework/aptos-framework/doc/aggregator_v2.md
- AIP-47 "Aggregator V2": https://github.com/aptos-foundation/AIPs/blob/main/aips/aip-47.md
- AIP-43 "Parallelize Digital Assets / Token V2 minting / burning": https://github.com/aptos-foundation/AIPs (aip-43.md)
- Aptos Labs, "Aggregators: How sequential workloads are executed in parallel on the Aptos Blockchain": https://medium.com/aptoslabs/aggregators-how-sequential-workloads-are-executed-in-parallel-on-the-aptos-blockchain-e7992c70cefb
- Block-STM source paper, Gelashvili et al., arXiv:2203.06871
- Aptos Labs, "Block-STM: How We Execute Over 160k Transactions Per Second on the Aptos Blockchain": https://medium.com/aptoslabs/block-stm-how-we-execute-over-160k-transactions-per-second-on-the-aptos-blockchain-3b003657e4ba
- Block-STM delayed-fields implementation: `aptos-move/mvhashmap/src/versioned_delayed_fields.rs` and `aptos-move/block-executor/src/executor.rs` in `aptos-labs/aptos-core`
- Sui Object Model: https://docs.sui.io/guides/developer/objects/object-model
- Sui parallelisation overview: https://blog.sui.io/parallelization-explained/
- Monad parallel EVM (mainnet 2025-11-24): https://rango.exchange/learn/market-trends/monad-blockchain-review
