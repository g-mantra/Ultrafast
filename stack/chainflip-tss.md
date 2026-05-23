# Chainflip

Multi-chain FROST-based threshold-signature bridge cited in the UltraFast whitepaper [35] as the closest production architectural reference for the bridge and custody design of §10.

---

## 1. How UltraFast uses Chainflip as an architectural reference

§10.7 of the UltraFast whitepaper names Chainflip as "the closest architectural reference" for UltraFast's bridge and custody layer. The reference is structural, not protocol-level. UltraFast does not fork Chainflip, does not run on Substrate, and does not adopt Chainflip's swap protocol or token. What UltraFast borrows is the pattern: a validator set jointly controls a native vault on each foreign chain via a threshold signature scheme, with no operator-held key shards and no trusted dealer.

The reason Chainflip matters as a reference is existence proof. Chainflip has been live on its Berghain mainnet since January 2024, runs FROST signing across Bitcoin, Ethereum, Solana, Polkadot, Arbitrum, Assethub, and Tron, has processed cumulative swap volume measured in billions of USD ($1.69B in Q4 2025 alone, the highest quarter on record), and has done so without a public TSS-key-extraction incident. That answers, in production, the question a designer of any new TSS bridge must answer first: does multi-chain FROST actually work at validator counts of order 100, across heterogeneous signature regimes, at non-trivial custodied value, for a sustained period. Chainflip says yes.

§10.7 also positions Chainflip against the two weaker production analogs UltraFast deliberately declines to copy. THORChain runs GG20-based ECDSA TSS over `tss-lib` derivatives, which the TSSHOCK class of attacks [31] makes unsuitable for new deployments. The Hyperliquid bridge runs plain stake-weighted ECDSA multisig — not TSS at all — with each validator submitting an independent signature that is aggregated off-chain. Both designs are existence proofs of the validator-controlled-vault pattern, but both ship with weaker cryptographic primitives than UltraFast targets. Chainflip is the existence proof for the stronger primitive (FROST Schnorr with identifiable abort) that UltraFast actually wants to use.

UltraFast then diverges from Chainflip in three deliberate ways. Validator count at v1 is 30, not 150, sized to Threshold Simplex's BLS aggregation cost and Minimmit's `n >= 5f+1` requirement (§13). The validator set is curated rather than permissionless at v1, with permissionless onboarding deferred to a later phase. The TSS protocol stack is mixed — FROST + ROAST for Schnorr and Ed25519 corridors, DKLs23 for ECDSA corridors, CGGMP21 as ECDSA fallback (§10.1) — rather than Chainflip's FROST-only design that uses chain-specific tricks to bend FROST onto ECDSA chains. The mixed-protocol decision is an open §16 question; the table in §10.1 is the working assumption.

---

## 2. Deep research on Chainflip

### 2.1 What it is

Chainflip is a decentralized cross-chain swap protocol that lets users move native assets between supported chains without wrapped tokens, lock-and-mint bridges, or centralized custodians. A user deposits, say, native BTC to a Chainflip-controlled Bitcoin address; the protocol routes the swap through an on-chain AMM that lives on its own appchain; the protocol then signs and broadcasts a native withdrawal of the destination asset (SOL, ETH, USDC, DOT, etc) to the user's destination address. There are no IOUs and no synthetic representations on intermediate chains — every leg of the swap is a native on-chain transaction signed by the validator set.

The protocol is composed of three layers: validators running off-chain FROST signing ceremonies, vaults on each supported chain controlled by the aggregate FROST key, and the **State Chain**, a Substrate-based application-specific blockchain that records all accounting (deposits witnessed, swaps executed, withdrawals broadcast, validator rotations, FLIP emissions, governance actions). The State Chain is the source of truth; the foreign-chain vaults are the settlement layer.

### 2.2 Validator set

Up to 150 validators form the **Authority Set** at any one time. Slots are auctioned: a rolling 28-day auction picks the top 150 bidders by FLIP-bonded amount, with the lowest winning bid setting the Minimum Active Bid (MAB) — the protocol's stake-floor metric. Candidates must complete the FROST keygen ceremony for the next epoch to be admitted. Validators that fail keygen, go offline, or sign conflicting transactions are slashed automatically.

Validators wear three hats simultaneously. They **witness** foreign-chain deposits (the network functions as its own decentralized oracle, with no external oracle dependency). They **sign** outbound transactions via FROST. They **broadcast** the resulting signed transactions to the destination chain and report success or failure back to the State Chain. The combined role is why a single validator set, rather than separate oracle and signer committees, suffices for end-to-end cross-chain execution.

### 2.3 FROST implementation

Chainflip is documented as the first project to deploy FROST in a blockchain production setting. The signing threshold is **100 of 150** — two-thirds of the active set, somewhat larger than the cryptographic minimum required by FROST itself. The DKG follows Komlo & Goldberg (2020) using Verifiable Shamir Secret Sharing with Pedersen commitments: each party generates a local keypair, broadcasts the public component and a polynomial commitment, and distributes secret shares confidentially to the other 149. Invalid shares can be challenged and revealed publicly, providing identifiable abort: misbehaving parties are attributable and slashable.

Signing time is documented as targeting roughly one signature per second across the network, which is order-of-magnitude consistent with the §13 UltraFast estimate of 150–300 ms for FROST signing at `n = 100` over WAN (UltraFast benchmarks at lower validator count and tighter regional topology). Chainflip does not appear to wrap FROST in **ROAST**, which is the robust-asynchronous variant UltraFast adopts in §10.1 to retain liveness under aborters without falling back to retries. ROAST is an open §16 decision for UltraFast; for Chainflip it is not a documented design element.

The signature scheme used across all chains is Schnorr / EdDSA. For Bitcoin this is the Taproot path — Chainflip vaults are Taproot-only on Bitcoin. For Solana and Polkadot the chains accept EdDSA / Schnorr natively. For Ethereum and the EVM L2s (Arbitrum) the native scheme is ECDSA secp256k1, which is incompatible with Schnorr-style FROST out of the box; Chainflip uses an EVM-side verifier contract that accepts the FROST Schnorr signature directly rather than producing a native ECDSA signature, achieving FROST coverage across all chains at the cost of an on-chain Schnorr-verifier on the EVM side. This is a different solution from UltraFast's, which proposes DKLs23 ECDSA-native TSS for EVM corridors (no Schnorr-verifier contract required) under §10.1.

### 2.4 Supported chains and assets

As of the most recent mainnet documentation, the seven supported chains are:

| Chain | Assets |
|---|---|
| Bitcoin | BTC (Taproot) |
| Ethereum | ETH, USDC, USDT, WBTC, FLIP |
| Arbitrum | ETH, USDC, USDT |
| Solana | SOL, USDC (SPL), USDT (SPL) |
| Polkadot | DOT |
| Assethub (Polkadot) | SOL, USDC, USDT |
| Tron | TRX, USDT (TRC-20) |

Solana support went live on mainnet on 24 September 2024, with the first-ever native BTC <> SOL swap as the launch demonstration. Arbitrum followed in late 2024. Tron is the most recent addition and entered testnet in Q4 2025.

### 2.5 Key rotation

Chainflip rotates vault keys at each epoch boundary (epochs are nominally 28 days, the auction cadence). The outgoing authority set signs a key-handover transaction that either delegates control of the existing vault to the incoming set's aggregate key or sweeps funds into a fresh vault address controlled by the new set. The mechanism is per-chain — each chain has its own vault and its own rotation transaction.

UltraFast (§10.3) takes a similar fresh-wallet position, modelled explicitly on the tBTC v2 pattern: each epoch produces a new TSS wallet on each foreign chain, old wallets sweep into new ones over a bounded window, and Chainflip-style in-place key delegation is not used. The choice is rationalised in §10.3 as bounding the lifetime and custodied value of any single wallet and sidestepping DPSS (CHURP, D-FROST) complexity. The rotation-model decision is open in §16.

### 2.6 JIT AMM

The State Chain hosts a custom AMM that Chainflip calls the **JIT AMM** (Just-In-Time AMM). It is a Substrate Rust rewrite of Uniswap v3-style concentrated liquidity, modified to suit cross-chain settlement timing. The core innovation: because cross-chain swaps have a multi-block delay between the user's deposit being witnessed and the swap executing on the State Chain, liquidity providers can observe the pending swap and submit a tighter quote inside the delay window. Frontrunning is inverted — instead of bots frontrunning users, LPs race each other to offer the user the best price. JIT liquidity provisioning was originally estimated at ~3% of volume in 2022 and is reported to have substantially exceeded that share since mainnet launch.

The JIT AMM is not relevant to UltraFast's design (UltraFast uses an FBA + MCP order-book engine, not an AMM), but it is mechanically interesting because it shows that the multi-block witnessing delay inherent to any validator-witnessed bridge can be turned into a feature rather than a tax.

### 2.7 Token, economics, and current scale

The FLIP token launched on 23 November 2023 (TGE) and is used for validator bonding, slashing, and as the gas asset for the State Chain. Network fees collected on swaps are burned in FLIP, giving FLIP a deflationary supply pressure tied directly to protocol revenue.

Headline metrics from the Q4 2025 report:

- $1.69B swap volume in Q4 2025 (35.9% QoQ growth, record)
- $994K Q4 fee revenue (record)
- $552.9K net protocol earnings after validator incentives of $441.9K
- 1.83M FLIP burned in Q4 (record)
- 7.3M FLIP burned cumulatively as of February 2026
- ~14% APY on FLIP staking as of early 2026

November 2025 alone processed $583M in volume. The protocol crossed $1B in cumulative processed swap volume during its first year of mainnet operation in 2024.

Chainflip in late 2025 also entered an incentivised lending beta — supply / borrow on native BTC, ETH, SOL, and stablecoins without wrapping or external bridges — repositioning from a swap-only protocol to a "multi-product liquidity infrastructure" layer.

### 2.8 Implementation

The codebase is `chainflip-io/chainflip-backend` on GitHub, a Rust workspace (~88% Rust, ~10% TypeScript). Key components:

- **chainflip-engine** — the validator-side off-chain process that runs FROST signing ceremonies, witnesses foreign-chain events, and broadcasts signed transactions. Distributed as a dylib loaded by an engine runner, enabling hot upgrades without validator-node restarts.
- **state-chain** — Substrate runtime with pallets for vault rotation, swap routing, AMM pools, validator auctions, witnessing, broadcasting, and governance.
- **multisig** — the FROST keygen and signing implementation.
- **foreign-chain integrations** — chain-specific witnessing and broadcasting modules for BTC, ETH, SOL, DOT, Arbitrum, Tron, Assethub.

The project is open-source under a permissive license, with 60+ releases and active development (release 2.1.x as of late 2025 / early 2026). End-to-end testing runs through the `bouncer` suite against a `localnet` Docker environment.

### 2.9 Audits

Trail of Bits performed a security review dated April 2023 with 12 reported findings. The published report (`trailofbits/publications`, `reviews/2023-04-chainflip-securityreview.pdf`) covers the State Chain, the engine, and the multisig module; full per-finding detail was not extractable from the GitHub blob-rendered PDF for this research. The review predates several large protocol changes (Solana, Arbitrum, Tron integrations; JIT AMM iterations; lending beta) and should be read as covering the v1 launch surface rather than the current mainnet.

The protocol publishes its bug bounty and disclosure policy at `chainflip-io/security` on GitHub.

### 2.10 Incidents

There is no public record of a TSS-key-extraction event, an aggregate-key compromise, or a vault-drain incident affecting Chainflip since the Berghain mainnet launch in January 2024. The protocol was a target of operational concern during the February 2025 Bybit cold-wallet hack ($1.5B drained by the Lazarus Group via a Safe-multisig UI compromise); Chainflip responded by cutting access to its main swap interface and shipping an upgrade to block illicit flows at the interface and broker layers, which industry trackers credit alongside several other venues for assisting in freezing $42.89M of exploited funds. This was an interface-layer compliance response, not a protocol-layer compromise.

TSSHOCK (Verichains, 2023) — the key-extraction attack family against GG18 / GG20 / CGGMP21 ECDSA TSS implementations — does not affect Chainflip. The attack targets ECDSA TSS protocols built on the `tss-lib` lineage; Chainflip's signing path is FROST Schnorr throughout, with no GG-family ECDSA TSS in scope.

### 2.11 Limitations

Three limitations of the Chainflip design are worth naming explicitly because UltraFast inherits some and avoids others:

1. **Validator-set churn cost.** Each epoch transition requires a fresh FROST keygen for every supported chain and a key-handover or fund-sweep transaction on each chain. As supported-chain count grows (seven and rising), keygen overhead and on-chain rotation cost grow with it. UltraFast's stake-weighted virtual-share construction (§10) makes the rotation cost per chain higher still because the number of FROST keyshares is `sum_i ceil(s_i / u)` rather than `n` — the share-unit parameter `u` is calibrated to bound this.
2. **FROST-only on ECDSA chains via verifier contract.** Chainflip pays an on-chain Schnorr-verifier contract cost on every EVM withdrawal. UltraFast's DKLs23 path avoids this contract at the cost of running a second, ECDSA-native TSS protocol stack.
3. **AMM tail risk vs order-book determinism.** The JIT AMM is well-suited to retail spot swaps but does not generalise to derivatives, prediction markets, or sub-second execution venues. UltraFast does not adopt the AMM and runs FBA + MCP order books instead, so this constraint does not transfer.

The remaining structural property — that a `2f+1` validator collusion can in principle steal vault assets, mitigated by bonded-stake-to-custodied-value economics — applies equally to Chainflip, THORChain, Hyperliquid's bridge, and UltraFast. UltraFast formalises the mitigation as a 2x bonded-to-custodied global cap (§10.4); Chainflip does not document an explicit ratio target of this form in publicly available materials reviewed for this note.

---

## 3. Sources

- Chainflip protocol overview: https://docs.chainflip.io/protocol/protocol-overview
- FROST signature scheme: https://docs.chainflip.io/protocol/frost-signature-scheme
- Supported chains and assets: https://docs.chainflip.io/protocol/supported-chains-assets/chains-assets
- Validator auctions and authority set: https://docs.chainflip.io/concepts/token-economics/flip-staking-and-validator-auctions
- JIT AMM: https://docs.chainflip.io/protocol/just-in-time-amm-protocol
- Security architecture overview: https://chainflip.io/blog/chainflip-security-architecture-trustless-swap-protocol/
- Solana mainnet launch (24 Sep 2024): https://blog.chainflip.io/solana-comes-to-chainflip-mainnet-a-new-era-of-native-cross-chain-swaps/
- Mainnet preparation and Berghain: https://blog.chainflip.io/chainflip-mainnet-preparation/
- 2024 in numbers ($1B cumulative volume): https://blog.chainflip.io/chainflip-2024-in-numbers/
- Q4 2025 report: https://chainflip.io/blog/q4-2025-report-protocol-performance-product-momentum-and-the-shift-to-multi-product-liquidity-infrastructure/
- November 2025 report: https://blog.chainflip.io/november-2025-performance-report/
- FLIP burn / staking APY 2026: https://blog.chainflip.io/what-is-flip-token-burns-staking-apy-2026/
- DefiLlama: https://defillama.com/protocol/chainflip
- chainflip-backend repository: https://github.com/chainflip-io/chainflip-backend
- chainflip-io/security (bug bounty, disclosure): https://github.com/chainflip-io/security
- Trail of Bits April 2023 security review: https://github.com/trailofbits/publications/blob/master/reviews/2023-04-chainflip-securityreview.pdf
- Chainflip Whitepaper (Harman, July 2023, Fifth Revision): https://assets.chainflip.io/whitepaper.pdf
- TSSHOCK (Verichains, 2023): https://verichains.io/tsshock/
- Komlo & Goldberg, FROST: IETF RFC 9591
