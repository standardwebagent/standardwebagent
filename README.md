# Stan — Local-First Personal AI Assistant

**Stan** is a privacy-first, autonomous AI assistant built on the **Standardized Web Agent Protocol (SWAP)**. Unlike cloud-based chatbots, Stan runs entirely on your hardware and connects directly to your local ecosystem.

- **Formal specification:** [protocol.md](public/protocol.md) – covering the 10 core enclaves of the protocol.
- **Private & Secure:** Core logic and memory stay in your browser. Dramatically reduced server dependencies and no data leakage.
- **MCP Integration:** Connects to local databases, file systems, and calendars via the Model Context Protocol (MCP).
- **Local AI & Hardware Acceleration:** Leverages your GPU, NPU, or CPU for native-speed inference using **WebAssembly, WebNN, and WebGPU**, with automatic fallbacks for optimal performance on any device.

### Why Stan is Different

Stan isn't just a chat interface; he is an **agent** designed for autonomy:

1. **Total Privacy:** Your data never leaves your device.
2. **Minimal Marginal Cost:** Since execution happens locally, you bypass traditional per-token API fees and server-side compute overhead for core logic.
3. **Local Action:** Using MCP, Stan can actually "do" things—read your local files, check your calendar, or search your private databases.
4. **Offline-First:** Once loaded, Stan functions completely offline. Installable as a Progressive Web App (PWA).

---

## 🚀 Quick Start

1. Visit the **Stan Agent** in any modern browser. Stan auto-detects your system capabilities.
2. Wait for the initial model download (cached for future use).
3. **Connect your tools:** Go to Settings ⚙️ and add your local MCP server URLs (e.g., `http://localhost:3000/sse`).

## 🧠 Capabilities

**MCP Tool Use**
Stan can dynamically discover and invoke tools provided by any MCP-compliant server. This allows him to interact with your local environment safely.

**Autonomous Reasoning**
Stan runs in an autonomous loop (up to 15 steps), allowing him to think, use tools, search memory, and gather information before completing a task. Internal thoughts are transparently parsed into human-readable actions.

**Local Vector Memory (RAG)**
Using an embedded **PGlite** (Postgres WASM) database with vector extensions, Stan stores your notes and documents locally.

- **Document Ingestion:** Drag and drop `.txt` or `.md` files to build a local knowledge base.
- **Semantic Recall:** Stan automatically retrieves relevant context.

**High-Performance Local AI**
Choose your engine:

- ⚡ **FunctionGemma 270M** (Lightning-fast, default)
- 🖥️ **WASM/WebNN/WebGPU Engines** (Optimized for your hardware)
- ⚙️ **Custom Models** (Add more via the Settings menu)

> **Important:** Stan requires a device with at least 4GB of RAM and 4 CPU cores to execute local AI models successfully.

## 📚 Documentation

Explore the following configuration and operational guides for Stan:

- **[User Manual](docs/USER_MANUAL.md):** Feature guide, local setup, and interface controls.
- **[Admin Guide](docs/ADMIN_GUIDE.md):** Desktop application builds, custom models, and WASM/WebGPU engine overrides.
- **[Privacy Impact Assessment](docs/PRIVACY_IMPACT_ASSESSMENT.md):** Security constraints, local-only data persistence, and zero-telemetry footprint.

Contributions to the protocol specification or reference implementation are welcome. Please open an issue or pull request.

For major changes to the spec, open a protocol-change proposal.

---

📄 License

· Protocol specification (protocol.md): CC BY-SA 4.0
· Reference implementation (index.html, src/\*, and related code): MIT

---

🌐 Links

· GitHub Repository: https://github.com/standardwebagent/Standardized-Web-Agents-Protocol
· Protocol Specification: [protocol.md](public/protocol.md)
