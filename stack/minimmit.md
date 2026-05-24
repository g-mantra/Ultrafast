# Minimmit

## Part 1: How UltraFast uses Minimmit and why

UltraFast composes two consensus protocols. Threshold Simplex (§5.1 of the whitepaper) is the base - the Commonware refinement of Chan and Pass's Simplex, with a one-time DKG producing a BLS12-381 shared secret, ~240-byte threshold-signature certificates per view, and the standard $f < n/3$ safety bound. Minimmit (§5.2) sits on top as a single-round fast path. The two are paired, not substituted: Minimmit attempts the happy path; Threshold Simplex catches the fall.

The role is latency reduction. Standard Threshold Simplex commits in two rounds; Minimmit commits in one when at least $4f+1$ validators participate honestly in a view - equivalently $f < n/5$, equivalently $n \geq 5f+1$. The whitepaper's §12.1 latency budget pins the p50 finality target at ~200 ms on the Minimmit happy path, with p99 at ~300 ms, under the stated conditions: 30 curated validators, two-region topology (US-East + EU-West, one-way RTT ~30 ms), speculative execution enabled, no Byzantine faults. The pessimistic floor is ~400 ms - Minimmit fallback to standard Threshold Simplex under cross-region partition or pessimistic leader. The chain does not halt; it degrades.

The quorum requirement is satisfied by construction at launch. §13.3 sizes the v1 validator set at ~30 foundation-curated validators with a two-region latency-optimised topology. With no expected Byzantine validators in the curated set, $n = 30 \geq 5f+1$ holds for $f$ up to 5 - comfortable headroom for the happy-path quorum. The M1 → M3 milestone path expands the set (50 → 75 → 100+) while preserving the Minimmit quorum as a working assumption that survives validator-set growth.

The "why" is framed explicitly in §12.3. Hyperliquid reports ~70 ms finality on its current BFT implementation. UltraFast's 200 ms p50 target sits ~130 ms above that, and the whitepaper labels this gap the "structural-fairness premium" - the cost of MEV resistance by construction (§8), an open validator set (§13), and cross-product margin (§9.3). Minimmit closes the larger gap that standard Threshold Simplex alone would leave, bringing the target into a CEX-competitive band rather than a generic L1 band.

Status: not implemented. UltraFast is pre-implementation. The Phase 0 walking-skeleton (§16.1) validates the Threshold Simplex + Minimmit + speculative-execution integration end-to-end on a four-validator two-region testbed, with exit criteria of submit-to-fill p95 < 300 ms on the happy path and < 600 ms on the fallback soak. Failure on either threshold points to the layer over budget before any product code is committed.

## Part 2: Deep research on Minimmit

### How it works

Minimmit is a leader-based propose-and-vote BFT state-machine-replication protocol designed for minimum block time rather than maximum fault tolerance. It is evaluated in the standard partial-synchrony model: execution proceeds in discrete timeslots, messages from honest validators arrive within a bounded delay $\Delta$ after $\max(\text{GST}, t)$, where $\Delta$ is known and GST is unknown.

The core innovation is decoupling two quorums that previous BFT protocols collapse together: view progression and block finalization use different thresholds.

- **Replica count**: $n \geq 5f + 1$ (where $f$ is the maximum tolerated Byzantine validators).
- **View-advance quorum $M$**: $2f + 1$ replicas (~40 % of stake). A replica advances to the next view on observing $M$ votes.
- **Finalization quorum $L$**: $n - f$ replicas, equivalently $4f + 1$ (~80 % of stake). A block finalises on observing $L$ notarisations in a single round.

The leader proposes a block. Replicas either notarise the proposal or, after a $2\Delta$ timeout, vote to nullify the view. A view that produces multiple notarisations (an equivocating leader) or any nullification cannot finalise in that view; the protocol moves on. Safety holds because any $M$-quorum and any $L$-quorum intersect in at least one honest replica - that honest replica will not both notarise and nullify the same view, and will not notarise two conflicting proposals.

Under the fast path, an honest leader produces a notarisation before timeouts expire and the block finalises in one round. Under a Byzantine leader, the worst case is a $4\Delta$ delay; a crash-faulty leader costs at most $3\Delta$. There is no separate slow-path commit rule in the sense Tendermint or HotStuff use - Minimmit foregoes the second-round commit that other 2-round-finality protocols fall back to when the high-water quorum cannot be reached. Instead, the view is nullified and the next view's leader gets a fresh attempt.

### Implementations and status

The protocol was introduced by Brendan Kobayashi Chou (Commonware), Andrew Lewis-Pye (London School of Economics), and Patrick O'Grady (Commonware). The paper is arXiv:2508.10862, first submitted 14 August 2025, last revised 27 January 2026 (v7). It was accepted to Financial Cryptography 2026.

The primary implementation effort is in `commonwarexyz/monorepo` on GitHub. The `pipeline/minimmit/` directory contains the protocol documentation (`minimmit.md`) and a Quint formal specification with a model checker (`pipeline/minimmit/quint/`, requires JDK 17+). The `examples/estimator/` directory contains a network simulator that benchmarks HotStuff, Simplex, and Minimmit on an alto-like topology under various bandwidth constraints. The Commonware blog post (June 2025, updated through the paper revisions) reports expected performance numbers: 130 ms block time and 250 ms finality on a 50-validator uniformly-distributed network, 50 ms / 100 ms on a regionally-biased configuration.

Production deployment status as of May 2026: not yet deployed in production by any chain. The Commonware materials describe the protocol as "not yet peer-reviewed or fully implemented" at the time of the initial blog post, with the FC 2026 acceptance providing the peer-review milestone. UltraFast is one of the early committed adopters; the Commonware monorepo is the upstream of UltraFast's consensus integration. The published simulations (50 globally distributed processors) show a 23.1 % reduction in view latency and 10.7 % reduction in transaction latency versus state-of-the-art baselines.

### Comparison to other fast-path BFT protocols

Minimmit sits in a cohort of recent 2025–2026 proposals that share a common pattern: a fast finalisation path under a stronger honest-majority assumption (typically $n \geq 5f+1$ or $n \geq 5f+2$), coexisting with - or, in Minimmit's case, replacing - the conventional $n \geq 3f+1$ safety floor. Peers in this cohort include Solana's Alpenglow, Kudzu, Hydrangea, and ChonkyBFT. The distinguishing feature of Minimmit is that it omits the second-round slow path that the others retain as a fallback under heavier Byzantine load.

Against the more established BFT family:

- **HotStuff and HotStuff-2** (Malkhi et al., 2023): linear-communication BFT with two-phase commit. HotStuff-2 removes the third phase of original HotStuff for responsiveness under an honest leader. View changes can cascade under adversarial conditions, which production deployments (Diem, Aptos via Jolteon) have had to engineer around. Minimmit's single-round finalisation is faster on the happy path but pays in the $5f+1$ replica count.
- **Tendermint / CometBFT**: three-step lock-precommit-commit on a $2f+1$ quorum over $3f+1$ replicas. Tolerates $f < n/3$ but lock semantics impose timeout-tuning complexity and a multi-round commit cost. Minimmit trades $f < n/3$ for $f < n/5$ in exchange for one-round finalisation.
- **Sui's Mysticeti** (2023–2024): uncertified-DAG consensus with an opt-in fast-commit path (Mysticeti-FPC). Achieves sub-second latency at high throughput by weaving fast-path transactions into the DAG rather than running a separate commit protocol. Different architectural family from Minimmit - DAG-based rather than chain-of-blocks - but addresses the same latency target.
- **Aptos's Quorum Store + Jolteon**: Quorum Store decouples data dissemination from consensus ordering; Jolteon is a HotStuff variant with rotating leaders and a two-chain commit rule. Battle-tested at production scale. The composition with Quorum Store is the closest existing analogue to UltraFast's plan to add MCP (§8.1) underneath Threshold Simplex + Minimmit as block-assembly plumbing at v1.1.

UltraFast's choice of Minimmit over these alternatives is grounded in two factors: the curated 30-validator launch set makes the $5f+1$ quorum trivially satisfiable, and the Commonware monorepo provides both Threshold Simplex and Minimmit in a single upstream stack, so the engineering surface is one integration rather than two.

### Known limitations

- **Quorum requirement**: $f < n/5$ is strictly stronger than the conventional $f < n/3$. The trade is explicit. Under partition or targeted attack that strands more than $f$ validators relative to the $5f+1$ bound, the fast path stops finalising. UltraFast addresses this by composition with Threshold Simplex (§5.2) - the chain falls back to two-round commit at $n \geq 3f+1$ rather than halting. The Minimmit paper itself does not specify a built-in fallback; the fallback is an integration-level choice.
- **Fallback behaviour**: Where other fast-path protocols in the cohort (Alpenglow, Kudzu, Hydrangea, ChonkyBFT) carry a slow-path commit rule under the same protocol, Minimmit nullifies the view and tries again under the next leader. This is conceptually simpler but means a sustained partition straddling the $4f+1$ threshold can produce repeated view-nullification cycles. UltraFast's degradation to standard Threshold Simplex at $n \geq 3f+1$ is the documented escape hatch.
- **Formal proof status**: Safety and liveness proofs under partial synchrony are stated in the paper and modelled in Quint. Peer review through Financial Cryptography 2026 covers the formal claims. The protocol is recent (first arXiv version August 2025) and has not accumulated the deployment-hardened track record that HotStuff-2, Tendermint, or Jolteon have.
- **Implementation maturity**: The Commonware monorepo implementation is active research code. No production chain has yet shipped Minimmit at scale; UltraFast itself is pre-implementation. Phase 0 of the UltraFast roadmap (§16.1) is the first end-to-end production-track validation milestone the protocol will face.

### Source files in this repo

- `/Users/g/git/mantra/ultrafast/whitepaper.md` §2 (model), §5.1–5.2 (Threshold Simplex and Minimmit), §6.4 (speculative execution), §12.1–12.3 (latency budget and Hyperliquid comparison), §13.3 (validator-set sizing), §16 (open decisions and Phase 0 exit criteria).

### External sources

- Chou, B. K., Lewis-Pye, A., O'Grady, P. *Minimmit: Fast Finality with Even Faster Blocks*. arXiv:2508.10862 (v1: 14 Aug 2025; v7: 27 Jan 2026). Accepted to Financial Cryptography 2026. <https://arxiv.org/abs/2508.10862>
- Commonware blog. *Minimmit: Fast Finality with Even Faster Blocks*. <https://commonware.xyz/blogs/minimmit>
- Commonware monorepo, `pipeline/minimmit/`. <https://github.com/commonwarexyz/monorepo/tree/main/pipeline/minimmit>
- Commonware monorepo, `examples/estimator/`. <https://github.com/commonwarexyz/monorepo/blob/main/examples/estimator/README.md>
- Lewis-Pye, A. *Minimmit: Fast Finality with Even Faster Blocks*. <https://lewis-pye.com/2025/09/29/minimmit-fast-finality-with-even-faster-blocks/>
- Malkhi, D., Nayak, K. *HotStuff-2: Optimal Two-Phase Responsive BFT*. ePrint 2023/397. <https://eprint.iacr.org/2023/397.pdf>
- Babel, K., Chursin, A., et al. *Mysticeti: Reaching the Latency Limits with Uncertified DAGs*. arXiv:2310.14821. <https://arxiv.org/pdf/2310.14821>
