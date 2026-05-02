# Stan — Local-First Personal AI Assistant

[![GitHub Repository](https://img.shields.io/badge/GitHub-Repository-black?logo=github)](https://github.com/standardwebagent/Standardized-Web-Agents-Protocol)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Stan** is a privacy-first, autonomous AI assistant built on the **Standardized Web Agent Protocol (SWAP)**. Unlike cloud-based chatbots, Stan runs entirely on your hardware and connects directly to your local ecosystem.

- **Formal specification:** [protocol.md](/public/protocol.md) – covering the 10 core enclaves of the protocol.
- **Private & Secure:** Core logic and memory stay in your browser. No server costs, no API keys, no data leakage.
- **MCP Integration:** Connects to local databases, file systems, and calendars via the Model Context Protocol (MCP).
- **WebGPU Powered:** Leverages your GPU for native-speed inference using WebLLM.

### Why Stan is Different
Stan isn't just a chat interface; he is an **agent** designed for autonomy:
1. **Total Privacy:** Your data never leaves your device.
2. **Zero Marginal Cost:** Since execution happens locally, there are no token fees or subscription costs.
3. **Local Action:** Using MCP, Stan can actually "do" things—read your local files, check your calendar, or search your private databases.
4. **Offline-First:** Once loaded, Stan can function without an active internet connection.

---

## 🚀 Quick Start

1. Visit the **Stan Agent** in a **WebGPU-compatible browser** (Chrome 113+, Edge).
2. Wait for the initial model download (cached for future use).
3. **Connect your tools:** Go to Settings ⚙️ and add your local MCP server URLs (e.g., `http://localhost:3000/sse`).

## 🧠 Capabilities

**MCP Tool Use**
Stan can dynamically discover and invoke tools provided by any MCP-compliant server. This allows him to interact with your local environment safely.

**Autonomous Reasoning**
Stan runs in an autonomous loop (up to 15 steps), allowing him to think, use tools, search memory, and gather information before completing a task.

**Local Vector Memory (RAG)**
Using an embedded **PGlite** (Postgres WASM) database with vector extensions, Stan stores your notes and documents locally.
- **Document Ingestion:** Drag and drop `.txt` or `.md` files to build a local knowledge base.
- **Semantic Recall:** Stan automatically retrieves relevant context from past conversations and documents.

**High-Performance Local Models**
Choose your engine:
- 🚀 **Gemma 2B** (Balanced, default)
- ⚡ **SmolLM 1.7B** (Fastest)
- 🧠 **Llama 3.2 3B** (Most capable)


Contributions to the protocol specification or reference implementation are welcome. Please open an issue or pull request.

For major changes to the spec, open a protocol-change proposal.

---

📄 License

· Protocol specification (protocol.md): CC BY-SA 4.0
· Reference implementation (swap-agent.html and related code): MIT

---

🌐 Links

· GitHub Repository: https://github.com/standardwebagent/Protocol
· Live Demo (Open Source): URL after Vercel deployment
· Protocol Specification: protocol.md
