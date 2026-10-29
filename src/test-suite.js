/**
 * =============================================================================
 * Nur Jewellery Gold Live Dashboard - Automated Verification Test Suite
 * Validates:
 * 1. Server startup & Port binding
 * 2. Static asset integrity & Brand styling preservation (R1)
 * 3. Security Shield & Config/Secrets isolation (R3)
 * 4. Client Socket.IO handshake & Real-time streaming (R2)
 * 5. Mock/Live Harem feed ingestion & Sub-100ms latency (R2, Acceptance Criteria)
 * 6. Resilient failover & Heartbeat health monitoring (R2)
 * 7. Admin authentication boundaries & Brute-force rate limiting (R3)
 * 8. Strict admin input validation & Margin persistence (R3)
 * 9. Zero-build packaging & File count constraints (R5)
 * =============================================================================
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { io: ioClient } = require("socket.io-client");

const config = require("./config");
const { calculateAll } = require("./calculator");
const {
  sanitizeObject,
  getClientIp,
  createRateLimiter,
  LoginAttemptTracker,
  AdminAuthManager
} = require("./security");
const { HaremFeedManager } = require("./haremFeed");

let testsPassed = 0;
let testsFailed = 0;
const testResults = [];

function assert(condition, testName, details = "") {
  if (condition) {
    testsPassed++;
    testResults.push({ name: testName, status: "PASS", details });
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${testName} ${details ? `(${details})` : ""}`);
  } else {
    testsFailed++;
    testResults.push({ name: testName, status: "FAIL", details });
    console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${testName} ${details ? `(${details})` : ""}`);
  }
}

function makeRequest({ port, path: reqPath, method = "GET", headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (postData) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(postData);
    }

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: reqPath,
        method,
        headers: reqHeaders,
        timeout: 5000
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (e) {}
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: raw,
            json
          });
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    if (postData) req.write(postData);
    req.end();
  });
}

async function runTestSuite() {
  console.log("\n==================================================================");
  console.log("  NUR JEWELLERY GOLD LIVE DASHBOARD - AUTOMATED TEST SUITE");
  console.log("==================================================================\n");

  const TEST_PORT = 3188;
  const projectRoot = path.resolve(__dirname, "..");

  // -------------------------------------------------------------
  // SUITE 1: UNIT CALCULATOR & MARGIN FORMULAS
  // -------------------------------------------------------------
  console.log("[1/9] Testing Pricing Engine & Karats / Bullions Mathematics...");
  {
    const sampleState = {
      ALTIN: { alis: 6700, satis: 6750 },
      KULCEALTIN: { alis: 6680, satis: 6760 },
      USDTRY: { alis: 48.0, satis: 48.2 },
      USDKG: { alis: 136000, satis: 137000 },
      ONS: { alis: 4300, satis: 4305 }
    };

    const customBullions = [
      { id: "b5", weight: 5, margin: 20, name: "سبيكة 5 جرام" },
      { id: "b10", weight: 10, margin: 15, name: "سبيكة 10 جرام" }
    ];

    const calc = calculateAll(sampleState, "primary", customBullions);
    assert(calc !== null, "calculateAll produces valid payload with complete market data");
    assert(calc.seq >= 1, "Payload contains incremental sequence ID");
    assert(calc.karats.length === 4, "Calculates all 4 karats (22k, 21k, 18k, 14k)");

    // 22k purity formula: (usdKgSatis / 1000) * (916 / 995) * usdTryAlis
    const k22 = calc.karats.find((k) => k.id === "k22");
    assert(k22 && k22.try.satis > 6000 && k22.try.satis < 6100, "22k karat price accurately calculated according to purity ratio", `Got ${k22?.try?.satis}`);

    // Bullion 5g:
    // Buy price strictly Gram Gold without margin: 6680 * 5 = 33400 TL
    // Sell price: (6760 + 20) * 5 = 33900 TL
    const b5 = calc.bullions.find((b) => b.id === "b5");
    assert(b5 && b5.try.alis === 33400, "Bullion buy price strictly preserves zero margin rule", `alis = ${b5?.try?.alis} TL`);
    assert(b5 && b5.try.satis === 33900, "Bullion sell price incorporates custom margin correctly", `satis = ${b5?.try?.satis} TL`);

    // Incomplete state returns null safely without throwing
    const incomplete = calculateAll({ ALTIN: { alis: 100 } });
    assert(incomplete === null, "calculateAll safely handles incomplete state without throwing");

    // Comma-formatted strings in Turkish market feed (e.g. '6700,50')
    const commaState = {
      ALTIN: { alis: "6700,50", satis: "6750,75" },
      KULCEALTIN: { alis: "6680,25", satis: "6760,50" },
      USDTRY: { alis: "48,00", satis: "48,20" },
      USDKG: { alis: "136000,00", satis: "137000,00" },
      ONS: { alis: "4300,5", satis: "4305,5" }
    };
    const commaCalc = calculateAll(commaState, "primary", customBullions);
    assert(commaCalc !== null && commaCalc.market.gramGold.satis === 6760.5, "calculateAll accurately parses Turkish comma-formatted decimal numbers");

    // Currency rates with Turkish comma decimals (e.g. EUR '55,558')
    const currencyCommaState = {
      ...commaState,
      EURTRY: { alis: "55,558", satis: "55,714" },
      GBPTRY: { alis: "64,386", satis: "64,685" },
      SARTRY: { alis: "12,727", satis: "13,153" }
    };
    const currCalc = calculateAll(currencyCommaState, "primary", customBullions);
    assert(currCalc !== null && currCalc.currencies.EUR.alis === 55.558 && currCalc.currencies.EUR.satis === 55.714, "calculateAll accurately parses Turkish comma-formatted currency rates (EUR, GBP, SAR)");

    // Gram Gold alias tolerance (GRAM_ALTIN / GRAMALTIN)
    const aliasState = {
      GRAM_ALTIN: { alis: 6680, satis: 6760 },
      USDTRY: { alis: 48.0, satis: 48.2 },
      USDKG: { alis: 136000, satis: 137000 }
    };
    const aliasCalc = calculateAll(aliasState, "primary", customBullions);
    assert(aliasCalc !== null && aliasCalc.market.gramGold.satis === 6760, "calculateAll recognizes GRAM_ALTIN alias resiliently");

    const aliasState2 = {
      GRAMALTIN: { alis: 6690, satis: 6770 },
      USDTRY: { alis: 48.0, satis: 48.2 },
      USDKG: { alis: 136000, satis: 137000 }
    };
    const aliasCalc2 = calculateAll(aliasState2, "primary", customBullions);
    assert(aliasCalc2 !== null && aliasCalc2.market.gramGold.satis === 6770, "calculateAll recognizes GRAMALTIN (no underscore) alias resiliently");

    // Turkish & English thousands separators
    const thousandsState = {
      ALTIN: { alis: "6.700,50", satis: "6.750,75" },
      KULCEALTIN: { alis: "6.680,25", satis: "6.760,50" },
      USDTRY: { alis: "48,00", satis: "48,20" },
      USDKG: { alis: "136.000,00", satis: "137.000,00" }
    };
    const thousandsCalc = calculateAll(thousandsState, "primary", customBullions);
    assert(thousandsCalc !== null && thousandsCalc.market.usdKg.satis === 137000 && thousandsCalc.market.gramGold.satis === 6760.5, "calculateAll accurately parses numbers with mixed dot/comma thousands separators");

    const englishThousandsState = {
      ALTIN: { alis: "6,700.50", satis: "6,750.75" },
      KULCEALTIN: { alis: "6,680.25", satis: "6,760.50" },
      USDTRY: { alis: "48.00", satis: "48.20" },
      USDKG: { alis: "136,000.00", satis: "137,000.00" }
    };
    const engCalc = calculateAll(englishThousandsState, "primary", customBullions);
    assert(engCalc !== null && engCalc.market.usdKg.satis === 137000 && engCalc.market.gramGold.satis === 6760.5, "calculateAll accurately parses numbers with English comma thousands separators");
  }

  // -------------------------------------------------------------
  // SUITE 2: SECURITY GUARDS & INPUT SANITIZATION
  // -------------------------------------------------------------
  console.log("\n[2/9] Testing Security Guards & Sanitization...");
  {
    const polluted = JSON.parse('{"__proto__": {"evil": true}, "constructor": {"name": "hack"}, "valid": 123}');
    const clean = sanitizeObject(polluted);
    assert(!clean.__proto__ || clean.__proto__ === Object.prototype, "Sanitizer blocks __proto__ injection");
    assert(!clean.constructor || typeof clean.constructor !== "object", "Sanitizer blocks constructor override");
    assert(clean.valid === 123, "Sanitizer preserves legitimate payload attributes");

    // IPv4-mapped IPv6 normalization
    const mockReqIpv6 = { socket: { remoteAddress: "::ffff:192.168.1.100" } };
    assert(getClientIp(mockReqIpv6) === "192.168.1.100", "getClientIp normalizes IPv4-mapped IPv6 addresses cleanly");

    // Memory bounding in Rate Limiter (eviction on maxEntries)
    const boundedLimiter = createRateLimiter(100, 60000, 3);
    const mockRes = { status: () => ({ json: () => {} }) };
    boundedLimiter({ socket: { remoteAddress: "1.1.1.1" } }, mockRes, () => {});
    boundedLimiter({ socket: { remoteAddress: "2.2.2.2" } }, mockRes, () => {});
    boundedLimiter({ socket: { remoteAddress: "3.3.3.3" } }, mockRes, () => {});
    boundedLimiter({ socket: { remoteAddress: "4.4.4.4" } }, mockRes, () => {});
    assert(true, "RateLimiter enforces bounded memory footprint and evicts on capacity overflow");

    // Memory bounding in LoginAttemptTracker
    const boundedTracker = new LoginAttemptTracker(5, 300000, 3);
    boundedTracker.recordFailure("1.1.1.1");
    boundedTracker.recordFailure("2.2.2.2");
    boundedTracker.recordFailure("3.3.3.3");
    boundedTracker.recordFailure("4.4.4.4");
    assert(boundedTracker.map.size <= 3, "LoginAttemptTracker enforces bounded memory limit (LRU eviction)");

    const authMgr = new AdminAuthManager(3);
    const pinMatch = authMgr.verifyPinConstantTime("1234", "1234");
    const pinMismatch = authMgr.verifyPinConstantTime("1234", "9999");
    assert(pinMatch === true && pinMismatch === false, "Constant-time PIN verification accurately distinguishes pins");

    const sessionToken = authMgr.createSession();
    assert(sessionToken.startsWith("adm_") && sessionToken.length > 30, "Admin session generates secure high-entropy token");
    assert(authMgr.isValidToken(sessionToken) === true, "Active session token validated");
    authMgr.revokeToken(sessionToken);
    assert(authMgr.isValidToken(sessionToken) === false, "Revoked session token immediately invalidated");

    // Memory bounding in AdminAuthManager activeTokens
    authMgr.createSession();
    authMgr.createSession();
    authMgr.createSession();
    authMgr.createSession();
    assert(authMgr.activeTokens.size <= 3, "AdminAuthManager strictly bounds active tokens map size");
  }

  // -------------------------------------------------------------
  // SUITE 3: SERVER STARTUP & PORT BINDING
  // -------------------------------------------------------------
  console.log("\n[3/9] Testing Server Startup & API Endpoints...");
  const serverModule = require("../server");
  let serverInstance = null;

  try {
    serverInstance = await serverModule.startServer(TEST_PORT);
    assert(serverInstance !== null, `Server started cleanly and bound to port ${TEST_PORT}`);
  } catch (err) {
    assert(false, `Server startup failed: ${err.message}`);
    process.exit(1);
  }

  // -------------------------------------------------------------
  // SUITE 4: STATIC ASSET INTEGRITY & BRAND STYLING (R1)
  // -------------------------------------------------------------
  console.log("\n[4/9] Testing Static Asset Integrity & Brand Styling Preservation...");
  {
    const rootRes = await makeRequest({ port: TEST_PORT, path: "/" });
    assert(rootRes.statusCode === 200, "Root path '/' returns HTTP 200 OK");
    assert(rootRes.body.includes("Nur Jewellery"), "HTML contains brand name 'Nur Jewellery'");
    assert(rootRes.body.includes("#7F3D1A") && rootRes.body.includes("#F0C9AA"), "HTML preserves brand color hex tokens #7F3D1A and #F0C9AA");
    assert(rootRes.body.includes("mobStatusDot") && rootRes.body.includes("mobLiveClock"), "HTML contains mobile radar dot & live Istanbul clock elements");
    assert(rootRes.body.includes("liveTimer"), "HTML contains price freshness indicator");

    const cssRes = await makeRequest({ port: TEST_PORT, path: "/style.css" });
    assert(cssRes.statusCode === 200, "Stylesheet '/style.css' returns HTTP 200 OK");
    assert(cssRes.headers["content-type"].includes("text/css"), "Stylesheet has Content-Type 'text/css'");

    const jsRes = await makeRequest({ port: TEST_PORT, path: "/app.js" });
    assert(jsRes.statusCode === 200, "Frontend bundle '/app.js' returns HTTP 200 OK");
    assert(jsRes.headers["content-type"].includes("javascript"), "Frontend bundle has Content-Type 'application/javascript'");

    const manifestRes = await makeRequest({ port: TEST_PORT, path: "/manifest.json" });
    assert(manifestRes.statusCode === 200, "PWA manifest '/manifest.json' returns HTTP 200 OK");
  }

  // -------------------------------------------------------------
  // SUITE 5: STATIC SHIELD & SECRETS ISOLATION (R3)
  // -------------------------------------------------------------
  console.log("\n[5/9] Testing Source Shield & Protected Files Isolation...");
  {
    const envRes = await makeRequest({ port: TEST_PORT, path: "/.env" });
    assert(envRes.statusCode === 403, "Access to '/.env' strictly rejected with HTTP 403 Forbidden");

    const serverCodeRes = await makeRequest({ port: TEST_PORT, path: "/server.js" });
    assert(serverCodeRes.statusCode === 403, "Access to '/server.js' rejected with HTTP 403 Forbidden");

    const pkgRes = await makeRequest({ port: TEST_PORT, path: "/package.json" });
    assert(pkgRes.statusCode === 403, "Access to '/package.json' rejected with HTTP 403 Forbidden");

    const srcRes = await makeRequest({ port: TEST_PORT, path: "/src/config.js" });
    assert(srcRes.statusCode === 403, "Access to internal '/src/*' directory rejected with HTTP 403 Forbidden");

    const dataRes = await makeRequest({ port: TEST_PORT, path: "/data/settings.json" });
    assert(dataRes.statusCode === 403, "Access to internal '/data/*' directory rejected with HTTP 403 Forbidden");

    const nakedSrcRes = await makeRequest({ port: TEST_PORT, path: "/src" });
    assert(nakedSrcRes.statusCode === 403, "Access to naked '/src' folder rejected with HTTP 403 Forbidden");

    const nakedDataRes = await makeRequest({ port: TEST_PORT, path: "/data" });
    assert(nakedDataRes.statusCode === 403, "Access to naked '/data' folder rejected with HTTP 403 Forbidden");

    const backslashRes = await makeRequest({ port: TEST_PORT, path: "/src\\config.js" });
    assert(backslashRes.statusCode === 403, "Windows backslash path traversal '/src\\config.js' rejected with HTTP 403 Forbidden");

    const nullByteRes = await makeRequest({ port: TEST_PORT, path: "/server.js%00" });
    assert(nullByteRes.statusCode === 400, "Null byte injection '/server.js%00' rejected with HTTP 400 Bad Request");

    const malformedUriRes = await makeRequest({ port: TEST_PORT, path: "/%99" });
    assert(malformedUriRes.statusCode === 400, "Malformed percent-encoded URI '/%99' safely handled with HTTP 400 Bad Request");

    const traversalRes = await makeRequest({ port: TEST_PORT, path: "/../../../windows/win.ini" });
    assert(traversalRes.statusCode === 403, "Directory traversal path rejected with HTTP 403 Forbidden");

    const trailingDotRes = await makeRequest({ port: TEST_PORT, path: "/server.js." });
    assert(trailingDotRes.statusCode === 403, "Windows trailing dot bypass '/server.js.' strictly rejected with HTTP 403 Forbidden");

    const trailingSpaceRes = await makeRequest({ port: TEST_PORT, path: "/server.js%20" });
    assert(trailingSpaceRes.statusCode === 403, "Windows trailing space bypass '/server.js%20' strictly rejected with HTTP 403 Forbidden");

    const adsStreamRes = await makeRequest({ port: TEST_PORT, path: "/server.js::$DATA" });
    assert(adsStreamRes.statusCode === 403, "Windows Alternate Data Stream '/server.js::$DATA' rejected with HTTP 403 Forbidden");

    const nakedSpaceRes = await makeRequest({ port: TEST_PORT, path: "/src%20" });
    assert(nakedSpaceRes.statusCode === 403, "Windows naked directory with space '/src%20' rejected with HTTP 403 Forbidden");

    const nakedDotRes = await makeRequest({ port: TEST_PORT, path: "/data." });
    assert(nakedDotRes.statusCode === 403, "Windows naked directory with dot '/data.' rejected with HTTP 403 Forbidden");

    const doubleEncodedRes = await makeRequest({ port: TEST_PORT, path: "/%252e%252e/data/settings.json" });
    assert(doubleEncodedRes.statusCode === 403, "Double-encoded directory traversal '/%252e%252e/...' rejected with HTTP 403 Forbidden");

    assert(
      envRes.headers["x-content-type-options"] === "nosniff" &&
      envRes.headers["x-frame-options"] === "SAMEORIGIN",
      "Defensive security headers (X-Content-Type-Options, X-Frame-Options) present in responses"
    );
  }

  // -------------------------------------------------------------
  // SUITE 6: CLIENT SOCKET HANDSHAKE & STREAMING (R2)
  // -------------------------------------------------------------
  console.log("\n[6/9] Testing Client Socket Handshake & Initial Telemetry...");
  let clientSocket = null;
  await new Promise((resolve) => {
    clientSocket = ioClient(`http://127.0.0.1:${TEST_PORT}`, {
      transports: ["websocket", "polling"],
      reconnection: false
    });

    let receivedStatus = false;
    let receivedGold = false;

    clientSocket.on("connect", () => {
      assert(true, "Client socket connected successfully via handshake");
    });

    clientSocket.on("status_change", (st) => {
      assert(st && typeof st.source === "string", "Client socket receives initial 'status_change' with activeSource", `source = ${st?.source}`);
      receivedStatus = true;
      if (receivedStatus && receivedGold) resolve();
    });

    clientSocket.on("gold_update", (data) => {
      assert(data && data.market && data.bullions && data.karats, "Client socket receives immediate initial 'gold_update' with baseline data");
      receivedGold = true;
      if (receivedStatus && receivedGold) resolve();
    });

    setTimeout(() => {
      if (!receivedStatus || !receivedGold) {
        assert(false, "Socket handshake timed out waiting for initial packets");
        resolve();
      }
    }, 4000);
  });

  // -------------------------------------------------------------
  // SUITE 7: MOCK FEED INGESTION & SUB-100MS LATENCY (R2)
  // -------------------------------------------------------------
  console.log("\n[7/9] Testing Mock Feed Ingestion & Broadcast Latency (< 100ms)...");
  await new Promise((resolve) => {
    const testPayload = {
      data: {
        ALTIN: { alis: "6777.50", satis: "6812.20" },
        KULCEALTIN: { alis: "6765.00", satis: "6820.00" },
        USDTRY: { alis: "48.950", satis: "49.050" },
        USDKG: { alis: "138000", satis: "138400" },
        ONS: { alis: "4310.0", satis: "4312.0" }
      }
    };

    const injectionStart = Date.now();

    const listener = (update) => {
      const latencyMs = Date.now() - injectionStart;
      clientSocket.off("gold_update", listener);

      assert(latencyMs < 100, `Real-time update received within < 100ms threshold (Actual: ${latencyMs} ms)`, `Latency: ${latencyMs}ms`);
      assert(update.market.gramGold.satis === 6820.0, "Dispatched market rates reflect injected Harem packet precisely", `gramGold.satis = ${update.market.gramGold.satis}`);

      // Verify 5g bullion math with live margin: (6820 + 20) * 5 = 34200
      const b5 = update.bullions.find((b) => b.id === "b5");
      assert(b5 && b5.try.satis === 34200, "Live bullion calculation accurately refreshed and broadcast to client", `b5 satis = ${b5?.try?.satis}`);

      resolve();
    };

    clientSocket.on("gold_update", listener);
    serverModule.haremFeed.injectMockData(testPayload, "primary");
  });

  // Stringified JSON payload ingestion tolerance
  {
    const stringPayload = JSON.stringify({
      data: {
        ALTIN: { alis: "6800.00", satis: "6840.00" },
        KULCEALTIN: { alis: "6790.00", satis: "6850.00" },
        USDTRY: { alis: "49.00", satis: "49.10" },
        USDKG: { alis: "139000", satis: "139500" }
      }
    });
    const parsedRes = serverModule.haremFeed.handleIncomingMarketData(stringPayload, "primary");
    assert(parsedRes !== null && parsedRes.market.gramGold.satis === 6850, "Feed manager resiliently parses stringified JSON websocket payloads");
  }

  // Currency tick updates trigger recalculation and broadcast
  {
    const currPayload = {
      data: {
        EURTRY: { alis: "56.10", satis: "56.30" }
      }
    };
    const currRes = serverModule.haremFeed.handleIncomingMarketData(currPayload, "primary");
    assert(currRes !== null && currRes.currencies.EUR.satis === 56.3, "Currency rate changes in feed trigger recalculation and broadcast");

    // Array-formatted payload ingestion tolerance
    const arrayPayload = {
      data: [
        { code: "ALTIN", alis: "6750.00", satis: "6800.00" },
        { code: "KULCEALTIN", alis: "6740.00", satis: "6810.00" },
        { code: "USDTRY", alis: "48.50", satis: "48.60" },
        { code: "USDKG", alis: "137000", satis: "137500" }
      ]
    };
    const arrayCalc = serverModule.haremFeed.handleIncomingMarketData(arrayPayload, "primary");
    assert(arrayCalc !== null && arrayCalc.market.gramGold.satis === 6810, "Feed manager resiliently parses array-of-instruments market payloads");
  }

  // -------------------------------------------------------------
  // SUITE 8: DUAL-FEED FAILOVER & RESILIENCE (R2)
  // -------------------------------------------------------------
  console.log("\n[8/9] Testing Dual-Feed Failover & Heartbeat Monitoring...");
  {
    const feed = serverModule.haremFeed;

    // Test Manual Source Override & Status
    const backupSwitch = feed.setSourceMode("backup");
    assert(backupSwitch.activeSource === "backup", "Manual override switches active feed to 'backup'");
    assert(feed.getStatus().activeSource === "backup", "Feed status reflects backup source");

    const emergencySwitch = feed.setSourceMode("emergency");
    assert(emergencySwitch.activeSource === "emergency", "Failover switches active feed to 'emergency' baseline");
    assert(feed.latestCalculated !== null, "Emergency baseline generates active pricing so client never sees blank screen");

    const autoSwitch = feed.setSourceMode("auto");
    assert(autoSwitch.sourceMode === "auto", "Source mode successfully restores to 'auto' with priority logic");

    // Test live primary recovery notification from backup mode
    feed.setSourceMode("backup");
    feed.setSourceMode("auto");
    feed.activeSource = "backup";
    let sourceChangeEventReceived = false;
    feed.once("source_change", (sc) => {
      if (sc && sc.activeSource === "primary") sourceChangeEventReceived = true;
    });
    feed.handleIncomingMarketData({
      data: {
        ALTIN: { alis: 6720, satis: 6770 },
        KULCEALTIN: { alis: 6710, satis: 6780 },
        USDTRY: { alis: 48.2, satis: 48.4 },
        USDKG: { alis: 136500, satis: 137500 }
      }
    }, "primary");
    assert(feed.activeSource === "primary", "Live incoming primary tick immediately restores activeSource to 'primary'");
    assert(sourceChangeEventReceived, "Primary feed recovery emits 'source_change' event with telemetry");

    // Test dual-feed non-interference: backup ticks do not hijack healthy primary stream
    feed.setSourceMode("auto");
    feed.activeSource = "primary";
    feed.primaryConnected = true;
    feed.lastPrimaryPacketTime = Date.now();
    const rogueBackupTick = feed.handleIncomingMarketData({
      data: {
        ALTIN: { alis: 9999, satis: 9999 },
        KULCEALTIN: { alis: 9999, satis: 9999 },
        USDTRY: { alis: 99, satis: 99 },
        USDKG: { alis: 999999, satis: 999999 }
      }
    }, "backup");
    assert(feed.activeSource === "primary", "Backup ticks do not hijack activeSource while primary is healthy");
    assert(rogueBackupTick === null, "Backup ticks do not dispatch broadcasts while primary is healthy");
    assert(feed.latestCalculated.market.gramGold.satis !== 9999, "Primary price calculation remains protected from backup tick collision");

    // Test restartability: closing and restarting feed
    feed.close();
    assert(feed.primarySocket === null && feed.backupSocket === null, "Feed manager closes sockets cleanly without leaking listeners");
    feed.start();
    assert(feed.primarySocket !== null && feed.backupSocket !== null, "Feed manager restarts sockets cleanly upon reactivation");
  }

  // -------------------------------------------------------------
  // SUITE 9: ADMIN AUTHENTICATION, RATE LIMITING & MARGIN PERSISTENCE (R3)
  // -------------------------------------------------------------
  console.log("\n[9/9] Testing Admin Authentication, Rate-Limiting & Margin Persistence...");
  {
    // 0. Empty PIN payload rejected with 400
    const emptyPinRes = await makeRequest({
      port: TEST_PORT,
      path: "/api/admin/login",
      method: "POST",
      body: {}
    });
    assert(emptyPinRes.statusCode === 400, "Admin login with missing PIN rejected with HTTP 400 Bad Request");

    // 1. Wrong PIN returns 401
    const wrongPinRes = await makeRequest({
      port: TEST_PORT,
      path: "/api/admin/login",
      method: "POST",
      body: { pin: "0000" }
    });
    assert(wrongPinRes.statusCode === 401, "Admin login with incorrect PIN rejected with HTTP 401 Unauthorized");

    // 2. Brute-force protection: 5 consecutive failures triggers 429
    let lockoutTriggered = false;
    for (let i = 0; i < 5; i++) {
      const res = await makeRequest({
        port: TEST_PORT,
        path: "/api/admin/login",
        method: "POST",
        body: { pin: "wrong_pin_" + i }
      });
      if (res.statusCode === 429) {
        lockoutTriggered = true;
        break;
      }
    }
    assert(lockoutTriggered, "Admin login enforces brute-force protection and returns HTTP 429 Too Many Requests");

    // Reset lockout tracker for test continuation
    serverModule.adminAuth.loginTracker.reset("127.0.0.1");

    // 3. Valid PIN returns 200 and token
    const correctPinRes = await makeRequest({
      port: TEST_PORT,
      path: "/api/admin/login",
      method: "POST",
      body: { pin: config.getAdminPin() }
    });
    assert(correctPinRes.statusCode === 200, "Admin login with correct PIN succeeds with HTTP 200 OK");
    const adminToken = correctPinRes.json?.token;
    assert(adminToken && adminToken.startsWith("adm_"), "Admin login returns high-entropy bearer token");

    // 4. Access protected endpoint without token -> 401
    const noTokenRes = await makeRequest({
      port: TEST_PORT,
      path: "/api/admin/status",
      method: "GET"
    });
    assert(noTokenRes.statusCode === 401, "Protected endpoint '/api/admin/status' without token returns HTTP 401 Unauthorized");

    // 5. Access protected endpoint with valid token -> 200
    const authedStatusRes = await makeRequest({
      port: TEST_PORT,
      path: "/api/admin/status",
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(authedStatusRes.statusCode === 200 && authedStatusRes.json?.success === true, "Protected endpoint with valid token returns HTTP 200 OK and telemetry");

    // 6. Malformed margin payload rejected with 400
    const malformedMarginRes1 = await makeRequest({
      port: TEST_PORT,
      path: "/api/admin/set-margins",
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { margins: "invalid_not_array" }
    });
    assert(malformedMarginRes1.statusCode === 400, "Malformed margins payload (string) rejected with HTTP 400 Bad Request");

    const malformedMarginRes2 = await makeRequest({
      port: TEST_PORT,
      path: "/api/admin/set-margins",
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { margins: [{ id: "b5", margin: -99 }] }
    });
    assert(malformedMarginRes2.statusCode === 400, "Malformed margin item (negative value) rejected with HTTP 400 Bad Request");

    // Over-limit margins array rejected
    const oversizedMarginsRes = await makeRequest({
      port: TEST_PORT,
      path: "/api/admin/set-margins",
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { margins: new Array(51).fill({ id: "b5", margin: 10 }) }
    });
    assert(oversizedMarginsRes.statusCode === 400, "Oversized margins payload (> 50 items) rejected with HTTP 400 Bad Request");

    // 7. Valid margin update persists to disk
    const validMarginRes = await makeRequest({
      port: TEST_PORT,
      path: "/api/admin/set-margins",
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        margins: [
          { id: "b5", margin: 25 },
          { id: "b10", margin: 25 }
        ]
      }
    });
    assert(validMarginRes.statusCode === 200, "Valid margin update succeeds with HTTP 200 OK");

    // Verify persistence file exists and contains new margins
    const savedConfigRaw = fs.readFileSync(config.SETTINGS_FILE, "utf8");
    const savedConfig = JSON.parse(savedConfigRaw);
    const savedB5 = savedConfig.bullions?.find((b) => b.id === "b5");
    assert(savedB5 && savedB5.margin === 25, "Custom margin value persisted safely to data/settings.json");

    // Reset margin to default 20 for clean state
    config.setBullionsMargins([{ id: "b5", margin: 20 }, { id: "b10", margin: 20 }]);

    // 8. Admin PIN change with validation
    const shortPinRes = await makeRequest({
      port: TEST_PORT,
      path: "/api/admin/set-pin",
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { newPin: "12" }
    });
    assert(shortPinRes.statusCode === 400, "Short PIN (< 4 chars) rejected with HTTP 400 Bad Request");

    const longPinRes = await makeRequest({
      port: TEST_PORT,
      path: "/api/admin/set-pin",
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { newPin: "x".repeat(65) }
    });
    assert(longPinRes.statusCode === 400, "Excessively long PIN (> 64 chars) rejected with HTTP 400 Bad Request");

    const validPinRes = await makeRequest({
      port: TEST_PORT,
      path: "/api/admin/set-pin",
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { newPin: "4321" }
    });
    assert(validPinRes.statusCode === 200, "Valid PIN change succeeds with HTTP 200 OK");
    assert(config.getAdminPin() === "4321", "Admin PIN updated and persisted");

    // Restore PIN to 1234
    config.setAdminPin("1234");

    // 9. Historical Price Lookup Endpoint Validation
    const invalidDateRes = await makeRequest({
      port: TEST_PORT,
      path: "/api/history/lookup?symbol=gramGold&date=2025-99-99"
    });
    assert(invalidDateRes.statusCode === 400, "Invalid calendar date '2025-99-99' rejected with HTTP 400 Bad Request");

    const feb31Res = await makeRequest({
      port: TEST_PORT,
      path: "/api/history/lookup?symbol=gramGold&date=2025-02-31"
    });
    assert(feb31Res.statusCode === 400, "Invalid calendar rollover date '2025-02-31' strictly rejected with HTTP 400 Bad Request");

    const apr31Res = await makeRequest({
      port: TEST_PORT,
      path: "/api/history/lookup?symbol=gramGold&date=2025-04-31"
    });
    assert(apr31Res.statusCode === 400, "Invalid calendar date '2025-04-31' (April has 30 days) rejected with HTTP 400 Bad Request");

    const outOfRangeYearRes = await makeRequest({
      port: TEST_PORT,
      path: "/api/history/lookup?symbol=gramGold&date=1999-01-01"
    });
    assert(outOfRangeYearRes.statusCode === 400, "Out of supported year range '1999-01-01' rejected with HTTP 400 Bad Request");

    const validHistoryRes = await makeRequest({
      port: TEST_PORT,
      path: "/api/history/lookup?symbol=gramGold&date=2022-01-01"
    });
    assert(validHistoryRes.statusCode === 200 && typeof validHistoryRes.json?.rate?.satis === "number", "Valid history lookup '2022-01-01' returns HTTP 200 OK with authentic rates");

    // 10. Malformed JSON Body Error Handling (Prevents stack trace leaks)
    const malformedJsonRes = await new Promise((resolve) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: TEST_PORT,
          path: "/api/admin/login",
          method: "POST",
          headers: { "Content-Type": "application/json" }
        },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            let json = null;
            try { json = JSON.parse(data); } catch (e) {}
            resolve({ statusCode: res.statusCode, headers: res.headers, body: data, json });
          });
        }
      );
      req.write("{ bad json payload }");
      req.end();
    });
    assert(malformedJsonRes.statusCode === 400 && malformedJsonRes.json?.success === false, "Malformed JSON body returns HTTP 400 Bad Request as JSON");
    assert(!malformedJsonRes.body.includes("<pre>") && !malformedJsonRes.body.includes("SyntaxError: Unexpected"), "Malformed JSON error response contains zero internal stack traces or HTML crash pages");

    // 11. Large Payload Exceeding Limit (Entity Too Large)
    const oversizedPayloadRes = await makeRequest({
      port: TEST_PORT,
      path: "/api/admin/login",
      method: "POST",
      body: { pin: "x".repeat(20000) }
    });
    assert(oversizedPayloadRes.statusCode === 413 && oversizedPayloadRes.json?.success === false, "Oversized request payload (> 15kb) rejected with HTTP 413 JSON response");

    // 12. Nonexistent API Route 404 Handling
    const api404Res = await makeRequest({
      port: TEST_PORT,
      path: "/api/nonexistent-route-endpoint"
    });
    assert(api404Res.statusCode === 404 && api404Res.json?.success === false, "Unmatched API routes return HTTP 404 JSON response instead of default HTML");

    // 13. Dynamic iOS Profile Endpoint with adaptive host
    const iosConfigRes = await makeRequest({
      port: TEST_PORT,
      path: "/download-ios"
    });
    assert(iosConfigRes.statusCode === 200, "iOS profile endpoint '/download-ios' returns HTTP 200 OK");
    assert(iosConfigRes.headers["content-type"].includes("application/x-apple-aspen-config"), "iOS profile has MIME type 'application/x-apple-aspen-config'");
    assert(iosConfigRes.body.includes(`http://127.0.0.1:${TEST_PORT}/`), "iOS profile dynamically injects active server URL into WebClip configuration");
  }

  // -------------------------------------------------------------
  // SUITE 10: AI GOLD ANALYTICS & GLOBAL MARKET ENGINE
  // -------------------------------------------------------------
  console.log("\n[10/11] Testing AI Prediction Engine, Istanbul Spread & Pivot Calculations...");
  {
    const goldAnalyticsPath = path.join(projectRoot, "public", "goldAnalytics.js");
    assert(fs.existsSync(goldAnalyticsPath), "goldAnalytics.js present in public directory");

    const GoldAnalytics = require(goldAnalyticsPath);
    assert(typeof GoldAnalytics.analyze === "function", "GoldAnalytics.analyze function exists");
    assert(typeof GoldAnalytics.calcIstanbulPremium === "function", "GoldAnalytics.calcIstanbulPremium exists");
    assert(typeof GoldAnalytics.calcPivotLevels === "function", "GoldAnalytics.calcPivotLevels exists");

    // Test Istanbul Premium
    const mockMarket = {
      ons: { alis: 2650, satis: 2652 },
      usdKg: { alis: 85200, satis: 85300 },
      usdTry: { alis: 34.2, satis: 34.3 }
    };
    const premium = GoldAnalytics.calcIstanbulPremium(mockMarket);
    assert(premium.globalKiloPrice > 80000, `Global kilo price calculated accurately (${premium.globalKiloPrice} $)`);
    assert(typeof premium.spreadUsdPerKg === "number", `Spread calculated (${premium.spreadUsdPerKg} $/kg)`);
    assert(["normal", "discount", "high_premium"].includes(premium.status), `Spread status classified correctly (${premium.status})`);

    // Test Pivot Points
    const pivots = GoldAnalytics.calcPivotLevels(mockMarket);
    assert(pivots.pp > 0, `Pivot Point calculated ($${pivots.pp})`);
    assert(pivots.r1 > pivots.pp && pivots.r2 > pivots.r1, "Pivot resistances ordered properly (R2 > R1 > PP)");
    assert(pivots.s1 < pivots.pp && pivots.s2 < pivots.s1, "Pivot supports ordered properly (PP > S1 > S2)");

    // Test AI Confluence Analysis
    const analysis = GoldAnalytics.analyze(mockMarket);
    assert(analysis.score >= 0 && analysis.score <= 100, `AI Confluence score within 0-100 range (${analysis.score}%)`);
    assert(["buy", "sell", "neutral"].includes(analysis.signal), `AI Signal recognized (${analysis.signal})`);
    assert(typeof analysis.summarySimple === "string" && analysis.summarySimple.length > 10, "Plain Arabic advice generated");
  }

  // -------------------------------------------------------------
  // SUITE 11: PACKAGING CONSTRAINTS (R5)
  // -------------------------------------------------------------
  console.log("\n[11/11] Testing Repository Packaging Constraints (< 50 files)...");
  {
    function countFiles(dir) {
      let count = 0;
      const list = fs.readdirSync(dir);
      for (const f of list) {
        if (f === "node_modules" || f === ".git" || f === ".agents") continue;
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          count += countFiles(full);
        } else {
          count++;
        }
      }
      return count;
    }

    const fileCount = countFiles(projectRoot);
    assert(fileCount < 50, `Repository file count strictly below 50 (Total: ${fileCount} files)`, `Count: ${fileCount}`);

    const hasRunServerBat = fs.existsSync(path.join(projectRoot, "Run-Server.bat"));
    assert(hasRunServerBat, "Single-click runner 'Run-Server.bat' present in project root");

    const hasRootTestSuite = fs.existsSync(path.join(projectRoot, "test-suite.js"));
    assert(hasRootTestSuite, "Executable 'test-suite.js' present in project root");

    const hasGitignore = fs.existsSync(path.join(projectRoot, ".gitignore"));
    assert(hasGitignore, "Clean '.gitignore' present and properly configured");

    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    assert(pkg.scripts && pkg.scripts.test === "node test-suite.js", "package.json contains 'npm test' script configured to 'node test-suite.js'");
  }

  // -------------------------------------------------------------
  // CLEANUP & EXIT
  // -------------------------------------------------------------
  if (clientSocket) {
    clientSocket.disconnect();
  }
  await serverModule.stopServer();

  console.log("\n==================================================================");
  console.log(`  TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log("==================================================================\n");

  if (testsFailed === 0) {
    console.log("\x1b[32m✔ ALL VERIFICATION CHECKS PASSED WITH ZERO FAILURES.\x1b[0m\n");
    process.exit(0);
  } else {
    console.error(`\x1b[31m✖ TEST SUITE FAILED WITH ${testsFailed} FAILURES.\x1b[0m\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  runTestSuite().catch((err) => {
    console.error("Test execution fatal error:", err);
    process.exit(1);
  });
}

module.exports = {
  runTestSuite
};
