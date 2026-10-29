const crypto = require("crypto");

// Prototype pollution guard
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
function sanitizeObject(obj) {
  if (!obj || typeof obj !== "object") return {};
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const val = obj[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      clean[key] = sanitizeObject(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

// IP normalization helper
function getClientIp(req) {
  const trustProxy = req.app ? req.app.get("trust proxy") : false;
  let ip = "";
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      const list = String(forwarded).split(",");
      ip = list[0].trim();
    }
  }
  if (!ip) {
    ip = req.ip || req.socket?.remoteAddress || "127.0.0.1";
  }
  if (typeof ip === "string" && ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }
  return ip || "127.0.0.1";
}

// Sliding window in-memory rate limiter with bounded memory footprint
function createRateLimiter(maxRequests = 150, windowMs = 60000, maxEntries = 5000) {
  const tracker = new Map();

  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of tracker.entries()) {
      if (now - rec.resetTime > windowMs) {
        tracker.delete(ip);
      }
    }
  }, 60000);
  if (cleanupInterval.unref) cleanupInterval.unref();

  return (req, res, next) => {
    const ip = getClientIp(req);
    const now = Date.now();
    let rec = tracker.get(ip);
    if (!rec || now - rec.resetTime > windowMs) {
      if (tracker.size >= maxEntries) {
        const oldestKey = tracker.keys().next().value;
        if (oldestKey) tracker.delete(oldestKey);
      }
      rec = { count: 1, resetTime: now };
      tracker.set(ip, rec);
    } else {
      rec.count++;
    }

    if (rec.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: "عدد الطلبات كبير جداً. يرجى الانتظار قليلاً (Too Many Requests)"
      });
    }
    next();
  };
}

// Brute force protection tracker for login attempts with bounded memory
class LoginAttemptTracker {
  constructor(maxAttempts = 5, windowMs = 300000, maxEntries = 2000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.maxEntries = maxEntries;
    this.map = new Map();

    const cleanup = setInterval(() => {
      const now = Date.now();
      for (const [ip, rec] of this.map.entries()) {
        if (now - rec.resetTime > this.windowMs) {
          this.map.delete(ip);
        }
      }
    }, 60000);
    if (cleanup.unref) cleanup.unref();
  }

  isLocked(ip) {
    const now = Date.now();
    const rec = this.map.get(ip);
    if (!rec) return false;
    if (now - rec.resetTime > this.windowMs) {
      this.map.delete(ip);
      return false;
    }
    return rec.count >= this.maxAttempts;
  }

  getRemainingLockMinutes(ip) {
    const rec = this.map.get(ip);
    if (!rec) return 0;
    const remainingMs = Math.max(0, this.windowMs - (Date.now() - rec.resetTime));
    return Math.ceil(remainingMs / 60000);
  }

  recordFailure(ip) {
    const now = Date.now();
    let rec = this.map.get(ip);
    if (!rec || now - rec.resetTime > this.windowMs) {
      if (this.map.size >= this.maxEntries) {
        const oldestKey = this.map.keys().next().value;
        if (oldestKey) this.map.delete(oldestKey);
      }
      rec = { count: 1, resetTime: now };
    } else {
      rec.count++;
    }
    this.map.set(ip, rec);
    return this.maxAttempts - rec.count;
  }

  reset(ip) {
    this.map.delete(ip);
  }
}

// Admin Token & Session Management
class AdminAuthManager {
  constructor(maxTokens = 500) {
    this.maxTokens = maxTokens;
    this.activeTokens = new Map(); // token -> { createdAt, expiresAt }
    this.loginTracker = new LoginAttemptTracker(5, 300000);

    const cleanup = setInterval(() => {
      const now = Date.now();
      for (const [token, session] of this.activeTokens.entries()) {
        if (now > session.expiresAt) {
          this.activeTokens.delete(token);
        }
      }
    }, 60000);
    if (cleanup.unref) cleanup.unref();
  }

  verifyPinConstantTime(inputPin, correctPin) {
    if (typeof inputPin !== "string" || typeof correctPin !== "string") return false;
    const inputHash = crypto.createHash("sha256").update(inputPin.trim()).digest();
    const targetHash = crypto.createHash("sha256").update(correctPin.trim()).digest();
    return crypto.timingSafeEqual(inputHash, targetHash);
  }

  createSession() {
    if (this.activeTokens.size >= this.maxTokens) {
      const oldestToken = this.activeTokens.keys().next().value;
      if (oldestToken) this.activeTokens.delete(oldestToken);
    }
    const token = "adm_" + crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    this.activeTokens.set(token, {
      createdAt: now,
      expiresAt: now + (24 * 60 * 60 * 1000)
    });
    return token;
  }

  isValidToken(token) {
    if (!token || typeof token !== "string") return false;
    const session = this.activeTokens.get(token);
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
      this.activeTokens.delete(token);
      return false;
    }
    return true;
  }

  revokeToken(token) {
    return this.activeTokens.delete(token);
  }

  middleware() {
    return (req, res, next) => {
      const authHeader = req.headers["authorization"] || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim() || req.headers["x-admin-token"];

      if (this.isValidToken(token)) {
        return next();
      }
      return res.status(401).json({
        success: false,
        error: "غير مصرح - رمز الدخول غير صالح (Unauthorized)"
      });
    };
  }
}

// Defensive security headers and strict static source shield
function securityHeadersAndShield() {
  const BLOCKED_NAMES = [
    ".env", ".git", ".gitignore", "package.json", "package-lock.json",
    "server.js", "historydata.js", "monitor.js", "test-suite.js", "test_merge.js",
    "settings.json"
  ];
  const BLOCKED_DIRS = [
    "/src", "/data", "/.data", "/.agents", "/node_modules"
  ];
  const BLOCKED_EXTENSIONS = [
    ".env", ".git", ".yaml", ".yml", ".md", ".sh", ".bat", ".tmp", ".log"
  ];

  return (req, res, next) => {
    // Security Headers
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-XSS-Protection", "1; mode=block");

    // Shield against malformed URIs, traversal, null bytes & sensitive internals
    let normalized = "";
    try {
      normalized = decodeURIComponent(req.path || "").toLowerCase();
    } catch (e) {
      return res.status(400).type("text/plain").send("Bad Request: Malformed URI");
    }

    // Check null-byte injection
    if (normalized.includes("\0") || (req.url && req.url.includes("%00"))) {
      return res.status(400).type("text/plain").send("Bad Request: Null byte detected");
    }

    // Check double-encoded directory traversal
    try {
      const secondDecode = decodeURIComponent(normalized);
      if (secondDecode.includes("..") || secondDecode.includes("./")) {
        return res.status(403).type("text/plain").send("Forbidden: Directory traversal denied");
      }
    } catch (e) {}

    // Normalize Windows backslashes to forward slashes and collapse duplicate slashes
    normalized = normalized.replace(/\\+/g, "/").replace(/\/+/g, "/");

    // Check directory traversal
    if (normalized.includes("..") || normalized.includes("./")) {
      return res.status(403).type("text/plain").send("Forbidden: Directory traversal denied");
    }

    // Strip Windows Alternate Data Streams and trailing dots/spaces from path segments
    // (NTFS quirks e.g. "server.js.", "server.js ", "server.js::$DATA", "src ")
    normalized = normalized
      .split("/")
      .map((seg) => seg.split(":")[0].replace(/[\.\s]+$/, ""))
      .join("/");

    // Check sensitive folder access (matches both '/src' and '/src/...')
    for (const dir of BLOCKED_DIRS) {
      if (normalized === dir || normalized.startsWith(dir + "/")) {
        return res.status(403).type("text/plain").send("Forbidden: Access Denied");
      }
    }

    // Check blocked file extensions
    for (const ext of BLOCKED_EXTENSIONS) {
      if (normalized.endsWith(ext) || normalized.includes(`${ext}/`)) {
        return res.status(403).type("text/plain").send("Forbidden: Access Denied");
      }
    }

    // Check blocked specific filenames
    for (const blocked of BLOCKED_NAMES) {
      if (normalized === `/${blocked}` || normalized.endsWith(`/${blocked}`)) {
        return res.status(403).type("text/plain").send("Forbidden: Access Denied");
      }
    }

    next();
  };
}

module.exports = {
  sanitizeObject,
  getClientIp,
  createRateLimiter,
  LoginAttemptTracker,
  AdminAuthManager,
  securityHeadersAndShield
};
