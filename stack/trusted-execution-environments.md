# Trusted Execution Environments (TDX, SEV-SNP)

Deep research note for the UltraFast whitepaper, covering Intel Trust Domain Extensions (TDX) and AMD Secure Encrypted Virtualization with Secure Nested Paging (SEV-SNP). These are the two confidential-computing technologies that back the dark-pool tier of UltraFast's privacy framework.

UltraFast is a pre-implementation Layer 1 designed by the MANTRA team for perpetual futures, scalar prediction markets, data sales, and an EVM lane. The whitepaper (`/Users/g/git/mantra/ultrafast/whitepaper.md`) introduces TEEs in §11 (Privacy Tiers - TEE dark pool), §14 (TEE side-channel risk in the risk register), and §17 (Privacy phase 2 - TEE staged in two phases).

---

## Part 1: How UltraFast uses TEEs and why

**Role: dark-pool tier of the §11 privacy framework.** UltraFast offers privacy as opt-in tiers, not as a baseline. The lit default uses FBA plus MCP and hides nothing on chain. The position-private tier (v2 target) uses Pedersen commitments and range proofs over positions and margin ratios. The dark-pool tier hides full pre- and post-trade order detail by moving matching itself into a TEE-attested enclave whose remote-attestation evidence is published on chain. The fourth tier, a Renegade-style ZK + MPC dark pool, is the v2+ migration target from the TEE tier.

**What is hidden.** Inside the enclave the matching engine sees plaintext orders, computes the cross, and emits settlement instructions. Validators and observers see only the attested code identity, the public input commitments, and the on-chain settlement events. The settlement events still leak fill size and price for each matched trade; that residual leak is intrinsic to settling on a public chain and is the same residual leak the ZK + MPC tier carries. Pre-trade visibility, resting-order books, and unmatched intent are hidden.

**Why TEE before ZK + MPC (§11).** Renegade-style ZK + MPC matching is the strongest available privacy guarantee but currently adds tens to hundreds of milliseconds of proving overhead per match. TEE matching runs at sub-millisecond enclave latency with vendor attestation as the trust assumption. For a venue that has not yet bootstrapped flow, the ZK + MPC cost is paid by every match, against an empty book. The whitepaper's stated reasoning is that flow has to be bootstrapped against the cheaper trust model first. Once flow is live, the same volume can migrate to ZK + MPC without reopening venue economics. The matching contract, fee schedule, and integration surface stay constant; only the matching engine's internal proof system changes.

**Staged in two phases (§17).** Phase 1 ships at v1.5 with a single TEE vendor, either Intel TDX or AMD SEV-SNP, the decision deferred to implementation. Phase 2 adds the second vendor with a threshold-decrypt fallback path. The threshold step makes the attack surface conjunctive: an attacker needs both a TDX break and an SNP break to recover plaintext orders. It also ensures liveness when one vendor's attestation service is degraded.

**Side-channel risk explicitly named (§14).** The whitepaper records TEE side-channel attack as a hardware-class risk in the v1.5+ row of its risk register. The stated mitigations are multi-vendor attestation, per-match size limits that cap the loss from a single compromised enclave, and a documented migration path to ZK + MPC at v2. The honest line in §14 is that TEE-class risk is irreducible without ZK + MPC; the migration path is the only structural fix.

---

## Part 2: Deep research on TEEs (Intel TDX, AMD SEV-SNP)

### How Intel TDX works

Intel Trust Domain Extensions introduces a new VM-scoped isolation primitive called a Trust Domain (TD). A TD is a confidential VM whose memory is encrypted with the platform's Multi-Key Total Memory Encryption (TME-MK) keys, integrity-protected, and inaccessible to the host VMM, the host OS, and any non-TD workload on the same socket. The TDX module is Intel-signed and loaded into a special operating mode called SEAM (Secure Arbitration Mode). It mediates every transition between the VMM and the TD and enforces that the VMM cannot read TD register state, TD memory, or any other TD-internal artefact.

Remote attestation under TDX is built on Intel's Provisioning Certification Service (PCS). When a TD needs to prove its identity to a remote relying party, a quoting enclave produces a TD Quote signed under the platform's Provisioning Certification Key (PCK). The relying party verifies the quote against a chain anchored at PCS, optionally using a local Provisioning Certificate Caching Service (PCCS) to avoid hitting Intel on the hot path. The quote includes a measurement of the TD's initial state (MRTD), a build-time measurement of additional code loaded into the TD (MRCONFIGID, MROWNER, MROWNERCONFIG), and a runtime extension log analogous to TPM PCRs. A relying party that trusts Intel's root CA, the TDX module's measurement, and the TD's measurement can conclude the TD is running the expected code on a genuine TDX platform with a current TCB.

The whitepaper cites the Intel TDX Whitepaper (February 2022) and the Google Cloud Intel TDX Security Review (April 2023). The Google review is the public independent audit and is the closest thing to a peer-reviewed evaluation of TDX's security claims.

### How AMD SEV-SNP works

AMD Secure Encrypted Virtualization started in 2016 with SEV (memory encryption only), gained register protection in SEV-ES (Encrypted State, 2017), and reached its current form as SEV-SNP (Secure Nested Paging, 2020). SNP adds integrity protection to encrypted memory via the Reverse Map Table (RMP), which records the owner of every encrypted page and refuses any access that violates the page's claimed ownership. The RMP closes the class of attacks where a malicious hypervisor remaps an encrypted page to a different guest or aliases it to capture writes.

SEV-SNP runs guests as confidential VMs. Full unmodified Linux or Windows guests can boot inside an SNP-protected VM, with all guest memory encrypted under a per-VM key managed by the AMD Secure Processor (AMD-SP). The hypervisor schedules and pages the VM but cannot read or tamper with its memory or register state.

Remote attestation uses AMD's Key Distribution Service (KDS, `https://kdsintf.amd.com`). Each EPYC chip has a Versioned Chip Endorsement Key (VCEK), a unique ECDSA key bound to the chip ID and current TCB version. Attestation reports are signed by the VCEK; the relying party fetches the VCEK certificate from KDS, validates the chain back through the AMD SEV Key (ASK, intermediate) to the AMD Root Key (ARK), and checks the report's measurement and TCB fields. The chain of trust mirrors Intel's PCS model but is operated by AMD directly through a single global HTTP endpoint.

### Available CPUs and cloud availability

**Intel TDX.** TDX shipped general availability on 5th gen Xeon Scalable (Emerald Rapids, launched December 2023) and is carried forward on Xeon 6 (Granite Rapids, 2024-2025). On 4th gen Xeon Scalable (Sapphire Rapids) TDX was limited or absent depending on SKU and stepping. Azure offers TDX confidential VMs as DCesv5/ECesv5 (4th gen Xeon, public preview December 2023) and DCesv6/ECesv6 series (5th gen Xeon, general availability across multiple regions). Google Cloud offers TDX confidential VMs on the C3 machine series (general availability in asia-southeast1, us-central1, europe-west4 at minimum). Confidential Space, Google's TEE-attested workload framework, added TDX support in preview.

**AMD SEV-SNP.** SEV-SNP requires Zen 3 or newer: EPYC Milan (3rd gen, 2021), EPYC Genoa (4th gen, 2022), EPYC Bergamo (cloud-native variant, 2023), and EPYC Turin (Zen 5, 2024). Azure offers SEV-SNP confidential VMs on DCasv5/ECasv5 series. Google Cloud offers SEV-SNP on the N2D series (asia-southeast1, us-central1, europe-west3, europe-west4) and SEV (without SNP) on C3D. AWS is the structural outlier: AWS does not currently expose TDX or SEV-SNP, instead offering Nitro Enclaves, which use a different architectural model.

**AWS Nitro Enclaves - different model.** Nitro Enclaves are carved-out VMs that run alongside the parent EC2 instance with no network, no persistent storage, and no operator shell. Isolation is enforced by the Nitro hypervisor rather than by CPU-level memory encryption with integrity (TDX) or by per-VM encryption keys in the SP (SEV-SNP). The trust assumption shifts from "trust the CPU vendor and the platform firmware" to "trust the AWS hypervisor and the Nitro card." Attestation is via PKI signed by AWS itself. For a chain like UltraFast that wants vendor-independent attestation as the v1.5 dark-pool trust story, Nitro Enclaves are not a substitute for TDX or SEV-SNP. They are a different point in the design space.

### Crypto-specific deployments

**Flashbots and BuilderNet (Intel TDX).** Flashbots built the first SGX-built Ethereum block in March 2023 and the first TDX-built block at slot 8970311 (block 19767105, 30 April 2024). BuilderNet launched in November 2024 with Flashbots, Beaverbuild, and Nethermind as the founding operators; by December 2024 Flashbots had migrated all orderflow off its centralised builders into BuilderNet. The design rests on TDX confidential VMs as one of three pillars (TDX, shared orderflow, public refund rules). BuilderNet currently runs only on Azure TDX VMs; multi-provider support is in development. This is the largest production deployment of TDX in an MEV-sensitive pipeline and is the closest existing analog to UltraFast's TEE-attested matching engine.

**Phala Network (TDX, GPU TEE).** Phala originally ran on SGX. In December 2024, in response to Intel's discontinuation of SGX-IAS and to subsequent SGX vulnerabilities (including WireTap, see below), Phala announced sunsetting Khala chain workers, migrating to Intel TDX as the host-side TEE, and adding NVIDIA Confidential Computing for GPU-side workloads. Phala's DStack tool packages TDX confidential VMs for application developers; Phala 2.0 (2025) carries this forward with an Op-Succinct L2 on Ethereum.

**Oasis Network (Sapphire).** Oasis runs Sapphire, a confidential EVM ParaTime that executes Solidity contracts inside TEEs with end-to-end encrypted state. Sapphire historically used SGX. The ROFL (Runtime Offchain Logic) framework added TDX support on mainnet. Sapphire is the closest existing production analog to a confidential smart-contract environment and is the design that proves TEE-attested EVM execution is operationally tractable at chain scale.

**Secret Network.** A privacy-first L1 where every contract ("Secret Contract") runs in an SGX enclave with encrypted inputs, outputs, and on-chain state. Validators run SGX-enabled hardware and the chain enforces enclave attestation as a precondition for joining the validator set. Secret has been the longest-running production deployment of TEE-backed smart contracts and is the design pattern most exposed to the SGX-class vulnerabilities discussed below.

**Renegade.** Built on Starknet, Renegade is the canonical Renegade-style ZK + MPC dark pool the UltraFast whitepaper cites as the v2+ migration target. Renegade uses collaborative SNARKs (ZK SNARK proof generation embedded inside an MPC protocol between two relayers) to settle matched orders without revealing the underlying intent. Relayers are organised into fail-stop fault-tolerant clusters that horizontally scale matching execution. Renegade is not a TEE deployment but is the design target whose latency cost is what makes the §11 TEE-first staging argument concrete.

**Other crypto TEE work.** Marlin (decentralised TEE-based coprocessor), Automata (TEE attestation network), Sleeper Labs / Sage (TEE-as-a-service research) and a number of MEV-resistant builder networks (Titan Builder's TDX experiments, rbuilder-tdx) round out the production envelope.

### Side-channel attack history

TEEs have a long and continuing record of side-channel attacks. The relevant history splits across SGX (Intel's older process-based TEE), SEV / SEV-ES / SEV-SNP, and TDX.

**Against SGX.** The attacks include Foreshadow (2018, speculative-execution leak of enclave secrets), Plundervolt (2019, undervolting), LVI (2020, Load Value Injection), SGAxe and CrossTalk (2020), ÆPIC Leak (2022), and most recently WireTap (October 2025, Georgia Tech and Purdue). WireTap is a passive DDR4 bus interposer built from under-$1,000 second-hand electronics that recovered the SGX Quoting Enclave's ECDSA signing key by exploiting deterministic memory encryption. WireTap requires physical access; Intel positions it outside the SGX threat model. WireTap does not directly apply to DDR5 hardware or to TDX, because TDX uses TME-MK with stronger encryption than the deterministic scheme used on SGX servers.

**Against SEV and SEV-ES.** A near-uninterrupted run of attacks since 2018: SEVurity, CrossLine, SEVered, PSP-based fault injection, undeSErVed, and CipherLeaks. These motivated the introduction of SEV-SNP.

**Against SEV-SNP.** CacheWarp (CVE-2023-20592, software-fault attack hijacking control flow inside SNP guests), WeSee (2024, malicious #VC interrupt injection from the hypervisor, leaking kTLS keys and enabling code injection), BadRAM (2024, exploiting unauthenticated DRAM size metadata to create memory aliasing), CVE-2024-56161 (improper signature verification in CPU ROM microcode patch loader, allowing malicious microcode under admin privilege, CVSS 7.2), Heracles (2025, chosen-plaintext attack), RMPocalypse (2025), and StackWarp (CVE-2025-29943, breaking SNP protections on Zen 1-5 by altering CPU pipeline configuration with admin privilege).

**Against TDX.** TDXdown (USENIX CCS 2024, University of Lübeck) describes two attack techniques: single-stepping a TDX-protected VM by deluding the security monitor about elapsed time, and StumbleStepping, a design flaw in the single-stepping countermeasure that leaks instruction counts. The researchers demonstrated end-to-end key recovery against wolfSSL's ECDSA implementation. Intel mitigated the single-stepping heuristic in TDX module 1.5.06 and refers StumbleStepping mitigation to application-level guidance. A 2025 IACR ePrint follow-up demonstrated performance-counter side channels distinguishing idle and active TDs through core contention with the VMM.

The pattern is consistent: each TEE generation closes the previous round of attacks and exposes new ones. For a venue that holds plaintext order books inside the enclave, the relevant question is not whether all attacks are closed (they are not) but whether the residual attack surface is bounded relative to the value at risk. The whitepaper's §14 mitigation set (multi-vendor attestation, per-match size limits, ZK + MPC migration path) is structurally responsive to this pattern.

### Multi-vendor attestation as defence in depth

The Phase 2 design in §17 makes the TEE tier require attestation from both an Intel TDX enclave and an AMD SEV-SNP enclave running redundantly. An attacker who breaks Intel's TDX (e.g. a TDXdown successor) still has to break AMD SEV-SNP independently to recover plaintext orders, because the threshold-decrypt step requires shares from both vendor classes. The cost of attacking is no longer "one TEE class" but "two TEE classes whose vulnerability surfaces are largely uncorrelated." This is the same defence-in-depth pattern Confidential Space uses when offered across both TDX and SEV-SNP backends and is the strongest currently-available answer to vendor-specific side channels short of moving to ZK + MPC.

### Open-source and non-x86 alternatives

**RISC-V Keystone.** An open-source TEE framework for RISC-V (`https://keystone-enclave.org/`) built on three components: a runtime, a host driver, and a security monitor enforcing physical-memory protection via RISC-V PMP. Keystone runs on QEMU, FireSim FPGA, and the SiFive HiFive Unleashed board. As of 2024-2025, Keystone is still working toward production-readiness; it is not a substitute for TDX or SEV-SNP in a venue context today but is the strongest open-source candidate for a future TEE tier that does not depend on a closed-source CPU vendor.

**AMD SEV-ES upstream Linux support.** AMD has upstreamed SEV-ES guest support into the mainline Linux kernel; Ubuntu 25.04 added SEV-SNP host support, and Fedora has work in flight (`fedoraproject.org/wiki/Changes/ConfidentialVirtHostAMDSEVSNP`). The host-side stack is now mainstream enough that a venue operator can run SEV-SNP on commodity Linux distributions without bespoke kernel patches.

**ARM CCA (Confidential Compute Architecture).** The ARM equivalent of TDX / SEV-SNP, introduced with ARMv9. Not yet at the level of production cloud availability TDX and SEV-SNP enjoy, but worth tracking for v2+.

---

## Implications for UltraFast

The literature points the same direction as §11 and §14:

- **TDX and SEV-SNP are production-ready in the sense that BuilderNet, Phala, and Oasis run on them today.** A v1.5 dark-pool tier is not breaking new ground.
- **Single-vendor attestation is the weak link.** Every vendor has shipped CVE-class side channels in the last two years. Phase 1 single-vendor is a calculated trade for time-to-market; Phase 2 multi-vendor is the structural fix.
- **The WireTap result and the TDXdown result together close any argument that a TEE tier is "as private as ZK + MPC."** It is not, and the whitepaper does not claim it is. The argument is that TEE privacy is enough to bootstrap flow, and migration to ZK + MPC closes the residual gap at v2+.
- **Per-match size limits matter.** A successful side-channel attack on an enclave processing one match at a time leaks the size of that match. A successful attack on an enclave that batches a million matches leaks all million. The §14 per-match size limit is the operational lever that caps the loss from a successful side channel, independent of whether the side channel is closed.
- **Renegade is the right v2+ migration target.** It is the only deployed production design that closes the vendor-trust assumption without reintroducing the latency problem at a venue-economics level. Collaborative SNARKs let proving be amortised across the relayer cluster rather than paid per-match by the matching engine alone.

---

## References

- Intel Corporation. "Intel Trust Domain Extensions (Intel TDX) Whitepaper." February 2022. `https://cdrdv2-public.intel.com/690419/TDX-Whitepaper-February2022.pdf`
- Google Cloud. "Intel TDX Security Review." April 2023.
- AMD. "AMD SEV-SNP: Strengthening VM Isolation with Integrity Protection and More." `https://www.amd.com/content/dam/amd/en/documents/epyc-business-docs/white-papers/SEV-SNP-strengthening-vm-isolation-with-integrity-protection-and-more.pdf`
- AMD. "SEV Secure Nested Paging Firmware ABI Specification." Publication 56860.
- AMD. "Versioned Chip Endorsement Key (VCEK) Certificate and KDS Interface." Publication 57230.
- Intel. "Intel TDX DCAP Quoting Library API." `https://download.01.org/intel-sgx/latest/dcap-latest/linux/docs/Intel_TDX_DCAP_Quoting_Library_API.pdf`
- Wilke, Wichelmann, Sieck, Eisenbarth. "TDXdown: Single-Stepping and Instruction Counting Attacks against Intel TDX." ACM CCS 2024.
- "Exploring side-channels in Intel TDX." IACR ePrint 2025/079.
- "WireTap: Breaking Server SGX via DRAM Bus Interposition." Georgia Tech and Purdue, October 2025. `https://wiretap.fail/`
- CISPA. "CacheWarp." `https://cispa.de/en/cachewarp`
- "WeSee: Using Malicious #VC Interrupts to Break AMD SEV-SNP." arXiv 2404.03526.
- "Heracles: Chosen Plaintext Attack on AMD SEV-SNP." CCS 2025.
- "RMPocalypse: How a Catch-22 Breaks AMD SEV-SNP." CCS 2025.
- Flashbots Collective. "Building Secure Ethereum Blocks on Minimal Intel TDX Confidential VMs." `https://collective.flashbots.net/t/building-secure-ethereum-blocks-on-minimal-intel-tdx-confidential-vms/3795`
- Flashbots Collective. "First blocks built inside TDX." `https://collective.flashbots.net/t/first-blocks-built-inside-tdx/3386`
- Phala Network. "Strategic Transition Beyond SGX in Response to WireTap Findings." `https://phala.com/posts/response-to-wiretap-sgx-deprecation`
- Oasis Network. "Sapphire ParaTime documentation." `https://docs.oasis.io/`
- Renegade Finance. "What is a collaborative zkSNARK?" `https://help.renegade.fi/hc/en-us/articles/32529961385363-What-is-a-collaborative-zkSNARK`
- Microsoft Azure. "Announcing general availability of Azure Intel TDX confidential VMs." `https://techcommunity.microsoft.com/blog/azureconfidentialcomputingblog/announcing-general-availability-of-azure-intel%C2%AE-tdx-confidential-vms/4495693`
- Google Cloud. "Confidential VM supported configurations." `https://cloud.google.com/confidential-computing/confidential-vm/docs/supported-configurations`
- Keystone Enclave. `https://keystone-enclave.org/`
