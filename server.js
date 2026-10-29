const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const config = require("./src/config");
const { calculateAll } = require("./src/calculator");
const {
  createRateLimiter,
  AdminAuthManager,
  securityHeadersAndShield
} = require("./src/security");
const { HaremFeedManager } = require("./src/haremFeed");
const { createAdminRouter } = require("./src/adminRoutes");
const historyData = require("./historyData");

// =========================================================
// PROCESS & UNHANDLED ERROR GUARDS (Zero Downtime)
// =========================================================
process.on("uncaughtException", (err) => {
  console.error("[CRITICAL] Uncaught Exception:", err.message, err.stack);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[CRITICAL] Unhandled Rejection at:", promise, "reason:", reason);
});

const app = express();
const server = http.createServer(app);
const serverStartTime = Date.now();

// Disable Express fingerprinting
app.disable("x-powered-by");

// Socket.IO Server configuration
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// JSON body parser with strict size limit to prevent payload flooding
app.use(express.json({ limit: "15kb" }));
app.use(cors());

// Defensive security headers & strict sensitive files shield
app.use(securityHeadersAndShield());

// API Rate Limiter
app.use("/api", createRateLimiter(150, 60000));

// Public static assets directory
const publicDir = path.join(__dirname, "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, {
    dotfiles: "ignore",
    index: "index.html",
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  }));
}

// Universal client asset handlers with explicit no-cache
app.get("/style.css", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  const p = path.join(publicDir, "style.css");
  if (fs.existsSync(p)) return res.type("text/css").sendFile(path.resolve(p));
  res.status(404).send("style.css not found");
});

app.get("/app.js", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  const p = path.join(publicDir, "app.js");
  if (fs.existsSync(p)) return res.type("application/javascript").sendFile(path.resolve(p));
  res.status(404).send("app.js not found");
});

app.get("/sw.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Service-Worker-Allowed", "/");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  const p = path.join(publicDir, "sw.js");
  if (fs.existsSync(p)) return res.sendFile(path.resolve(p));
  res.status(404).send("// sw not found");
});

app.get("/manifest.json", (req, res) => {
  res.setHeader("Content-Type", "application/manifest+json");
  const p = path.join(publicDir, "manifest.json");
  if (fs.existsSync(p)) return res.sendFile(path.resolve(p));
  res.status(404).send("{}");
});

// Direct iOS App Profile Installation Download (.mobileconfig)
app.get(["/download-ios", "/gold.mobileconfig"], (req, res) => {
  res.setHeader("Content-Type", "application/x-apple-aspen-config; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="gold-live.mobileconfig"');
  const p = path.join(publicDir, "gold.mobileconfig");
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, "utf8");
    const host = req.get("host");
    if (host) {
      const proto = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
      const dynamicUrl = `${proto}://${host}/`;
      content = content.replace(/<string>https:\/\/gold-5\.onrender\.com\/<\/string>/g, `<string>${dynamicUrl}</string>`);
    }
    return res.send(content);
  }
  res.status(404).send("iOS profile not found");
});

// =========================================================
// SERVICES INITIALIZATION
// =========================================================
const adminAuth = new AdminAuthManager();
const haremFeed = new HaremFeedManager({
  autoConnect: process.env.NODE_ENV !== "test_manual"
});

// Update today in history whenever new calculated prices arrive
haremFeed.on("update", (calcData) => {
  if (calcData) {
    historyData.updateTodayInHistory(calcData);
    io.emit("gold_update", calcData);
    io.emit("price_update", calcData);
  }
});

haremFeed.on("status_change", (status) => {
  io.emit("status_change", status);
});

haremFeed.on("source_change", (sourceData) => {
  io.emit("source_change", sourceData);
});

// Mount modular Admin router
app.use("/api/admin", createAdminRouter({
  adminAuth,
  haremFeed,
  config,
  io,
  serverStartTime
}));

// =========================================================
// PUBLIC CLIENT API ENDPOINTS
// =========================================================
app.get("/api/prices", (req, res) => {
  const feedStatus = haremFeed.getStatus();
  res.json({
    connected: feedStatus.primaryConnected || feedStatus.backupConnected,
    activeSource: feedStatus.activeSource,
    sourceMode: feedStatus.sourceMode,
    lastUpdate: new Date(feedStatus.lastBroadcastTime || Date.now()).toISOString(),
    data: haremFeed.latestCalculated
  });
});

// Historical Daily Price Endpoints with Input Sanitization
const ALLOWED_SYMBOLS = ["gramGold", "usdKg", "usdTry", "ons"];

app.get("/api/history", (req, res) => {
  const symbol = String(req.query.symbol || "gramGold").trim();
  if (!ALLOWED_SYMBOLS.includes(symbol)) {
    return res.status(400).json({ success: false, error: "رمز الأصل غير صالح (Invalid symbol)" });
  }
  const data = historyData.getHistoryForSymbol(symbol);
  res.json({ success: true, symbol, data });
});

app.get("/api/history/lookup", (req, res) => {
  const symbol = String(req.query.symbol || "gramGold").trim();
  const date = String(req.query.date || "").trim();

  if (!ALLOWED_SYMBOLS.includes(symbol)) {
    return res.status(400).json({ success: false, error: "رمز الأصل غير صالح (Invalid symbol)" });
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  let targetDate = new Date().toISOString().split("T")[0];

  if (date) {
    if (!dateRegex.test(date)) {
      return res.status(400).json({ success: false, error: "صيغة التاريخ غير صالحة، الصيغة المطلوبة YYYY-MM-DD" });
    }
    const [y, m, d] = date.split("-").map(Number);
    if (y < 2000 || y > 2100) {
      return res.status(400).json({ success: false, error: "تاريخ غير صالح (Year out of range)" });
    }
    const parsedDate = new Date(Date.UTC(y, m - 1, d));
    if (
      isNaN(parsedDate.getTime()) ||
      parsedDate.getUTCFullYear() !== y ||
      parsedDate.getUTCMonth() !== m - 1 ||
      parsedDate.getUTCDate() !== d
    ) {
      return res.status(400).json({ success: false, error: "تاريخ غير صالح (Invalid date)" });
    }
    targetDate = date;
  }

  const rate = historyData.getRateForDate(symbol, targetDate);
  res.json({ success: true, symbol, date: targetDate, rate });
});

// Catch-all 404 for unmatched /api routes (ensures JSON response, never HTML)
app.all("/api/*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "المسار غير موجود (API Endpoint Not Found)"
  });
});

// =========================================================
// SOCKET.IO CLIENT HANDSHAKE
// =========================================================
io.on("connection", (client) => {
  const feedStatus = haremFeed.getStatus();
  client.emit("status_change", {
    connected: feedStatus.primaryConnected || feedStatus.backupConnected,
    source: feedStatus.activeSource,
    sourceMode: feedStatus.sourceMode
  });

  if (haremFeed.latestCalculated) {
    client.emit("gold_update", haremFeed.latestCalculated);
    client.emit("price_update", haremFeed.latestCalculated);
  }
});

// Explicit Root Route
app.get("/", (req, res) => {
  const indexCandidate = path.join(publicDir, "index.html");
  if (fs.existsSync(indexCandidate)) {
    return res.sendFile(indexCandidate);
  }
  res.status(404).send(`
    <div style="font-family: sans-serif; text-align: center; padding: 50px; direction: rtl;">
      <h2>⚠️ تنبيه: ملف index.html لم يتم العثور عليه</h2>
    </div>
  `);
});

// Safe Fallback for SPA routing (only if not an API route)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
    return next();
  }
  const indexCandidate = path.join(publicDir, "index.html");
  if (fs.existsSync(indexCandidate)) {
    return res.sendFile(indexCandidate);
  }
  next();
});

// Universal API / Global Error Handler (prevents stack leaks and HTML crash pages)
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  // SyntaxError from express.json()
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      error: "صيغة البيانات غير صالحة (Invalid JSON payload)"
    });
  }

  // Payload too large
  if (err.type === "entity.too.large" || err.status === 413) {
    return res.status(413).json({
      success: false,
      error: "حجم البيانات المرسلة كبير جداً (Payload Too Large)"
    });
  }

  // General server error - never leak stack traces
  const status = err.status || err.statusCode || 500;
  if (req.path.startsWith("/api")) {
    return res.status(status).json({
      success: false,
      error: status === 500 ? "حدث خطأ غير متوقع في الخادم (Internal Server Error)" : err.message
    });
  }

  res.status(status).type("text/plain").send(status === 500 ? "Internal Server Error" : err.message);
});

// Start listening if run directly
let activeServerInstance = null;
function startServer(port = config.PORT) {
  // Ensure haremFeed is active if it was previously closed
  if (haremFeed && typeof haremFeed.start === "function") {
    haremFeed.start();
  }
  return new Promise((resolve, reject) => {
    try {
      activeServerInstance = server.listen(port, "0.0.0.0", () => {
        console.log(`====================================================`);
        console.log(`  Nur Jewellery Gold Live Dashboard - MODULAR & SECURE`);
        console.log(`  Port: ${port} (0.0.0.0)`);
        console.log(`  Dual Failover: Active (Primary & Backup Sockets)`);
        console.log(`  Admin Panel: /api/admin/login`);
        console.log(`====================================================`);
        resolve(activeServerInstance);
      });
      activeServerInstance.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

function stopServer() {
  return new Promise((resolve) => {
    haremFeed.close();
    io.close(() => {
      if (activeServerInstance) {
        activeServerInstance.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  });
}

if (require.main === module) {
  process.on("SIGINT", async () => {
    console.log("\n[SHUTDOWN] Gracefully shutting down server...");
    await stopServer();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    console.log("\n[SHUTDOWN] Gracefully shutting down server...");
    await stopServer();
    process.exit(0);
  });

  startServer().catch((err) => {
    console.error("[FATAL] Server failed to start:", err);
    process.exit(1);
  });
}

module.exports = {
  app,
  server,
  io,
  haremFeed,
  adminAuth,
  config,
  calculateAll,
  startServer,
  stopServer
};
