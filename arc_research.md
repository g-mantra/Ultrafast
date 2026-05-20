# Arc — Research Brief

> Date: 2026-05-20
> Status: Competitive intel for UltraFast architecture decisions

## 1. Summary

Arc is an open Layer-1 blockchain built and stewarded by **Circle** (issuer of USDC), publicly introduced in August 2025, with a public testnet live since 28 October 2025 and **mainnet targeted for summer 2026**. It is marketed as the "Economic Operating System for the internet" — but in practice it is much more narrowly a **stablecoin-native institutional settlement chain**. Its three named use-cases are cross-border payments, on-chain FX settlement, and tokenised-asset trading; it is the settlement layer for Circle Payments Network ([Circle](https://www.circle.com/pressroom/circle-launches-arc-public-testnet), accessed 2026-05-20).

The stack is unusually close to what UltraFast has converged on: **Malachite BFT consensus** (Tendermint-class, written in Rust, originally from Informal Systems, now maintained by Circle) over a **reth-SDK based EVM execution layer**, with USDC as native gas, opt-in TEE-based confidential transfers, and CCTP for bridging ([circlefin/arc-node](https://github.com/circlefin/arc-node), accessed 2026-05-20; [Sentora technical notes](https://medium.com/sentora/some-technical-notes-about-circles-new-blockchain-d09b8d26e0a4), accessed 2026-05-20). Reported testnet performance is ~3,000 TPS with **350 ms finality across ~20 globally distributed validators** — a permissioned PoA set today, with a "permissioned PoS" roadmap.

On 11 May 2026 Circle disclosed a **$222 M ARC token presale at a $3 B FDV**, led by a16z crypto ($75 M) with BlackRock, Apollo, ICE (NYSE parent), SBI, Janus Henderson, Standard Chartered Ventures, General Catalyst, Marshall Wace, ARK Invest, IDG, Haun Ventures, and Bullish ([CNBC](https://www.cnbc.com/2026/05/11/circle-closes-222-million-from-blackrock-apollo-for-arc-blockchain.html), accessed 2026-05-20; [The Block](https://www.theblock.co/post/400709/circle-raises-222m-in-arc-token-presale-at-3b-fdv-from-a16z-crypto-blackrock-and-others-q1-revenue-up-20), accessed 2026-05-20). Initial supply is 10 B ARC; 25% to Circle for validator ops/staking, 60% to network participants/contributors, 15% long-term reserve.

## 2. Origin & Funding

- **Parent / stewards**: Circle Internet Group (NYSE: CRCL). The Informal Systems team that built Malachite joined Circle to build Arc's core consensus ([Sentora](https://medium.com/sentora/some-technical-notes-about-circles-new-blockchain-d09b8d26e0a4), accessed 2026-05-20).
- **Funding**: $222 M presale (May 2026), $3 B FDV. Lead: a16z crypto ($75 M). Other investors include BlackRock, Apollo Funds, ICE, SBI Group, Janus Henderson, Standard Chartered Ventures, General Catalyst, Marshall Wace, ARK Invest, IDG Capital, Haun Ventures, Bullish ([CNBC](https://www.cnbc.com/2026/05/11/circle-closes-222-million-from-blackrock-apollo-for-arc-blockchain.html), accessed 2026-05-20).
- **Notable**: First public-company-led token presale (CRCL is publicly listed). Tokens vest only after mainnet.
- **Status (May 2026)**: Public testnet since Oct 2025, reportedly ~244 M txs processed by 5 May 2026 (Circle figure, marketing claim — unverified independently). Mainnet expected **summer 2026**.
- **Institutional partners (100+)**: BlackRock, Goldman Sachs, BNY Mellon, HSBC, Deutsche Bank, Société Générale, Standard Chartered, State Street, Visa, Mastercard, Apollo, ICE, Coinbase, Kraken, Robinhood, Bybit, Alchemy, Chainlink, MetaMask, Ledger, Fireblocks, regional stablecoin issuers (JPYC, BRLA, AUDF, KRW1) ([Circle press release](https://www.circle.com/pressroom/circle-launches-arc-public-testnet), accessed 2026-05-20). The breadth of TradFi names is the single most distinctive thing about Arc.
- **TVL target**: not disclosed; no public number.

## 3. Architecture

### 3.1 Consensus

- **Malachite**, a Tendermint-class BFT engine written in Rust, originally developed at Informal Systems, now maintained by Circle ([circlefin/arc-node README](https://github.com/circlefin/arc-node), accessed 2026-05-20).
- Two-round prevote/precommit, 2/3+ supermajority commit, **deterministic single-slot finality** — no probabilistic finality, no reorgs after commit.
- Reported testnet performance: **~3,000 TPS, 350–780 ms finality** with ~20 globally distributed validators ([Sentora](https://medium.com/sentora/some-technical-notes-about-circles-new-blockchain-d09b8d26e0a4), accessed 2026-05-20; [CoinGecko](https://www.coingecko.com/learn/what-is-arc-stablechain), accessed 2026-05-20). Marketing material elsewhere claims "50,000+ TPS" — flagged as marketing, not benchmark.
- **Roadmap**: multi-proposer sequencing (parallel block construction) for higher throughput.
- **Validator model**: permissioned Proof-of-Authority today; "permissioned PoS" with staking and slashing planned ([Sentora](https://medium.com/sentora/some-technical-notes-about-circles-new-blockchain-d09b8d26e0a4), accessed 2026-05-20).

### 3.2 Execution

- **EVM via the Reth SDK** (revm under the hood). Full Solidity / Foundry / Hardhat compatibility ([circlefin/arc-node](https://github.com/circlefin/arc-node), accessed 2026-05-20).
- Repo composition: Rust 77.3%, TypeScript 10.5%, Solidity 7.6%.
- Tokio async runtime, libp2p networking, alloy-rs primitives.
- The choice mirrors what is becoming the industry-default modular stack: Malachite (or similar Rust BFT) for consensus + reth SDK for EVM execution, coupled via an Engine-API-style interface.

### 3.3 State / storage

- **Not publicly specified.** No mention of a custom storage engine analogous to QMDB; presumed to use reth's default MDBX-backed storage. Flagged: no public information as of 2026-05-20 on whether they have done custom state-DB work.

### 3.4 Bridging & interop

- **CCTP (Circle Cross-Chain Transfer Protocol)** native — burn-and-mint USDC between Arc and other CCTP-supported chains ([Circle blog](https://www.circle.com/blog/introducing-arc-an-open-layer-1-blockchain-purpose-built-for-stablecoin-finance), accessed 2026-05-20).
- Deterministic finality makes single-block cross-chain mints possible.
- Multichain-aligned positioning (not isolated). Arc is explicitly designed to be one node in a stablecoin mesh, not a self-contained ecosystem.

### 3.5 Privacy & compliance

- **Opt-in confidential transfers**: amounts hidden, addresses public.
- Implementation: **TEEs initially**, with "pluggable backends" intended to migrate to MPC, FHE, or ZK later ([Sentora](https://medium.com/sentora/some-technical-notes-about-circles-new-blockchain-d09b8d26e0a4), accessed 2026-05-20).
- Exposed to contracts via an **EVM precompile** routing to the pluggable backend.
- **Selective disclosure / view keys** for regulators and auditors.
- Post-quantum cryptography "from day one" — claimed for mainnet ([CoinDesk](https://www.coindesk.com/markets/2026/04/06/stablecoin-issuer-circle-s-arc-blockchain-to-debut-with-quantum-era-features), accessed 2026-05-20). Marketing claim — no public benchmark or scheme details.
- **MEV protections**: encrypted mempools, batch processing, and "multi-proposer sequencing" are mentioned but not specified in any depth ([Sentora](https://medium.com/sentora/some-technical-notes-about-circles-new-blockchain-d09b8d26e0a4), accessed 2026-05-20). No public FBA / threshold-encryption design document exists as of 2026-05-20.

## 4. "Economic Operating System" positioning

"Economic OS" is a marketing umbrella; the concrete scope is narrower:

1. **Stablecoin payments** (cross-border, retail and institutional, settlement layer for Circle Payments Network).
2. **On-chain FX** via **StableFX** — an institutional RFQ engine with off-chain price discovery and on-chain Permit2-based payment-versus-payment (PvP) settlement, supporting USDC, EURC, JPYC, BRLA, MXN, CAD, AUDF, KRW1 ([Circle StableFX](https://www.circle.com/stablefx), accessed 2026-05-20; [The Block](https://www.theblock.co/post/378723/circle-arc-onchain-fx-engine-multi-currency-stablecoin-program), accessed 2026-05-20).
3. **Tokenised assets / RWA**: USYC (tokenised MMF), tokenised equities, commodities, real estate. Apollo, BlackRock, State Street are the named anchor partners.

The pitch to capital allocators is essentially: *T+0 settlement plumbing for the regulated dollar economy, with the same compliance affordances banks need (view keys, opt-in privacy, KYC'd validators), but on neutral programmable rails.* It is **not** positioned as a DeFi or derivatives chain, and it explicitly trades permissionlessness for institutional acceptance.

## 5. Differentiators vs comparable chains

| Dimension | **Arc** | **Tempo** (Stripe/Paradigm) | **Plasma** (Bitfinex/Tether) | **Solana** | **Ethereum L1** | **Hyperliquid** |
|---|---|---|---|---|---|---|
| Focus | Stablecoin finance, FX, RWA | Stablecoin payments at Stripe scale | USDT-centric payments | General-purpose, throughput | General-purpose, credibly neutral | Onchain perps DEX |
| Consensus | Malachite BFT (Tendermint-class) | Not public; PoS, Reth-based | PlasmaBFT (HotStuff-derived) | TowerBFT + PoH | Gasper (Casper FFG + LMD-GHOST) | HyperBFT (HotStuff-derived) |
| Execution | reth SDK / EVM | reth-based EVM (per Paradigm) | EVM | SVM | EVM | Custom (HyperEVM + native order book) |
| Finality | ~350 ms deterministic | "Sub-second" (claim) | ~1 s | ~12.8 s economic | ~12 min | ~1 s |
| Gas token | **USDC** (native) | Any major stablecoin (auto-swapped) | USDT (zero-fee for transfers) | SOL | ETH | None for trading; HYPE for gas |
| Native token | ARC (utility/staking, post-mainnet) | None (issuer-agnostic) | XPL | SOL | ETH | HYPE |
| Validator model | Permissioned PoA → permissioned PoS | Not fully disclosed; institutional set | Validator set, transitioning to PoS | Permissionless PoS | Permissionless PoS | ~20 validators, permissioned |
| Privacy | Opt-in TEE confidential transfers + view keys | Not detailed | None publicly | None native | None native | None native |
| MEV | Encrypted mempool + batching (claimed, unspecified) | Not detailed | Not detailed | Jito MEV market | Builder/relay (PBS) | Order-book mitigates much |
| Bridging | CCTP native | Multi-stablecoin, AMM-routed | LayerZero + native USDT bridge | Wormhole, CCTP | Universal hub | LayerZero |
| Differentiator | TradFi distribution (BlackRock/Apollo/ICE), StableFX, post-quantum claim | Stripe distribution, issuer-agnostic gas | USDT distribution, free transfers | Raw throughput | Neutrality, security | Best onchain perps UX |

Sources for table: [Across — The Rise of Stablechains](https://across.to/blog/stablechains) accessed 2026-05-20; [CoinGecko — Tempo](https://www.coingecko.com/learn/what-is-tempo-stablechain) accessed 2026-05-20; vendor docs.

## 6. Investor selling points

The bull case Circle and a16z make to allocators:

- **Distribution moat, not a tech moat.** Circle already issues the second-largest stablecoin (~$80 B+ USDC float); Arc piggybacks on existing CFOs, treasurers, banks, and exchanges that already custody USDC. No other L1 starts with this institutional Rolodex.
- **Regulatory acceptability built in.** USDC-as-gas means no exposure to a volatile speculative token for fee payment — a checkbox enterprises and auditors care about. View keys + opt-in privacy mean Arc can serve regulated entities under MiCA / GENIUS Act / MAS frameworks.
- **24/7 PvP FX is a real product wedge.** Global FX is a ~$7.5 T/day market; T+2 CLS settlement is the status quo. StableFX promises instant, atomic FX between regional stablecoins — a credible "show me the dollars" use case.
- **Token capture of stablecoin yield.** ARC is positioned to accrue value from validator staking on what may become a high-throughput settlement rail; presale valuation ($3 B FDV) is rationalised against future treasury-management and FX volumes.
- **First-mover among "compliant L1s"** — Tempo (Stripe) and Plasma (Tether) are direct competitors, but Arc has the most diversified institutional cap-table.
- **Quantum-resistant from launch** — marketing claim, but resonates with treasurers facing long-dated obligations.

## 7. Skeptic-side critique

- **"It's not an L1, it's a consortium chain."** Adam Cochran (Cinneamhain Ventures) called the framing "offensive," arguing blockchains exist to displace permissioned middlemen, not recreate them under new branding ([The Defiant](https://thedefiant.io/news/blockchains/circle-s-arc-layer-1-re-ignites-the-open-versus-permissioned-chain-debate), accessed 2026-05-20).
- **Permissioned validator set under Circle control.** The ~20-validator PoA today is materially closer to a federated network (e.g., Stellar/Ripple/Hyperledger) than to an open L1. The "permissioned PoS" roadmap softens but does not remove this.
- **Liquidity fragmentation.** Kevin Lehtiniitty (Borderless) argued another centralised L1 "doesn't move the needle" and fragments stablecoin liquidity further ([The Defiant](https://thedefiant.io/news/blockchains/circle-s-arc-layer-1-re-ignites-the-open-versus-permissioned-chain-debate), accessed 2026-05-20).
- **USDC-as-gas concentrates risk.** A USDC depeg or freeze (precedented: SVB March 2023) would render the chain unusable, not just devalue an asset on it. Circle can also blacklist USDC addresses — meaning the gas token itself is censorable.
- **TEE-based privacy ≠ cryptographic privacy.** Reliance on Intel SGX / AMD SEV / similar attestation surfaces is a real vendor-lock-in and side-channel attack risk; the "pluggable to MPC/FHE/ZK later" line is aspirational ([Sentora](https://medium.com/sentora/some-technical-notes-about-circles-new-blockchain-d09b8d26e0a4), accessed 2026-05-20).
- **MEV story is hand-wave-y.** "Encrypted mempool + batching + multi-proposer" is mentioned but unspecified — no public design doc as of 2026-05-20.
- **Throughput claims are inconsistent.** "~3,000 TPS at 350 ms" (Sentora, reflecting Circle whitepaper) vs marketing's "50,000+ TPS" — flagged: no third-party benchmark.
- **Token presale-on-a-public-company is novel and legally untested.** Vesting only post-mainnet means Circle is monetising the network ahead of any actual decentralisation.
- **The Cochran objection at a product level**: Arc reproduces correspondent banking on smart contracts; if the goal is just bank-to-bank stablecoin rails, an L2 or even off-chain ledger could ship faster.

## 8. Implications for UltraFast

1. **Our stack choice is validated, not threatened.** Arc independently converged on the same modular pattern UltraFast has chosen: **Rust Tendermint-class BFT (Malachite) + reth SDK EVM via Engine API**. That this is also the choice of Informal Systems + Circle + a16z reduces the technical risk on Threshold Simplex + Minimmit + reth materially. We should read the open-source `circlefin/arc-node` carefully — it is the closest public reference implementation of our own engine-API integration pattern, and may save weeks of integration work even if we don't reuse code.
2. **Arc is not a derivatives competitor and probably never will be.** Their validator set, USDC-gas model, and explicit institutional KYC posture make permissionless perps and unbounded scalar prediction markets a poor fit. UltraFast's product wedge — high-frequency perps + scalar markets with structural MEV elimination — is in a different lane. We should *not* pivot positioning to compete on stablecoin settlement; we should position UltraFast as **the derivatives counterpart** to Arc-class settlement chains (i.e., where Arc settles spot FX and tokenised assets, UltraFast prices and clears the derivatives on top).
3. **The Circle / a16z / BlackRock distribution machine is the actual competitive variable.** What Arc proves is that for institutional rails, *distribution beats decentralisation*. UltraFast either needs an analogous distribution partner for RWA-perp listings (e.g., MANTRA's existing RWA partners as the equivalent of Apollo/BlackRock) or a structurally better product on the open side (FBA + threshold-encrypted mempool + Groundhog commutativity — none of which Arc claims credibly). We should sharpen our pitch deck specifically against the "compliant institutional L1" narrative: "Arc settles, UltraFast trades."
4. **Their MEV story is weak — that's our wedge.** Arc gestures at encrypted mempools and batching but ships neither in a specified form. Our three-layer MEV stack (threshold encryption → Groundhog commutativity → FBA) is a defensible technical differentiator that even Arc's biggest backers are not getting from Arc. We should publish a clean technical comparison once our threshold-encryption decision is locked.
5. **CCTP integration is now table stakes.** Arc, Tempo, and Plasma all natively integrate CCTP for USDC liquidity. Our **TSS bridge + Succinct ZK light-client** plan for the Ethereum corridor is necessary but probably insufficient — we should add **CCTP V2 support** (or at least an attestation-compatible USDC entry path) to the YI-stage bridge spec, otherwise institutional USDC liquidity will route around us by default.

## 9. Sources

- [Circle — Introducing Arc (blog)](https://www.circle.com/blog/introducing-arc-an-open-layer-1-blockchain-purpose-built-for-stablecoin-finance) — accessed 2026-05-20
- [Circle — Arc Public Testnet Press Release](https://www.circle.com/pressroom/circle-launches-arc-public-testnet) — accessed 2026-05-20
- [arc.io — official site](https://www.arc.io/) — accessed 2026-05-20
- [GitHub: circlefin/arc-node](https://github.com/circlefin/arc-node) — accessed 2026-05-20
- [Jesus Rodriguez / Sentora — Technical Notes on Circle's Blockchain](https://medium.com/sentora/some-technical-notes-about-circles-new-blockchain-d09b8d26e0a4) — accessed 2026-05-20
- [CoinGecko — What is Arc?](https://www.coingecko.com/learn/what-is-arc-stablechain) — accessed 2026-05-20
- [The Defiant — Open vs Permissioned Chain Debate](https://thedefiant.io/news/blockchains/circle-s-arc-layer-1-re-ignites-the-open-versus-permissioned-chain-debate) — accessed 2026-05-20
- [CNBC — Circle $222M Arc presale](https://www.cnbc.com/2026/05/11/circle-closes-222-million-from-blackrock-apollo-for-arc-blockchain.html) — accessed 2026-05-20
- [The Block — Circle $222M Arc presale at $3B FDV](https://www.theblock.co/post/400709/circle-raises-222m-in-arc-token-presale-at-3b-fdv-from-a16z-crypto-blackrock-and-others-q1-revenue-up-20) — accessed 2026-05-20
- [CoinDesk — Arc quantum-era features](https://www.coindesk.com/markets/2026/04/06/stablecoin-issuer-circle-s-arc-blockchain-to-debut-with-quantum-era-features) — accessed 2026-05-20
- [The Block — Arc onchain FX engine](https://www.theblock.co/post/378723/circle-arc-onchain-fx-engine-multi-currency-stablecoin-program) — accessed 2026-05-20
- [Circle — StableFX](https://www.circle.com/stablefx) — accessed 2026-05-20
- [Across — The Rise of Stablechains (Plasma, Arc, Tempo)](https://across.to/blog/stablechains) — accessed 2026-05-20
- [CoinGecko — What is Tempo?](https://www.coingecko.com/learn/what-is-tempo-stablechain) — accessed 2026-05-20
- [Phemex — Arc Mainnet Summer 2026](https://phemex.com/news/article/circle-unveils-arc-blockchain-whitepaper-mainnet-launch-set-for-summer-2026-82817) — accessed 2026-05-20
