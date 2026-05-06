# Stan - Admin Guide

For general usage, see the [User Manual](USER_MANUAL.md).

## Export options for Desktop and Enterprise

If you choose to distribute the software as a desktop app format using the local codebase:

1. Initialize the codebase locally.
2. Install `electron`, `electron-builder`, and configure the `main.js` wrapper to run the application's built bundle.
3. Configure the `electron` bundle to load `index.html` from the React build output in the main window.

## Custom Models

Users can load new arbitrary models if the model follows the standard JSON pipeline config structure expected by Xenova pipelines and MLC engines. Modify the static models list in `src/App.tsx`.

### Engine Details

Stan uses engine detection under `src/engineDetector.ts` to seamlessly identify user capabilities:

- **WebGPU**: Accelerated, ideal for > 2B models.
- **WebNN**: NPU acceleration for hardware natively supporting Neural Processing Units.
- **WASM**: CPU fallback for unsupported environments, utilizing the Transformers.js engine.

## Local Configuration (Electron / Desktop environments)

For deeper sandboxing, you can adjust the service worker configuration or the internal Content Security Policy string using standard PWA distribution techniques. To do so, customize Vite's build settings and include your specific headers.

## Cloud Deployment (Cloudflare Pages)

We have transitioned static hosting from Vercel to **Cloudflare Pages**. 
When deploying, make sure that the build output directory (`dist/`) includes the `public/_headers` file. 
This file provisions the correct `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers necessary for multi-threaded WASM and WebGPU isolation features to function securely in standard browsers.
