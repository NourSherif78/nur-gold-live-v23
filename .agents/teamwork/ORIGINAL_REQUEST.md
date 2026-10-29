# Original User Request

## 2026-10-01T09:16:11Z

This is a single self-contained, resource-conscious refactor; keep it small and focused to conserve tokens.

Comprehensive refactor and optimization of the Nur Jewellery Gold Live Dashboard to achieve enterprise-grade modularity, rock-solid dual-stream price synchronization from Harem, fortified admin security, and zero-build lightweight deployment.

Working directory: C:\Users\Monster\teamwork_projects\gold_live_refactor
Integrity mode: development

## Requirements

### R1. Full-Stack Modular Architecture Preservation
Preserve 100% of existing application features and visual styling (brand colors `#7F3D1A` and `#F0C9AA`, live gold/currency board, bullion catalog, WhatsApp sharing templates, dual-currency calculator, kiosk view, dark/light themes, and iOS notch-safe PWA layout) while cleanly modularizing the codebase. The project must maintain a zero-build workflow (pure Node.js backend, native vanilla JS / ES modules frontend) runnable via `Run-Server.bat` without bundler prerequisites.

### R2. Resilient Dual-Feed Live Synchronization
Ensure continuous, uninterrupted real-time streaming of gold and currency rates from Harem feeds. Implement robust failover, exponential backoff reconnection, heartbeat health monitoring, and a lightweight broadcast mechanism to connected client sockets with zero dropped ticks and immediate mobile radar/pulse feedback.

### R3. Hardened Admin Security & Config Isolation
Harden the admin authentication layer and API endpoints against brute force and unauthorized access. Enforce strict input validation, rate limiting, and clean credential/margin configuration persistence without exposing sensitive internals or keys to client-side bundles.

### R4. Automated Verification Suite
Deliver an automated programmatic test script (`test-suite.js`) capable of validating server startup, client socket handshakes, mock/live Harem feed ingestion, admin authentication boundaries, and static asset integrity.

### R5. Lightweight GitHub-Ready Packaging
Keep the core repository strictly under 50 files (excluding `node_modules`), properly configured with `.gitignore` and single-click startup scripts (`Run-Server.bat`), ready for instant drag-and-drop deployment.

## Acceptance Criteria

### Functional & Stability Verification
- [ ] Automated test suite (`node test-suite.js`) runs to completion with zero test failures and exits with code 0.
- [ ] Server starts cleanly on port 3000 without syntax or runtime warnings and maintains active connections to primary and backup Harem data sources.
- [ ] Real-time price updates dispatch to connected web clients with latency under 100ms from socket receipt.
- [ ] Mobile radar dot, live Istanbul clock, and price freshness indicators accurately tick and update every second.

### Security & Integrity Standards
- [ ] Admin endpoints (`/api/admin/*`) enforce secure rate-limiting and reject invalid credentials or malformed margin payloads with appropriate HTTP status codes.
- [ ] No secrets, admin tokens, or raw config files are exposed via public static routes.

### Packaging & Build Constraints
- [ ] The workspace contains no bundler build step requirements (no Webpack, Vite, or Babel required to run).
- [ ] Total repository file count remains well below 50 files (excluding `node_modules`).
- [ ] Single-click runner `Run-Server.bat` starts the server and opens the browser cleanly.
