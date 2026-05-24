# tBTC v2 Fresh-Wallet Rotation

## Part 1: How UltraFast uses the tBTC v2 fresh-wallet pattern, and why

UltraFast is a pre-implementation Layer 1 from the MANTRA team. It carries perpetual futures, scalar prediction markets, a data-sales market, and a general EVM lane on top of a single consensus and execution stack. Its bridge model (§10 of the whitepaper) accepts native deposits from Bitcoin, Ethereum and EVM L2s, Solana, and Cosmos chains directly into validator-controlled threshold-signature (TSS) vaults. The corridors use FROST/ROAST for Schnorr and Ed25519, DKLs23 for ECDSA, and CGGMP21 as audited fallback (§10.1). No wrapped-token intermediary sits between a depositor and the system.

That design forces an answer to a hard operational question: when the validator set turns over, what happens to the vault keys? UltraFast's working assumption (§10.3) is the **tBTC v2 fresh-wallet pattern**. At each epoch boundary - either a fixed cadence (initially monthly) or whenever validator-set churn crosses a threshold - a new TSS wallet is generated on every foreign chain. The generation runs a fresh distributed key generation (DKG) ceremony with the current operator set. New deposits route to the new address. The old wallet performs a bounded sequence of sweep transactions that move its UTXOs (or token balances, on account-model chains) into the new wallet, then retires.

The alternative would be **dynamic proactive secret sharing (DPSS)**: keep one vault key forever, and reshare it among the new committee whenever members change. CHURP (Maram et al., CCS'19) and Dynamic-FROST (D-FROST, ePrint 2024/896) are the canonical academic constructions. UltraFast deliberately rejects DPSS at v1 on three grounds:

1. **Simplicity.** A fresh DKG per epoch is the same operation the system runs at genesis. DPSS adds a new cryptographic subprotocol with its own failure modes, abort handling, and audit surface.
2. **Bounded per-wallet exposure.** Every wallet's lifetime - and the maximum value it ever holds - is capped by the epoch length and the sweep window. A long-lived key cannot accumulate every dollar that ever flowed through the bridge.
3. **Cleaner audit story.** A wallet's existence has a defined start, a defined end, and a defined set of operators. Auditors and regulators can reason about each wallet's threshold and economic-security profile in isolation. With DPSS the key is a single object whose committee changes across time, which makes reasoning about historical liability harder.

The trade-off UltraFast accepts (§10.3): the operational overhead of sweep-window tooling, deposit-address rollover UX for users, and on-chain fees for sweep transactions on each corridor. Section 14 names **stale-wallet drainage during epoch rollover** as a residual risk. An adversary who compromises the old wallet during its sweep window could drain remaining balances. Mitigations are a short, bounded sweep window with on-chain monitoring, retention of full TSS security on the old wallet until it is empty, and the bounded per-wallet exposure that the fresh-wallet model produces by construction. Section 16 records the rotation model itself as an open decision: per-epoch fresh wallet (working assumption) vs. CHURP/D-FROST in-place resharing vs. a hybrid that uses fresh wallets at the corridor layer and resharing for long-lived control keys.

## Part 2: tBTC v2 and fresh-wallet rotation in production

### tBTC v2 in one paragraph

tBTC v2 is the Threshold Network's trust-minimised Bitcoin bridge to Ethereum (and onward to Arbitrum, Optimism, Base, Polygon, Solana, Sui, and other deployments). It is the second iteration of Keep Network's tBTC after Keep and NuCypher merged to form Threshold in early 2022. tBTC v2 began phased mainnet rollout in 2022 and reached full mint-and-redeem capability by early 2023. Custody is performed by randomly selected operator groups using threshold ECDSA. As of mid-2026, DefiLlama reports the protocol with roughly mid-hundreds-of-millions of dollars in BTC custody.

### Wallets, not validators

Unlike Chainflip - which has one global vault per chain held by the entire validator set - tBTC v2's unit of custody is the **wallet**, not the validator set. At any moment multiple tBTC v2 wallets exist concurrently:

- Each wallet has a fixed group of **100 operators** drawn by sortition from the Threshold operator pool.
- Each wallet is a **51-of-100 threshold ECDSA** signer (parameters governable).
- Operators are drawn weighted by staked T-token, with a 40,000 T minimum.
- The **Random Beacon** plus the **Sortition Pool** contracts supply the randomness and the weighted draws.
- A **new wallet is generated every 14 days** (originally weekly; both numbers are governance parameters).

The youngest live wallet is the active deposit target; older wallets continue to serve redemptions and eventually move funds onward and retire.

### Wallet lifecycle

tBTC v2 wallets traverse a state machine with four states (per the Threshold docs and the tbtc-v2 bridge contracts):

- **Live.** The wallet accepts deposits and processes redemptions. Active wallets sign sweep transactions on a configured cadence.
- **MovingFunds.** Triggered when the wallet's `wallet_max_age` elapses, when its heartbeat liveness drops below threshold (e.g. below 70 of 100 operators responsive), or when the active slot is otherwise vacated. The wallet calls `submitMovingFundsCommitment` to nominate one or more target wallets. It then executes Bitcoin transactions that transfer balances to those targets, and submits SPV proofs of those transactions to the Ethereum bridge contract.
- **Closing.** All funds have moved or redeemed. The wallet remains liable for a fixed window to defend against fraud challenges on deposits that were revealed but not swept.
- **Closed** (success) or **Terminated** (fraud detected, `movingFundsTimeout` expired, or sweep timeout expired). Termination notifies the ECDSA registry and slashes operators per the fraud rules.

The `movingFundsTimeout` parameter caps the sweep window. If a wallet fails to complete the move within that timeout, it is terminated and its operators slashed.

### Sweep transactions

Sweeps in tBTC v2 perform two distinct functions:

1. **Deposit consolidation (every ~8 hours).** Recently revealed deposits sit at user-specific P2SH or P2WSH scripts with a 30-day refund clause. A sweep transaction unlocks them, consolidates them with the wallet's existing main UTXO, and relocks the combined balance back to the wallet itself under a plain P2PKH script with the refund clause stripped. This (a) collapses many UTXOs into one to reduce future signing complexity and Bitcoin fees, (b) disables the user's refund path now that the deposit has been bridged, and (c) produces a single SPV-provable transaction the Ethereum-side bridge contract can verify in a batch.
2. **Wallet-to-wallet moves (on rotation).** When a wallet enters MovingFunds it produces one or more Bitcoin transactions sending its balance to the nominated target wallet(s). It then submits SPV proofs to the bridge contract on Ethereum.

Both transaction classes use the same signing path. A 51-of-100 ECDSA threshold signature is produced off-chain by the operator group, broadcast to Bitcoin, and proved to Ethereum via SPV against the relayed Bitcoin headers.

### Why this is the fresh-wallet pattern, not key rotation

The key never moves. Each new wallet is a **fresh DKG** producing a brand-new threshold ECDSA key controlled by a brand-new sortition draw. UltraFast adopts the same shape: a wallet is a one-shot key generated by the current operator set, used until the next epoch boundary, then drained.

### DPSS alternatives and why fresh wallets win on operational grounds

**CHURP** (Maram, Zhang, Wang, Low, Zhang, Juels, Song - ACM CCS 2019) was the first practical dynamic-committee proactive secret-sharing scheme designed for blockchain settings. It uses bivariate polynomial sharing to let the secret survive a committee changeover, with on-chain communication O(n) in the optimistic case. CHURP solves the cryptographic problem of changing committee membership without revealing the secret. It introduces its own DKG-style ceremony at every handoff and its own attack surface.

**D-FROST** (Dynamic-FROST, ePrint 2024/896, published 2024) composes FROST with CHURP. The result is the first Schnorr threshold signature scheme that supports both a dynamic committee and a dynamic threshold without changing the group public key. This is academically appealing for Schnorr/Taproot corridors and the BIP-340 Bitcoin signature path that tBTC v2 does not currently use. D-FROST is recent and not yet in production at the time of writing.

The structural reasons UltraFast (following tBTC v2) chose fresh wallets over CHURP or D-FROST:

- **No change to the signing protocol.** FROST signing is the same on a new key as on a reshared key. DPSS adds a resharing protocol that runs alongside signing and has its own abort and identifiable-deviation requirements.
- **Bounded blast radius.** A compromise of one wallet's key compromises one wallet's balance for the duration of one epoch, not every dollar ever bridged.
- **Audit and slashing legibility.** Each wallet has a fixed signer set whose responsibilities are bounded in time. A DPSS handoff produces a key whose historical custodians span every committee that ever participated.
- **Operational tooling already exists.** tBTC v2's sweep, moving-funds, SPV-proof, and heartbeat machinery is a working open-source reference UltraFast can study and adapt.

The downside of fresh wallets is real and non-trivial. Every rotation pays on-chain Bitcoin fees for sweep transactions. Deposit addresses change so wallet UX must handle redirection. The sweep window also introduces a transient interval during which two wallets co-exist with non-zero balances.

### Production analogs

- **tBTC v2** itself, on Bitcoin → Ethereum/L2s/Sui. Threshold ECDSA, 51-of-100, 14-day cadence, ~$372M BTC custody (DefiLlama, mid-2026 snapshot).
- **Chainflip** (closest reference for UltraFast per §10.7). Chainflip rotates vaults across BTC, ETH and EVMs, Solana, and Polkadot. The mechanics differ by chain. On Bitcoin, Chainflip performs a single sweep transaction from old vault to new and uses a modified FROST keygen with both old and new validators participating (a hybrid handover). On EVM and Solana, the smart-contract KeyManager is updated to point at the new aggregate key, with no on-chain fund movement required. UltraFast's working assumption is closer to pure fresh-wallet on every corridor, with the EVM corridor additionally backed by the §10.6 ZK light-client bridge.
- **THORChain.** Rotates vaults using GG20, a TSS scheme UltraFast explicitly excludes (§10.1) due to the TSSHOCK class of attacks on `tss-lib` derivatives.
- **Hyperliquid bridge.** Stake-weighted ECDSA multisig with dispute window plus kill-switch; not TSS-based.

### Open questions for UltraFast specifically

1. **Sweep-window vs. validator-churn rate.** If validators churn faster than the sweep can complete on every corridor (Bitcoin block times of ~10 minutes dominate), wallets stack up. The whitepaper's working monthly cadence is an order of magnitude slower than tBTC v2's 14-day default; the choice is open in §16.
2. **Coordination across corridors.** UltraFast must rotate a Bitcoin wallet, an Ethereum vault, a Solana vault, and a Cosmos vault on the same epoch boundary, each with its own DKG cost and confirmation depth. The Ethereum corridor in particular runs alongside the ZK light-client bridge (§10.6), which introduces additional rotation considerations for the prover contract.
3. **Hybrid model.** A possible Phase 0 outcome (§16) is to use fresh wallets on the high-value corridors (BTC and ETH) and CHURP-style resharing on low-value corridors where sweep gas costs dominate. The whitepaper records this as one of three explicit options.
4. **D-FROST as a v2 candidate.** Once D-FROST has shelf life and audit history, the Schnorr corridors (BTC Taproot, Solana, Cosmos Ed25519) become candidates for in-place resharing while ECDSA corridors stay on fresh-wallet.

## Sources

- [DepositSweep - Threshold Docs](https://docs.threshold.network/app-development/tbtc-contracts-api/tbtc-v2-api/depositsweep)
- [Sweeping - Threshold Docs](https://docs.threshold.network/applications/tbtc-v2/sweeping)
- [Wallets - Threshold Docs](https://docs.threshold.network/app-development/tbtc-v2/tbtc-contracts-api/tbtc-v2-api/wallets)
- [Wallet Generation - Threshold Docs](https://docs.threshold.network/tbtc-v2/wallet-generation.md)
- [tBTC v2 Bridge System - DeepWiki](https://deepwiki.com/threshold-network/tbtc-v2/3.1-bridge-system)
- [threshold-network/tbtc-v2 on GitHub](https://github.com/threshold-network/tbtc-v2)
- [tBTC v2 Launch Timeline - Threshold blog](https://www.threshold.network/blog/tbtc-v2-launch-timeline/)
- [tBTC Technical System Overview](https://tbtc.network/developers/tbtc-technical-system-overview/)
- [tBTC Security Model](https://tbtc.network/developers/tbtc-security-model/)
- [tBTC TVL on DefiLlama](https://defillama.com/protocol/tbtc)
- [CHURP: Dynamic-Committee Proactive Secret Sharing (Maram et al., ACM CCS 2019)](https://eprint.iacr.org/2019/017)
- [Dynamic-FROST: Schnorr Threshold Signatures with a Flexible Committee (ePrint 2024/896)](https://eprint.iacr.org/2024/896)
- [Chainflip Bitcoin Vault Design](https://docs.chainflip.io/protocol/vaults/bitcoin-vault-design)
- [Chainflip EVM Vault Design](https://docs.chainflip.io/protocol/vaults/evm-ethereum-vault-design)
- [Chainflip FROST Signature Scheme](https://docs.chainflip.io/protocol/frost-signature-scheme)
