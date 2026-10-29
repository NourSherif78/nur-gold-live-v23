const express = require("express");
const { getClientIp, createRateLimiter } = require("./security");

function createAdminRouter({ adminAuth, haremFeed, config, io, serverStartTime }) {
  const router = express.Router();

  // Strict Rate Limiter for Admin endpoints (max 40 requests per minute)
  const adminLimiter = createRateLimiter(40, 60000);
  router.use(adminLimiter);

  // Admin Login with Brute-Force lockout
  router.post("/login", (req, res) => {
    const ip = getClientIp(req);

    if (adminAuth.loginTracker.isLocked(ip)) {
      const remainingMins = adminAuth.loginTracker.getRemainingLockMinutes(ip);
      return res.status(429).json({
        success: false,
        error: `تم تجاوز الحد الأقصى للمحاولات الخاطئة. يرجى الانتظار ${remainingMins} دقائق.`
      });
    }

    const { pin } = req.body || {};
    if (pin === undefined || pin === null || String(pin).trim() === "") {
      return res.status(400).json({
        success: false,
        error: "يرجى إدخال رمز PIN (PIN is required)"
      });
    }

    const currentPin = config.getAdminPin();

    if (!adminAuth.verifyPinConstantTime(String(pin), String(currentPin))) {
      const remaining = adminAuth.loginTracker.recordFailure(ip);
      if (remaining <= 0) {
        return res.status(429).json({
          success: false,
          error: "تم تجاوز الحد الأقصى للمحاولات الخاطئة. تم قفل تسجيل الدخول مؤقتاً."
        });
      }
      return res.status(401).json({
        success: false,
        error: `رمز PIN غير صحيح. المحاولات المتبقية: ${remaining}`
      });
    }

    // Success: clear lockout and issue session token
    adminAuth.loginTracker.reset(ip);
    const token = adminAuth.createSession();

    res.json({
      success: true,
      token,
      message: "تم تسجيل دخول المسؤول بنجاح"
    });
  });

  // Protected Admin Middlewares
  const requireAdmin = adminAuth.middleware();

  // Admin Telemetry & Status
  router.get("/status", requireAdmin, (req, res) => {
    const feedStatus = haremFeed.getStatus();
    const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
    const mem = process.memoryUsage();

    res.json({
      success: true,
      ...feedStatus,
      clientCount: io ? (io.engine?.clientsCount || 0) : 0,
      uptimeSeconds,
      uptime: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`,
      memoryRssMb: (mem.rss / 1024 / 1024).toFixed(1),
      bullions: config.getBullionsConfig()
    });
  });

  // Manual Feed Source Override
  router.post("/set-source", requireAdmin, (req, res) => {
    const { mode } = req.body || {};
    if (!mode || !["auto", "primary", "backup", "emergency"].includes(mode)) {
      return res.status(400).json({
        success: false,
        error: "وضع المصدر غير صالح. القيم المسموحة: auto, primary, backup, emergency"
      });
    }

    try {
      const result = haremFeed.setSourceMode(mode);
      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  });

  // Bullion Margins Update with Persistence
  router.post("/set-margins", requireAdmin, (req, res) => {
    const { margins } = req.body || {};
    if (!Array.isArray(margins) || margins.length === 0) {
      return res.status(400).json({
        success: false,
        error: "تنسيق المصنعيات غير صالح. يجب إرسال مصفوفة تحتوي على المصنعيات المعدلة."
      });
    }

    try {
      const updatedBullions = config.setBullionsMargins(margins);
      haremFeed.recalculateAndBroadcast();
      res.json({
        success: true,
        bullions: updatedBullions
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }
  });

  // Change Admin PIN with Persistence
  router.post("/set-pin", requireAdmin, (req, res) => {
    const { newPin } = req.body || {};
    if (!newPin || typeof newPin !== "string" || newPin.trim().length < 4 || newPin.trim().length > 64) {
      return res.status(400).json({
        success: false,
        error: "يجب أن يتكون الـ PIN من 4 إلى 64 خانة"
      });
    }

    try {
      config.setAdminPin(newPin.trim());
      res.json({
        success: true,
        message: "تم تغيير رمز PIN بنجاح وحفظه على القرص"
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  });

  // Ping Latency Test
  router.post("/test-ping", requireAdmin, async (req, res) => {
    const timeoutMs = 4000;
    let primaryPing = null;
    let backupPing = null;

    const startPrimary = Date.now();
    let timer1 = null;
    try {
      const controller1 = new AbortController();
      timer1 = setTimeout(() => controller1.abort(), timeoutMs);
      const r1 = await fetch("https://socket.haremaltin.com/socket.io/?EIO=4&transport=polling", {
        signal: controller1.signal
      });
      primaryPing = `${Date.now() - startPrimary} ms (HTTP ${r1.status})`;
    } catch (e) {
      primaryPing = `فشل: ${e.name === "AbortError" ? "انتهت المهلة" : e.message}`;
    } finally {
      if (timer1) clearTimeout(timer1);
    }

    const startBackup = Date.now();
    let timer2 = null;
    try {
      const controller2 = new AbortController();
      timer2 = setTimeout(() => controller2.abort(), timeoutMs);
      const r2 = await fetch("https://www.haremaltin.com", {
        signal: controller2.signal
      });
      backupPing = `${Date.now() - startBackup} ms (HTTP ${r2.status})`;
    } catch (e) {
      backupPing = `فشل: ${e.name === "AbortError" ? "انتهت المهلة" : e.message}`;
    } finally {
      if (timer2) clearTimeout(timer2);
    }

    res.json({
      success: true,
      results: {
        primarySocket: primaryPing,
        backupHost: backupPing
      }
    });
  });

  // Admin Logout
  router.post("/logout", requireAdmin, (req, res) => {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim() || req.headers["x-admin-token"];
    if (token) {
      adminAuth.revokeToken(token);
    }
    res.json({
      success: true,
      message: "تم تسجيل الخروج بنجاح"
    });
  });

  return router;
}

module.exports = {
  createAdminRouter
};
