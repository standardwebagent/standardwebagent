# Stan - User Manual

Welcome to **Stan**, your fully local, browser-based AI agent.

For security features, check the [Privacy Impact Assessment](PRIVACY_IMPACT_ASSESSMENT.md). For advanced config, check the [Admin Guide](ADMIN_GUIDE.md).

## Core Principles

- **100% Local**: No cloud processing. All computations happen on your device.
- **Privacy First**: Stan never sends your local data or queries externally.
- **Seamless Operation**: Adapts to hardware constraints silently, supporting WebGPU for fast acceleration, WebNN for NPU acceleration, or WebAssembly as a reliable fallback.
- **System Requirements**: Your device needs a minimum of 4GB RAM and 4 CPU cores to run Stan effectively.
- **Offline First**: PWA supports fully offline chat experiences, utilizing up to 300MB of static model and asset caching via service workers.

## Getting Started

1. **Launch the App**: Open the app in any modern browser.
2. **Model Loading**: Stan automatically loads its default optimized model on startup. If you wish to use other models, you can add them via a Hugging Face slug (like `onnx-community/Llama-3.2-1B-Instruct-q4f16_1-MLC`) in the Settings menu. The model is stored locally in your browser so you don't need to re-download it.
3. **Chat**: You can start chatting instantly once the engine starts!

## Features

- **Tools**: Stan can compute logic, check memories, browse external websites, and connect to local services using MCP.
- **Upload Files**: You can drag and drop `.md`, `.txt`, and `.json` files perfectly, which Stan will read and index locally.
- **Microphone and Voice Responses**: Enable voice dictation and the voice output using the icons near the input box.
- **Persisted Conversations**: Your chats and database stay in your browser. Use the settings menu to configure this feature or clear cache.
- **Install App**: You can install Stan as a PWA directly. No internet required after the first load!
