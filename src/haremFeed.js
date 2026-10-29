const EventEmitter = require("events");
const { io: ioClient } = require("socket.io-client");
const { sanitizeObject } = require("./security");
const { calculateAll } = require("./calculator");
const config = require("./config");

const PRIMARY_URL = "https://socket.haremaltin.com:443";
const BACKUP_URL = "wss://hrmsocketonly.haremaltin.com:443";
const STALE_THRESHOLD_MS = 25000; // 25 seconds of silence deemed stale

class HaremFeedManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.primaryUrl = options.primaryUrl || PRIMARY_URL;
    this.backupUrl = options.backupUrl || BACKUP_URL;
    this.autoConnect = options.autoConnect !== false;

    this.sourceMode = "auto"; // "auto" | "primary" | "backup" | "emergency"
    this.activeSource = "primary"; // "primary" | "backup" | "emergency"

    this.primaryConnected = false;
    this.backupConnected = false;
    this.lastPrimaryPacketTime = Date.now();
    this.lastBackupPacketTime = Date.now();
    this.lastBroadcastTime = Date.now();

    this.marketState = config.getDefaultMarketState();
    this.latestCalculated = calculateAll(this.marketState, this.activeSource, config.getBullionsConfig());

    this.primarySocket = null;
    this.backupSocket = null;
    this.watchdogInterval = null;

    if (this.autoConnect) {
      this.initSockets();
      this.startWatchdog();
    }
  }

  initSockets() {
    // Primary Socket with exponential backoff & jitter
    this.primarySocket = ioClient(this.primaryUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      randomizationFactor: 0.3,
      timeout: 10000
    });

    this.primarySocket.on("connect", () => {
      this.primaryConnected = true;
      this.lastPrimaryPacketTime = Date.now();
      console.log("[HAREM FEED] Connected to Primary Harem Socket!");
      if (this.sourceMode === "auto") {
        const prevSource = this.activeSource;
        this.activeSource = "primary";
        if (prevSource !== "primary") {
          this.emit("source_change", {
            activeSource: "primary",
            sourceMode: this.sourceMode,
            reason: "Primary socket reconnected"
          });
        }
      }
      this.emitStatus();
      this.recalculateAndBroadcast();
    });

    this.primarySocket.on("disconnect", (reason) => {
      this.primaryConnected = false;
      console.warn("[HAREM FEED] Primary socket disconnected:", reason);
      this.evaluateFailover();
    });

    this.primarySocket.on("connect_error", (err) => {
      this.primaryConnected = false;
      this.evaluateFailover();
    });

    this.primarySocket.on("error", (err) => {
      this.primaryConnected = false;
      console.warn("[HAREM FEED] Primary socket error:", err?.message || err);
      this.evaluateFailover();
    });

    this.primarySocket.on("price_changed", (payload) => {
      this.handleIncomingMarketData(payload, "primary");
    });

    // Backup Socket with exponential backoff
    this.backupSocket = ioClient(this.backupUrl, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.3,
      timeout: 10000
    });

    this.backupSocket.on("connect", () => {
      this.backupConnected = true;
      this.lastBackupPacketTime = Date.now();
      console.log("[HAREM FEED] Connected to Backup Harem Socket (hrmsocketonly)!");
      this.evaluateFailover();
    });

    this.backupSocket.on("disconnect", (reason) => {
      this.backupConnected = false;
      console.warn("[HAREM FEED] Backup socket disconnected:", reason);
      this.evaluateFailover();
    });

    this.backupSocket.on("connect_error", () => {
      this.backupConnected = false;
      this.evaluateFailover();
    });

    this.backupSocket.on("error", (err) => {
      this.backupConnected = false;
      console.warn("[HAREM FEED] Backup socket error:", err?.message || err);
      this.evaluateFailover();
    });

    this.backupSocket.on("price_changed", (payload) => {
      this.handleIncomingMarketData(payload, "backup");
    });
  }

  startWatchdog() {
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    this.watchdogInterval = setInterval(() => {
      this.evaluateFailover();
    }, 4000);
    if (this.watchdogInterval.unref) this.watchdogInterval.unref();
  }

  isPrimaryHealthy() {
    return this.primaryConnected && (Date.now() - this.lastPrimaryPacketTime <= STALE_THRESHOLD_MS);
  }

  isBackupHealthy() {
    return this.backupConnected && (Date.now() - this.lastBackupPacketTime <= STALE_THRESHOLD_MS);
  }

  evaluateFailover() {
    if (this.sourceMode !== "auto") return;

    let targetSource = "emergency";
    let reason = "";

    const primaryHealthy = this.isPrimaryHealthy();
    const backupHealthy = this.isBackupHealthy();

    if (primaryHealthy) {
      targetSource = "primary";
      reason = "Primary healthy and active";
    } else if (backupHealthy) {
      targetSource = "backup";
      reason = "Primary stale or disconnected, backup active";
    } else if (this.primaryConnected && (Date.now() - this.lastPrimaryPacketTime <= STALE_THRESHOLD_MS * 2)) {
      targetSource = "primary";
      reason = "Primary connected, waiting for ticks";
    } else if (this.backupConnected && (Date.now() - this.lastBackupPacketTime <= STALE_THRESHOLD_MS * 2)) {
      targetSource = "backup";
      reason = "Backup connected, waiting for ticks";
    } else {
      targetSource = "emergency";
      reason = "All live feeds unavailable or stale, activating emergency baseline";
    }

    if (this.activeSource !== targetSource) {
      const prevSource = this.activeSource;
      this.activeSource = targetSource;
      console.log(`[FAILOVER] Source switched from ${prevSource} to ${targetSource} (${reason})`);

      if (targetSource === "emergency") {
        this.triggerEmergencyBaseline();
      }

      this.emit("source_change", {
        activeSource: this.activeSource,
        sourceMode: this.sourceMode,
        reason
      });
      this.emitStatus();
      this.recalculateAndBroadcast();
    }
  }

  triggerEmergencyBaseline() {
    const baseline = config.getDefaultMarketState();
    Object.keys(baseline).forEach((k) => {
      if (!this.marketState[k]) {
        this.marketState[k] = baseline[k];
      }
    });
  }

  handleIncomingMarketData(payload, sourceName) {
    const startTime = Date.now();
    let parsedPayload = payload;
    if (typeof parsedPayload === "string") {
      try {
        parsedPayload = JSON.parse(parsedPayload);
      } catch (e) {
        return null;
      }
    }
    if (Array.isArray(parsedPayload)) {
      if (parsedPayload.length === 1 && parsedPayload[0] && typeof parsedPayload[0] === "object") {
        parsedPayload = parsedPayload[0];
      }
    }
    let rawData = parsedPayload?.data || parsedPayload?.meta || (parsedPayload && (parsedPayload.ALTIN || parsedPayload.KULCEALTIN || parsedPayload.GRAM_ALTIN || parsedPayload.GRAMALTIN) ? parsedPayload : null);
    if (typeof rawData === "string") {
      try {
        rawData = JSON.parse(rawData);
      } catch (e) {
        return null;
      }
    }
    if (Array.isArray(rawData)) {
      const dict = {};
      for (const item of rawData) {
        const key = item.code || item.name || item.id;
        if (key && typeof item === "object") {
          dict[key] = item;
        }
      }
      rawData = dict;
    }
    if (!rawData || typeof rawData !== "object") return null;

    const cleanData = sanitizeObject(rawData);
    const changedKeys = Object.keys(cleanData);
    let relevantChange = false;

    for (const key of changedKeys) {
      this.marketState[key] = {
        ...(this.marketState[key] || {}),
        ...cleanData[key]
      };
      if (
        key === "ALTIN" ||
        key === "KULCEALTIN" ||
        key === "USDTRY" ||
        key === "USDKG" ||
        key === "ONS" ||
        key === "GRAM_ALTIN" ||
        key === "GRAMALTIN" ||
        key === "EURTRY" ||
        key === "GBPTRY" ||
        key === "SARTRY" ||
        key === "AEDTRY" ||
        key === "KWDTRY"
      ) {
        relevantChange = true;
      }
    }

    if (sourceName === "primary") this.lastPrimaryPacketTime = Date.now();
    if (sourceName === "backup") this.lastBackupPacketTime = Date.now();

    // Source prioritization in auto mode with state change notification
    if (this.sourceMode === "auto") {
      let nextSource = this.activeSource;
      if (sourceName === "primary") {
        nextSource = "primary";
      } else if (sourceName === "backup" && !this.isPrimaryHealthy()) {
        nextSource = "backup";
      }

      if (nextSource !== this.activeSource) {
        const prevSource = this.activeSource;
        this.activeSource = nextSource;
        console.log(`[FAILOVER] Source switched from ${prevSource} to ${nextSource} (Live tick on ${nextSource})`);
        this.emit("source_change", {
          activeSource: this.activeSource,
          sourceMode: this.sourceMode,
          reason: `Live tick on ${nextSource}`
        });
        this.emitStatus();
      }
    }

    // In auto mode, only ticks matching the active source are processed and broadcast
    const shouldProcess = (this.sourceMode === "auto" ? this.activeSource === sourceName : this.sourceMode === sourceName);

    if (shouldProcess && relevantChange && (this.marketState.KULCEALTIN || this.marketState.ALTIN || this.marketState.GRAM_ALTIN || this.marketState.GRAMALTIN) && this.marketState.USDTRY && this.marketState.USDKG) {
      const calc = this.recalculateAndBroadcast();
      const latencyMs = Date.now() - startTime;
      if (calc) {
        calc.ingestionLatencyMs = latencyMs;
        this.emit("tick_processed", { calc, latencyMs, source: sourceName });
      }
      return calc;
    }
    return null;
  }

  injectMockData(payload, sourceName = "primary") {
    return this.handleIncomingMarketData(payload, sourceName);
  }

  recalculateAndBroadcast() {
    const bullions = config.getBullionsConfig();
    const karats = config.KARATS_CONFIG;
    const calc = calculateAll(this.marketState, this.activeSource, bullions, karats);
    if (!calc) return null;

    this.latestCalculated = calc;
    this.lastBroadcastTime = Date.now();
    this.emit("update", calc);
    return calc;
  }

  emitStatus() {
    this.emit("status_change", {
      connected: this.primaryConnected || this.backupConnected,
      source: this.activeSource,
      sourceMode: this.sourceMode,
      primaryConnected: this.primaryConnected,
      backupConnected: this.backupConnected
    });
  }

  setSourceMode(mode) {
    if (!["auto", "primary", "backup", "emergency"].includes(mode)) {
      throw new Error("Invalid source mode. Must be auto, primary, backup, or emergency.");
    }
    this.sourceMode = mode;
    if (mode !== "auto") {
      this.activeSource = mode;
      if (mode === "emergency") {
        this.triggerEmergencyBaseline();
      }
    } else {
      this.evaluateFailover();
    }
    this.emit("source_change", {
      activeSource: this.activeSource,
      sourceMode: this.sourceMode,
      reason: `Manual override to ${mode}`
    });
    this.emitStatus();
    this.recalculateAndBroadcast();
    return { activeSource: this.activeSource, sourceMode: this.sourceMode };
  }

  getStatus() {
    return {
      activeSource: this.activeSource,
      sourceMode: this.sourceMode,
      primaryConnected: this.primaryConnected,
      backupConnected: this.backupConnected,
      lastPrimaryPacketSecondsAgo: this.lastPrimaryPacketTime ? Math.floor((Date.now() - this.lastPrimaryPacketTime) / 1000) : null,
      lastBackupPacketSecondsAgo: this.lastBackupPacketTime ? Math.floor((Date.now() - this.lastBackupPacketTime) / 1000) : null,
      lastBroadcastTime: this.lastBroadcastTime
    };
  }

  start() {
    if (!this.primarySocket && !this.backupSocket) {
      this.initSockets();
      this.startWatchdog();
    }
  }

  close() {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
    if (this.primarySocket) {
      this.primarySocket.close();
      this.primarySocket = null;
    }
    if (this.backupSocket) {
      this.backupSocket.close();
      this.backupSocket = null;
    }
    this.primaryConnected = false;
    this.backupConnected = false;
  }
}

module.exports = {
  HaremFeedManager,
  PRIMARY_URL,
  BACKUP_URL
};
