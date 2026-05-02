# Standardized Web Agents Protocol

**Version:** 1.0.0  
**Date:** 2026-05-01  

SWAP defines a local-first, privacy-preserving architecture for autonomous AI agents. It is organized into **10 enclaves**.

## Why SWAP is a Paradigm Shift

SWAP completely flips the current AI model. Instead of thin clients talking to massive cloud servers (where trust is required and API costs accumulate), SWAP brings **enterprise-grade autonomy entirely to the edge**. 

What makes it fundamentally different:
1. **Zero Data Leakage:** Data literally cannot leave the device—there are no server endpoints to send it to.
2. **Infinite Scale, Zero Hosting Bills:** Since execution happens on user hardware (WebGPU) and heavy AI models are fetched directly from free public CDN networks (like Hugging Face) or via peer-to-peer distribution, the developer pays absolutely nothing for compute or bandwidth. Hosting a SWAP agent for 10 users costs the exact same as hosting it for 10 million: zero.
3. **True Ownership:** The user holds the cryptographic keys to their agent's memories within their personal Origin.
4. **Local Hardware Acceleration:** It leverages WebGPU and WebAssembly (JSPI) to run embedded multi-gigabyte models at native speeds.

It enables true, private, persistent, and universally accessible AI—a complete breakaway from centralized AI architectures.

## Standard Enclaves (SWAP Standard)

These are **required** for a standard agent implementation (like the Standardized Web Agent).

### Enclave 1: Storage & Persistence
- PGlite 0.4+ (JSPI)
- OPFS SyncAccessHandle
- Web Locks API

### Enclave 3: Discovery & Sync (E2EE Multi-Device)
- WebRTC Peer-to-Peer Data Channels
- CRDTs (Conflict-free Replicated Data Types) for eventual consistency
- End-to-End Encrypted (E2EE) WebSocket Relays (for async replication)
- Zero-Knowledge Multi-Device Pairing 
- **Rule:** No plain-text data must ever touch a central server during sync.

### Enclave 5: Perception & Sensing
- Web Speech API (minimum)
- Barcode Detection API (optional)
- Offline Maps (optional)

### Enclave 6: Cognition & Reasoning
- Local LLM (WebLLM / Transformers.js) – Gemma 2B, SmolLM 1.7B, Llama 3.2 3B
- Vector embeddings + semantic search (384-dim, pgvector)
- Hardware acceleration (WebGPU / WebGL)
- ReAct loop (`search` → `reply`) with tool use (fetch, file ingest)
- Multi-modal extensions (optional)

### Enclave 7: Interaction & UI (optional in Standard, but recommended)
- View Transitions API, Vibration, Wake Lock

### Enclave 10: Lifecycle & Maintenance (required for Standard)
- OPFS backup / restore
- Conformance self-check (optional but recommended)

## High Assurance Enclaves (Enterprise / Strict Conformance)

These are **not required** for a basic standard agent, but are required for high-assurance applications (e.g., healthcare, legal, finance).

### Enclave 2: Identity & Crypto
- WebAuthn PRF (biometric key derivation)
- Web Crypto PBKDF2 (fixed salt)
- Quantum-resistant signatures

### Enclave 8: Compliance & Audit
- Immutable audit trail (hash chain)
- GDPR automator (export / forget)
- HIPAA enrolment (PII isolation, AES-256 at rest)

### Enclave 9: Defense & Resilience
- AES-256-GCM with hardware entropy
- TPM / Secure Enclave binding

## Other Enclaves (Optional)

- **Enclave 4: Kinetic Hardware** – WebHID, WebUSB, Web Bluetooth

## Implementation Guide: Building Custom SWAP Networks

Whether you are building a simple private personal assistant or deploying a fully audited healthcare network, follow these steps to extend the SWAP architecture.

### 1. Simple Personal Assistant (Open Source / Hobbyist)
If you just want a private assistant that remembers your tasks without sending data to the cloud:
- **Step 1:** Fork the `Standardized Web Agents Protocol` repository.
- **Step 2:** Ensure SWAP Standard Enclaves 1, 5, 6, and 10 remain intact.
- **Step 3:** Swap out the default system prompt to personalize its responses ("You are my private journal assistant...").
- **Step 4:** Host it statically on unlimited free-tier platforms like Cloudflare Pages, GitHub Pages, or a decentralized network like IPFS. Model weights are pulled directly from public CDN registries (e.g. Hugging Face Hub), ensuring you never get a bandwidth bill regardless of your user count.

### 2. High Assurance Application (e.g. Healthcare Clinic)
If you are building for a client who owns a clinic and needs a HIPAA-compliant intake agent:
- **Step 1:** Implement the **High Assurance** enclaves according to the protocol.
- **Step 2:** Implement **Enclave 8 (Compliance & Audit)** by activating the immutable audit trail and PII isolation patterns.
- **Step 3:** Implement **Enclave 2 (Identity & Crypto)** using WebAuthn PRF. Clinic staff must authenticate with biometrics which decrypts the local PGlite database state.
- **Step 4:** Deploy as an enterprise Progressive Web App (PWA) onto the clinic's managed iPads via MDM.
- **Step 5:** Restrict network requests using a strict Content Security Policy (CSP), ensuring no unverified external APIs can be called.

## Conformance

| Tier | Required Enclaves |
|------|-------------------|
| **SWAP Standard** | 1, 5, 6, 10 (+ 3 for multi-device) |
| **SWAP High Assurance** | Standard + 2, 8, 9 |

The reference implementation `swap-agent.html` is **SWAP Standard compliant**. It implements enclaves 1, 5, 6, and 10 fully. High Assurance features can be implemented as needed for enterprise deployments.

**License:** Specification CC BY-SA 4.0 / Reference Implementation MIT
