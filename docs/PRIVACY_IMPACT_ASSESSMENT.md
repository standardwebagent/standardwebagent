# Privacy Impact Assessment

**Project**: Stan - Local AI Agent

## 1. Data Collection
Stan operates entirely locally through the browser index storage, local PGlite, OPFS, and in-browser inference (via Transformers.js/MLC). 
- **No data telemetry is collected.**
- **No chat data is sent to external APIs.**

## 2. In-Browser Data Persistence
The Application saves information locally in the user's browser, typically using `IndexedDB`, OPFS (Origin Private File System), and the overarching Cache mechanisms.
- IndexedDB is used to persist conversations securely in the browser. It never syncs with a server.
- The user can erase all local data using the clear cache utility inside settings, ensuring maximum digital autonomy.
- External files are securely parsed by DOMPurify (stripping malformed HTML to avoid XSS scenarios) and are only read in active memory and encoded to DB vectors locally.

## 3. Tool Permissions
- The agent interfaces with browser APIs (Clipboard, Geolocations, Push Notifications, Device vibration). These require user permission directly from the Browser prompt the first time they are fired.
- Any requested external requests, like `fetch_web`, act exclusively from the client instance. 

## 4. Risks & Mitigations
- **Risk**: External link interception via markdown rendering.
- **Mitigation**: All links are rendered with `rel="noopener noreferrer"` and `target="_blank"` strictly enforced globally using DOMPurify hooks.

**Conclusion**: Stan provides a zero-risk footprint regarding external data leakage, placing absolute sovereignty with the user.
