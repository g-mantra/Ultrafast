# TLA+ Formal Specification

## Part 1: How UltraFast uses TLA+ and why

TLA+ in the UltraFast whitepaper is a formal-verification umbrella, not a single artefact. §17 names six specific invariants that will be expressed as TLA+ specifications, with the composition step planned at the end of Phase A:

1. **Consensus safety** - Threshold Simplex (§5.1) plus Minimmit (§5.2) under the launch parameters (~30 validators, $f < n/3$ Byzantine bound, $n \geq 5f+1$ Minimmit quorum, two-region topology). The specification must show that no two conflicting blocks finalise and that view-skip preserves the invariants Minimmit decouples from view advance.
2. **MCP censorship-resistance** - the v1.1 Multi-Concurrent-Proposer rollout (§8.1). The spec captures the property that no single proposer can systematically exclude a transaction; this is the structural fix for the v1 single-proposer censorship gap named in the §14 risk table.
3. **FBA no-intra-tick-MEV** - Frequent Batch Auction matching (§7). The specification must prove that within a single tick (default 100 ms), no observable ordering-dependent rent extraction is possible against the uniform clearing price and pro-rata fill rule.
4. **Risk-engine no-negative-equity** - the perp and scalar-prediction-market margin engine (§9.3). Once the cross-product risk model is selected from the three open candidates (portfolio margining, additive offsets, SPAN-style risk arrays), the TLA+ specification establishes that no admissible state trajectory leaves an account with equity below zero before liquidation completes.
5. **Gasless-lane DoS budget invariant** - the turing-incomplete order lane (§6.5). The spec captures the per-block compute and bandwidth budget that bounds the cost of free order submission and proves the budget is not exceedable by any adversarial submission pattern.
6. **Speculative-execution rollback determinism** - the §14 risk-table entry. The contract is that speculative state is committed only on finality and that on view-skip the speculative state is discarded before the next proposal; the TLA+ specification proves this is the only admissible behaviour, closing the "induced view-skip to weaponise speculative state" attack.

The composition step is the point. UltraFast layers six interacting subsystems (consensus, MCP, FBA, risk, gasless lane, speculative execution). Each is locally amenable to specification, but liveness traps emerge from composition - an invariant of one layer can starve another. §17 commits to composing the six specifications at the end of Phase A to prove the composition is liveness-trap-free before mainnet.

Why TLA+ rather than implementation tests, runtime verification, or proofs in code: high-assurance specification of safety and liveness invariants *before* implementation reduces audit risk in production, documents intended behaviour for external reviewers, and makes the design reviewable independently of the code that will eventually implement it. The whitepaper treats TLA+ as design output, not as a verification artefact attached to a finished implementation. None of the six specifications exist yet; UltraFast is pre-implementation.

## Part 2: Deep research on TLA+

### How it works

TLA+ is a formal specification language developed by Leslie Lamport. Lamport began publishing on the temporal logic of actions in 1990 and formally introduced TLA in "The Temporal Logic of Actions" (1994). TLA+ extends TLA with a set-theoretic data language built on first-order logic and Zermelo–Fraenkel set theory, plus a module system. The language is untyped: unlike Coq, Lean, or Isabelle/HOL, type information is encoded as set membership in invariants.

A TLA+ specification is a mathematical state machine. It declares variables, an initial-state predicate, and a next-state action - a relation between the current and primed (next) values of the variables. Properties are stated as temporal-logic formulas over execution traces: safety properties ("nothing bad happens") as invariants, liveness properties ("something good eventually happens") as fairness conditions and eventual-completion formulas.

The standard workflow is: write the specification, state the invariants and temporal properties to check, run a model checker on a bounded instance, iterate until the spec is fixed, then optionally prove the invariants for unbounded instances with a proof assistant.

### Tools and implementations

**TLC** is the original explicit-state model checker. It enumerates the reachable state space of a finite instance of the spec and reports invariant violations or temporal-property failures with a counter-example trace. TLC is the workhorse for design-time bug-finding.

**Apalache** is a symbolic model checker for TLA+ (and Quint), developed originally at Informal Systems and now maintained as `apalache-mc/apalache` on GitHub. Apalache translates the spec into SMT (Microsoft Z3). It supports randomised symbolic execution to bounded depth $k$, bounded model checking over all executions to depth $k$, and inductive-invariant checking for unbounded executions. Apalache is the right tool when explicit-state enumeration blows up but the state predicates remain in a decidable SMT fragment. The project remains active through 2025–2026 (recent refactoring March 2026; community work documented an inductive-invariant verification of the Aztec governance protocol in 2025). It is currently maintainer-funded by Igor Konnov, Jure Kukovec, and Thomas Pani rather than backed by an institution.

**TLAPS** (TLA+ Proof System) is a proof assistant: a Proof Manager that translates hierarchical TLA+ proofs into obligations dispatched to back-end provers - Isabelle/TLA+, Zenon (a tableau prover for classical first-order logic with equality), and SMT back-ends. TLAPS proofs are organised as trees of claims and sub-claims rather than as tactic sequences (the Lean / Coq style) or as Isar declarations (the Isabelle style). TLAPS is the tool when bounded checking is insufficient and an unbounded safety proof is required.

**PlusCal** is a syntactic layer over TLA+ that reads like an imperative pseudo-language and translates to TLA+. PlusCal exists because the action-oriented TLA+ style is well-suited to distributed protocols but less natural for sequential algorithms; PlusCal lets users write sequential pseudocode that is then mechanically translated and checked. It comes in C-style and P-style variants.

**TLA+ Toolbox** is the original IDE; a community VS Code extension is now widely used.

### Famous adopters

**AWS.** The reference case is "How Amazon Web Services Uses Formal Methods" by Chris Newcombe, Tim Rath, Fan Zhang, Bogdan Munteanu, Marc Brooker, and Michael Deardeuff (*Communications of the ACM*, April 2015). The paper documents TLA+ adoption across DynamoDB, S3, EBS, and an internal distributed lock manager. The DynamoDB success led to broader internal adoption: the S3 team requested TLA+ help immediately after the internal presentation. Teams across S3, EBS, DynamoDB, MemoryDB, Aurora, EC2, and IoT have since used TLA+ and related formal methods. AWS continues to publish on the topic - ACM Queue (Systems Correctness Practices at AWS) extends the original 2015 paper.

**Microsoft.** Azure Cosmos DB's replication protocol was specified in TLA+. All five Cosmos DB consistency levels are precisely specified and verified using TLA+, with the spec open-sourced as `Azure/azure-cosmos-tla`. The TLA+ specification of the consistency models is presented as a key engineering input rather than as after-the-fact documentation.

**MongoDB.** MongoDB's replication protocol - a "pull-based" variant of Raft - has a TLA+ specification (`will62794/mongo-repl-tla`). MongoDB's distributed-systems research group developed and machine-checked (via TLAPS) a safety proof of MongoRaftReconfig, a logless dynamic-reconfiguration protocol, published as "Formal Verification of a Distributed Dynamic Reconfiguration Protocol" (arXiv:2109.11987). MongoDB has reported that model-checking the legacy reconfiguration protocol in TLA+ surfaced bugs and accelerated design.

**Confluent.** Jack Vanlightly's `Vanlightly/kafka-tlaplus` repository contains TLA+ specifications for Kafka algorithms, including KIP-966 data-replication and the in-progress modelling of Kafka transactions.

**Intel and Apple** have historically used TLA+ in hardware design contexts; the AWS paper cites Intel as a precedent.

### Crypto-specific uses

**CometBFT / Tendermint.** The CometBFT repository (`cometbft/cometbft`) carries TLA+ specifications: a fork-accountability specification of a simplified Tendermint consensus algorithm with a proof that forks require $> f$ Byzantine validators committing equivocation or amnesia attacks, and a proposer-based-timestamp specification (`TendermintPBT_001_draft.tla`) that adds clocks and PBT-style timestamps to the consensus model.

**Cosmos / IBC.** Informal Systems (the Apalache maintainers, also part of the Cosmos ecosystem) have used TLA+ for protocol-design work on IBC and on the Tendermint light client. The IBC-related TLA+ work is the largest production crypto application of Apalache.

**Aptos / Diem (Move VM).** The principal formal-verification toolchain for Move is *not* TLA+: it is the Move Prover and the Move Specification Language (MSL), a separate verification system that operates directly on Move bytecode. The Diem framework (~8,800 lines of Move plus ~6,500 lines of MSL specs) is verified by Move Prover, not by TLA+. This is a useful contrast point: TLA+ specifies protocol-level behaviour; Move Prover verifies implementation-level smart-contract code. They occupy different layers of the verification stack and are not substitutes.

**Tezos.** Tezos has a substantial formal-methods presence but it sits in Coq (Mi-Cho-Coq for Michelson) and in K Framework, not in TLA+.

**Lightning Network.** "Towards a Formal Verification of the Lightning Network with TLA+" (arXiv:2307.02342, 2023) is an academic specification of LN channel mechanics.

### Comparison to other formal-verification systems

The taxonomy matters because UltraFast is choosing TLA+ specifically over the alternatives.

**Coq / Rocq, Lean, Isabelle/HOL.** Interactive theorem provers with rich dependent type systems (Coq, Lean) or higher-order logic (Isabelle/HOL). They are appropriate when the target is a code-level proof - for example, verifying a compiler (CompCert in Coq), a kernel (seL4 in Isabelle/HOL), or a complete cryptographic library. Proof style is tactic-based (Coq, Lean) or declarative-Isar (Isabelle/HOL). The cost is engineer-years per protocol. TLA+ is deliberately positioned higher up the abstraction ladder: specification-level, not code-level, with a faster iteration cycle and a model checker on the short loop.

**Dafny.** A program-verification language with first-class pre/post-conditions, checked by Z3. Dafny verifies code; TLA+ verifies design.

**K Framework.** A semantics-engineering framework used to formalise programming-language semantics - EVM (KEVM), x86, C. Not a protocol-spec language.

**EasyCrypt.** A proof assistant aimed at cryptographic protocol proofs in the computational model. Adjacent but specialised to game-based cryptographic arguments.

**Move Prover, Solidity SMT-checker, Certora Prover.** All operate on smart-contract code; they are implementation-level verification, not protocol-level specification.

The trade-off TLA+ accepts is the *spec–implementation gap*: a TLA+ proof says the specified protocol is correct, not that the deployed code matches the spec. Refinement mappings - a TLA+ technique linking a low-level specification to a high-level one - partially close this gap; model-based testing (used by MongoDB) is another bridge. Neither eliminates it entirely. The UltraFast whitepaper does not commit to refinement-mapping work between the TLA+ specs and the Rust implementation; the §17 commitment is to the protocol-level specs themselves, with the implementation gap closed by the usual production-engineering practices (audits, fuzz testing, simulation, bug bounty per §16).

### Limitations and trade-offs

The honest summary is that TLA+ buys design-time confidence at a much lower cost than full code-level proof, with three persistent caveats. First, the spec–implementation gap above. Second, untyped TLA+ can be harder for engineers from typed-language backgrounds than typed alternatives like Quint (a typed protocol language that targets Apalache and Quint-to-TLA+ translation). Third, model-checking covers bounded instances; unbounded guarantees require TLAPS proofs, which are substantial work. For pre-implementation high-assurance protocol design - the UltraFast case - the trade is favourable: each of the six §17 invariants is the kind of protocol-level safety/liveness statement TLA+ was built to express.

### Citations and sources

- Lamport, L. "The Temporal Logic of Actions." *ACM TOPLAS* 16(3):872–923, May 1994.
- Newcombe, C. et al. "How Amazon Web Services Uses Formal Methods." *Communications of the ACM*, April 2015. [cacm.acm.org/research/how-amazon-web-services-uses-formal-methods](https://cacm.acm.org/research/how-amazon-web-services-uses-formal-methods/)
- "Systems Correctness Practices at AWS." *ACM Queue*. [queue.acm.org/detail.cfm?id=3712057](https://queue.acm.org/detail.cfm?id=3712057)
- Konnov, I., Kukovec, J., Tran, T. "TLA+ Model Checking Made Symbolic." *PACMPL* (OOPSLA), 2019. Apalache: [apalache-mc.org](https://apalache-mc.org/), repo [github.com/apalache-mc/apalache](https://github.com/apalache-mc/apalache).
- Microsoft Azure. "Azure Cosmos DB: Pushing the frontier of globally distributed databases." Cosmos TLA+ specs: [github.com/Azure/azure-cosmos-tla](https://github.com/Azure/azure-cosmos-tla).
- Schultz, W., Dardik, I., Tripakis, S. "Formal Verification of a Distributed Dynamic Reconfiguration Protocol." arXiv:2109.11987. MongoDB repl spec: [github.com/will62794/mongo-repl-tla](https://github.com/will62794/mongo-repl-tla).
- Vanlightly, J. "kafka-tlaplus." [github.com/Vanlightly/kafka-tlaplus](https://github.com/Vanlightly/kafka-tlaplus); "A primer on formal verification and TLA+." [jack-vanlightly.com](https://jack-vanlightly.com/blog/2023/10/10/a-primer-on-formal-verification-and-tla)
- CometBFT consensus and TLA+: [github.com/cometbft/cometbft](https://github.com/cometbft/cometbft); fork-accountability synopsis at `spec/light-client/accountability/Synopsis.md`.
- Cousineau, D., Doligez, D., Lamport, L., Merz, S., Ricketts, D., Vanzetto, H. "TLA+ Proofs." 2012, arXiv:1208.5933 (TLAPS).
- Lamport, L. "The PlusCal Algorithm Language." ICTAC 2009. Manuals: [lamport.azurewebsites.net/tla/p-manual.pdf](https://lamport.azurewebsites.net/tla/p-manual.pdf), [lamport.azurewebsites.net/tla/c-manual.pdf](https://lamport.azurewebsites.net/tla/c-manual.pdf).
- Dill, D. et al. "Fast and Reliable Formal Verification of Smart Contracts with the Move Prover." arXiv:2110.08362 (contrast point: Move Prover, not TLA+, is the Aptos/Diem path).
- TLA+ Wikipedia: [en.wikipedia.org/wiki/TLA%2B](https://en.wikipedia.org/wiki/TLA%2B).
