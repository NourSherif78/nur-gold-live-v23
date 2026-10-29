const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(__dirname, "..", "data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

const KARATS_CONFIG = [
  { id: "k22", name: "عيار 22", purity: 916 },
  { id: "k21", name: "عيار 21", purity: 875 },
  { id: "k18", name: "عيار 18", purity: 750 },
  { id: "k14", name: "عيار 14", purity: 585 }
];

const DEFAULT_BULLIONS_CONFIG = [
  { id: "b5", weight: 5, margin: 20, name: "سبيكة 5 جرام" },
  { id: "b10", weight: 10, margin: 20, name: "سبيكة 10 جرام" },
  { id: "b20", weight: 20, margin: 10, name: "سبيكة 20 جرام" },
  { id: "b50", weight: 50, margin: 0, name: "سبيكة 50 جرام" },
  { id: "b100", weight: 100, margin: 0, name: "سبيكة 100 جرام" }
];

const DEFAULT_MARKET_STATE = {
  ALTIN: { alis: 6704.47, satis: 6731.35 },
  KULCEALTIN: { alis: 6670.95, satis: 6744.81 },
  USDTRY: { alis: 48.865, satis: 48.925 },
  USDKG: { alis: 136500, satis: 136900 },
  ONS: { alis: 4284.8, satis: 4285.4 },
  EURTRY: { alis: 55.558, satis: 55.714 },
  GBPTRY: { alis: 64.386, satis: 64.685 },
  SARTRY: { alis: 12.727, satis: 13.153 },
  AEDTRY: { alis: 13.28, satis: 13.34 },
  KWDTRY: { alis: 150.11, satis: 160.60 }
};

let bullionsConfig = DEFAULT_BULLIONS_CONFIG.map(b => ({ ...b }));
let adminPin = process.env.ADMIN_PIN || "1234";

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.error("[CONFIG] Failed to create data directory:", err.message);
  }
}

function loadSettings() {
  ensureDataDir();
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (parsed.adminPin && typeof parsed.adminPin === "string" && parsed.adminPin.trim().length >= 4) {
          adminPin = parsed.adminPin.trim();
        }
        if (Array.isArray(parsed.bullions)) {
          parsed.bullions.forEach(m => {
            const item = bullionsConfig.find(b => b.id === m.id);
            if (item && typeof m.margin === "number" && !isNaN(m.margin) && m.margin >= 0) {
              item.margin = m.margin;
            }
          });
        }
      }
    }
  } catch (err) {
    console.warn("[CONFIG] Could not load persisted settings, using defaults:", err.message);
  }
}

function saveSettings() {
  ensureDataDir();
  const payload = {
    adminPin,
    bullions: bullionsConfig.map(b => ({
      id: b.id,
      weight: b.weight,
      margin: b.margin,
      name: b.name
    })),
    updatedAt: new Date().toISOString()
  };

  try {
    const tempFile = `${SETTINGS_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(tempFile, SETTINGS_FILE);
    return true;
  } catch (err) {
    console.error("[CONFIG] Failed to persist settings:", err.message);
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(payload, null, 2), "utf8");
      return true;
    } catch (e2) {
      console.error("[CONFIG] Direct write failed:", e2.message);
      return false;
    }
  }
}

// Initialize on module load
loadSettings();

module.exports = {
  PORT: process.env.PORT || 3000,
  DATA_DIR,
  SETTINGS_FILE,
  KARATS_CONFIG,
  DEFAULT_BULLIONS_CONFIG,
  getBullionsConfig: () => bullionsConfig.map(b => ({ ...b })),
  setBullionsMargins: (marginsArray) => {
    if (!Array.isArray(marginsArray) || marginsArray.length === 0 || marginsArray.length > 50) {
      throw new Error("Margins payload must be an array of 1 to 50 items");
    }
    // Validate every item strictly
    for (const m of marginsArray) {
      if (!m || typeof m !== "object") {
        throw new Error("Invalid margin item in payload");
      }
      if (!m.id || typeof m.id !== "string") {
        throw new Error("Missing or invalid 'id' in margin item");
      }
      if (typeof m.margin !== "number" || !Number.isFinite(m.margin) || m.margin < 0 || m.margin > 100000) {
        throw new Error(`Invalid margin value for ${m.id}: must be a non-negative finite number (max 100,000)`);
      }
      const existing = bullionsConfig.find(b => b.id === m.id);
      if (!existing) {
        throw new Error(`Unknown bullion id: ${m.id}`);
      }
    }
    // Apply updates
    marginsArray.forEach(m => {
      const item = bullionsConfig.find(b => b.id === m.id);
      if (item) {
        item.margin = Number(m.margin);
      }
    });
    saveSettings();
    return bullionsConfig.map(b => ({ ...b }));
  },
  getAdminPin: () => adminPin,
  setAdminPin: (newPin) => {
    if (!newPin || typeof newPin !== "string" || newPin.trim().length < 4 || newPin.trim().length > 64) {
      throw new Error("PIN must be a string of between 4 and 64 characters");
    }
    adminPin = newPin.trim();
    saveSettings();
    return true;
  },
  getDefaultMarketState: () => JSON.parse(JSON.stringify(DEFAULT_MARKET_STATE)),
  loadSettings,
  saveSettings
};
