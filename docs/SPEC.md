# Stan – Local AI Agent: Production Launch Development Brief (v1.1)

**To:** Development Team  
**From:** Product Owner  
**Date:** 2026-05-04  
**Subject:** Turn the current Stan prototype into a privacy‑first, public‑ready AI assistant  

---

## 1. Mission Statement
Stan is a fully local, browser‑based AI agent. It never phones home. Our goal: make it so accessible and polished that any privacy‑conscious user can install and use it immediately, on as many devices as possible, without giving up a single byte of data.

---

## 2. Core Principles (Non‑Negotiable)
- **100% local execution.** No cloud APIs, no telemetry, no data exfiltration. All models and processing stay in the browser.
- **Auto‑adapt to hardware.** The app must detect available capabilities (WebGPU, WASM, CPU) and choose the best engine silently. The user shouldn’t need to understand GPU tiers.
- **Friendly, human‑readable output.** The agent may use structured tool calls internally, but the user must see natural language, never raw JSON.
- **Progressive Web App (PWA).** Installs on any device, works offline after first download, and updates models seamlessly.
- **Accessible by default.** Proper ARIA labels, keyboard navigation, screen‑reader support.

---

## 3. Current State Summary
You start with a fully working React app (`App.tsx`) that already includes:
- Model loading via WebLLM worker, download progress UI, chat interface, markdown rendering, voice I/O, file upload, export/import, settings, MCP server management, and a dark‑themed design.
- Built‑in browser tools (clipboard read/write, geolocation, notifications, wake lock, share, vibrate) already implemented in the `CALL_API` handler.
- DOMPurify sanitisation, unmount guards, and MCP server resync after worker restart are already coded.

**What’s missing:**
- No fallback when WebGPU is unavailable → app fails silently on Firefox, Safari, older hardware.
- Agent outputs raw JSON → unusable for non‑technical users.
- No robust error recovery → stuck on `isProcessing` if worker crashes; no error boundary for React tree.
- Global DOM queries in markdown component → performance risk.
- Download/export buttons may be blocked by pop‑up blockers.
- No PWA capabilities, no auto‑detection, no Electron packaging.
- Async markdown parse could cause empty bubbles (needs explicit `{ async: true }` or sync approach).
- Missing speech recognition types (`@types/dom-speech-recognition`).

---

## 4. Phased Delivery

### Phase 0 – “Critical Fixes Before Public Launch” (Now – 2 hours)
**Objective:** Eliminate bugs that would crash the app or cause a bad first impression.

**Tasks:**
1. **Fix `marked.parse` async handling**  
   - Replace `await marked.parse(text)` with `marked.parse(text, { async: true })` or use synchronous parsing if no async extensions are planned. This ensures messages never appear empty.

2. **Add React Error Boundary**  
   - Wrap the main chat container in an `<ErrorBoundary>` that catches render‑time exceptions (e.g., broken markdown) and shows a fallback UI with a “Reload chat” button instead of a blank screen.

3. **Add default timeout to `fetch_web` MCP tool**  
   - In the worker’s tool handler, abort the fetch after 10 seconds to prevent the agent from hanging on a slow/unreachable URL.

4. **Install speech‑recognition types**  
   - Add `@types/dom-speech-recognition` and remove any `any` casts in the mic handler.

5. **Verify MCP server resync on model change**  
   - The `READY` handler already sends `SYNC_MCP`, but explicitly test that after switching models the worker receives the correct server list.

---

### Phase 1 – “Zero‑Config Deploy” (Weeks 1‑2)
**Objective:** The app works for anyone on any modern browser without manual model selection.

**Tasks:**

1. **Browser Capability Detection & Engine Auto‑Selection**  
   - Create `engineDetector.ts`: probes WebGPU availability (try `navigator.gpu.requestAdapter()`), then falls back to WebAssembly/CPU.  
   - Load the corresponding worker (`worker-wasm.ts` or `worker.ts`) with an identical message protocol.  
   - UI shows only “Loading AI Engine…” and, after ready, a small badge (⚡ for WebGPU, 🧠 for CPU).

2. **Ship Two Model Buckets**  
   - **WebGPU:** Gemma 2B, SmolLM 1.7B, Llama 3.2 3B (already present).  
   - **WASM:** Add a lightweight model like **Gemma 3 270M** or **FunctionGemma** (<400 MB). Auto‑selected when WebGPU is unavailable.

3. **Human‑Readable Agent Output (JSON → Natural Language)**  
   - Parse the agent’s `DONE` response; if it matches `{"action":"…","payload":"…"}`, translate:  
     - `search_memory` → “🔍 Searching your local memory for ‘{payload}’…”  
     - `fetch_web` → “🌐 Fetching **{payload}**…”  
     - `calculate` → “🧮 Calculating `{payload}`…”  
     - `save_note` → “📝 Saving a note: ‘{payload}’…”  
     - `complete` → Use payload directly as final answer.  
   - Provide a “Debug: Show raw JSON” toggle in advanced settings.

4. **Fix Export/Download Pop‑Up Blocker**  
   - Refactor export so the download is triggered synchronously inside the user’s click handler (two‑step: “Prepare Export” then “Click to Download”) or use `showSaveFilePicker` if supported.

5. **Performance & Robustness**  
   - **MarkdownMessage:** use a local `ref` and `React.memo`; no global `querySelectorAll`.  
   - **Timeout guard:** reset `isProcessing` if no response within 60 seconds.  
   - **Recovery:** on worker crash, show a “Retry” button that restarts the engine.

**Acceptance Criteria:**
- App works on Chrome, Firefox, Edge, Safari; auto‑picks best engine.
- Agent speaks in natural sentences (no JSON visible by default).
- Export/import works reliably.
- “Retry” appears after crash; timeout prevents permanent dead‑lock.
- No global DOM queries inside markdown component.

---

### Phase 2 – “Installable & Trustworthy” (Weeks 3‑4)
**Objective:** Make Stan a legitimate PWA and polish its security, accessibility, and persistence.

**Tasks:**
6. **PWA Implementation**  
   - `manifest.json` (theme `#0a0b14`, standalone).  
   - Service worker precaches shell + model files (Cache API).  
   - “Install App” prompt via `beforeinstallprompt` event.

7. **Conversation Persistence (Opt‑in)**  
   - Save messages to IndexedDB, restore last session on reload. Fully local, toggle in settings.

8. **Accessibility & Mobile UX**  
   - ARIA labels on all icon buttons; modal closes on Escape/backdrop click.  
   - Larger touch targets for file upload; mobile drag‑and‑drop zone.

9. **Security Hardening**  
   - DOMPurify config: force `rel="noopener noreferrer"` on all links.  
   - Optional encrypted exports via Web Crypto API.

10. **Storage Management**  
    - IndexedDB for large data; “Clear all data” button (wipes DB + caches + localStorage).  
    - Request persistent storage to protect model files from eviction.

**Acceptance Criteria:**
- Lighthouse accessibility ≥ 95.
- PWA installable, works offline.
- Conversations survive page refresh (if enabled).
- All actions reachable with keyboard/screen reader.
- Encrypted export option available.

---

### Phase 3 – “Enterprise & Distribution” (Weeks 5‑6)
**Objective:** Package for managed deployments and final quality assurance.

**Tasks:**
11. **Electron Desktop App**  
    - Wrap React app; auto‑updater; admin config file for prompt/models.

12. **Automated Testing**  
    - Unit tests (JSON parser, engine detector).  
    - E2E with Playwright + mock worker.  
    - Performance benchmarks (model load time, chat latency).

13. **Documentation**  
    - User manual, admin guide, privacy impact assessment.

14. **Optional: Virtualised Message List**  
    - If conversation length exceeds 100 messages, use `react‑virtuoso` to keep UI smooth.

**Acceptance Criteria:**
- Electron builds for Windows/macOS/Linux.
- Test suite passing.
- Documentation ready for security review.

---

## 5. Technical Constraints
- Identical message protocol for both WebGPU and WASM workers.
- All new model files must have correct `Content-Type` for SW caching.
- JSON‑to‑text parser must only trigger on valid JSON with an `action` field.
- No external CDNs or analytics allowed.

---

## 6. Definition of Done
- [x] Critical fixes (#1‑5) applied and deployed.
- [x] Auto engine selection works on all major browsers.
- [x] Agent replies in natural language (JSON hidden).
- [x] PWA installable and offline‑ready.
- [x] Error boundary and timeout guard in place.
- [x] Export/import works without pop‑up issues.
- [x] Accessibility ≥ 95.
- [x] Conversation persistence works (opt‑in).
- [x] Electron builds packaged and tested.
- [x] All tests green.

---

## 7. Timeline
- **Phase 0:** 2 hours (immediately)
- **Phase 1:** 2 weeks  
- **Phase 2:** 2 weeks  
- **Phase 3:** 2 weeks  
- **Total:** 6 weeks + 2 hours to polished, public‑ready v1.

---

*Handover package: \`App.tsx\` + this brief.*
