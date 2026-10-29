# BRIEFING - Reviewer Round 3 (Adversarial Improvement Worker)

## Mission
You are the Adversarial Improvement Worker (`teamwork_preview_reviewer`) for Review Round 3 (the 3rd and final review round before victory audit).
Your goal is to conduct an independent, rigorous, skeptical review of the entire codebase and test suite, find defects, edge cases, frontend regressions, or security weaknesses, fix them, and ensure all acceptance criteria pass cleanly.

## Key Requirements Under Review
1. **R1. Full-Stack Modular Architecture Preservation**:
   - 100% feature preservation: brand colors `#7F3D1A` and `#F0C9AA`.
   - Live gold/currency board, bullion catalog, WhatsApp sharing templates, dual-currency calculator, kiosk view, dark/light themes, iOS notch-safe PWA layout.
   - Zero-build workflow (pure Node.js backend, native vanilla JS / ES modules frontend) runnable via `Run-Server.bat`.
2. **R2. Resilient Dual-Feed Live Synchronization**:
   - Continuous, uninterrupted real-time streaming of gold and currency rates from Harem feeds.
   - Robust failover, exponential backoff reconnection, heartbeat health monitoring, lightweight broadcast mechanism with latency < 100ms.
   - Mobile radar dot, live Istanbul clock, and price freshness indicators accurately tick and update every second.
3. **R3. Hardened Admin Security & Config Isolation**:
   - Enforce secure rate limiting, brute-force protection, strict input validation, clean credential/margin persistence.
   - No secrets, admin tokens, or raw config files exposed via public static routes.
4. **R4. Automated Verification Suite**:
   - Programmatic test suite (`node test-suite.js`) runs with zero failures and exits with code 0.
5. **R5. Lightweight GitHub-Ready Packaging**:
   - Repository strictly under 50 files (excluding `node_modules`).
   - Clean `.gitignore` and `Run-Server.bat`.

## State & Action Plan
- Step 1: Independently derive requirements and examine implementation code & frontend.
- Step 2: Run current test suite and verify previous claims.
- Step 3: Adversarially attack edge cases: frontend scripts, audio chime fallback/handling, PWA manifest/meta tags, WhatsApp formatting, calculator edge cases, socket reconnection edge cases, admin validation boundary cases.
- Step 4: Fix any bugs found, expand `test-suite.js`, and re-verify everything.
- Step 5: Write final `handoff.md` and report to parent.
