# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UltraFast is a **custom Layer 1 blockchain** for unified on-chain derivatives — perpetual futures and scalar prediction markets sharing a single matching engine and margin system. It is in the **pre-code research/architecture phase** (no source code yet).

The project is part of the MANTRA ecosystem, targeting CEX-grade performance (sub-200ms finality, 200K+ ops/sec) with structural MEV elimination.

## Key Documents

- `ACTION_PLAN.md` — Validated architecture, product design, open design decisions, and phased build plan
- `RESEARCH_PLAN_30D.md` — 30-day research sprint (starting 2026-03-25) with tasks, deliverables, and exit criteria
- `RESEARCH.md` — Full research backing (~46K tokens): consensus protocols, execution models, MEV elimination, matching engines, privacy/ZK, prediction markets, competitive analysis

## Architecture Summary

The technical stack has four core layers:

1. **Consensus**: 2-phase pipelined HotStuff + MonadBFT tail-forking resistance (linear message complexity, ~100-200ms finality)
2. **Execution**: Groundhog commutative model — all transactions in a block read the same state snapshot, no intra-block ordering exists
3. **Matching**: Frequent Batch Auctions (FBA) — uniform clearing price per market, pro-rata fills, no speed advantage
4. **MEV elimination**: Three-layer stack — threshold encrypted mempool (pre-trade privacy) → Groundhog (no reordering possible) → FBA (no sandwich/frontrun)

Products: perpetual futures (crypto + RWA) and scalar prediction markets with a unified cross-product margin system.

## Current Phase

Research and design. Nine open design decisions must be resolved before implementation (listed in ACTION_PLAN.md §4). The 30-day research plan covers:
- Evaluating Rust BFT frameworks vs building from scratch
- Groundhog C++ codebase assessment (Rust port vs FFI)
- FBA matching engine prototype
- Threshold encryption feasibility
- Cross-product margin model design

## Key Technical References

- Groundhog: `scslab/smart-contract-scalability` (C++, Apache 2.0, ~30K lines)
- TrX encrypted mempool: ePrint 2025/2032
- MonadBFT: arXiv:2502.20692
- Renegade dark pool: `renegade-fi/renegade`, `mpc-jellyfish`
- Target implementation language: Rust
