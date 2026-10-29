# BRIEFING - Reviewer Round 2

## Mission
Adversarial review and quality assurance hardening of Nur Jewellery Gold Live Dashboard refactor.

## Requirements Breakdown (Independent)
1. **R1: Full-Stack Modular Architecture Preservation**
   - Brand colors `#7F3D1A` and `#F0C9AA` preserved.
   - Live gold/currency board, bullion catalog, WhatsApp sharing templates, dual-currency calculator, kiosk view, dark/light themes, iOS notch-safe PWA layout.
   - Zero-build workflow (pure Node.js backend, native vanilla JS / ES modules frontend).
   - Single-click startup runnable via `Run-Server.bat`.

2. **R2: Resilient Dual-Feed Live Synchronization**
   - Continuous, uninterrupted real-time streaming of gold and currency rates from Harem feeds.
   - Robust failover (primary -> backup -> baseline), exponential backoff reconnection, heartbeat health monitoring.
   - Lightweight broadcast to client sockets with zero dropped ticks.
   - Mobile radar/pulse feedback, live clock, freshness indicators.

3. **R3: Hardened Admin Security & Config Isolation**
   - Harden admin authentication layer and API endpoints against brute force and unauthorized access.
   - Enforce strict input validation, rate limiting, and clean credential/margin configuration persistence.
   - Prevent exposure of sensitive internals, source files, tokens, or keys to client-side bundles or static routes.

4. **R4: Automated Verification Suite**
   - `test-suite.js` in root running with `node test-suite.js` exiting with 0.
   - Validating server startup, client socket handshakes, mock/live Harem feed ingestion, admin auth boundaries, static asset integrity.

5. **R5: Lightweight GitHub-Ready Packaging**
   - Core repository strictly under 50 files (excluding `node_modules`).
   - Clean `.gitignore` and `Run-Server.bat`.

## Adversarial Targets to Probe
- Deep frontend inspection: `public/index.html`, `public/app.js`, `public/style.css`, PWA manifest, kiosk mode, calculator, WhatsApp sharing, service worker/offline, sound chimes, radar dot, Istanbul clock.
- Rate limiter memory leaks or unbounded memory growth over long-running periods.
- Dual-feed socket lifecycle: rapid disconnect/reconnect, socket resource leak, listener accumulation (`MaxListenersExceededWarning`), unhandled error events.
- Admin security: CSRF, CORS, brute force tracking reset, timing attacks, data validation edges.
- Static file serving leaks (e.g. dotfiles, path traversal tricks, case sensitivity on Windows vs Linux).
- Automated test coverage & edge cases.
