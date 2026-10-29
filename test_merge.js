const { io } = require("socket.io-client");

const socket = io("https://socket.haremaltin.com:443", {
  transports: ["websocket", "polling"]
});

let state = {};
let updatesCount = 0;

socket.on("price_changed", (payload) => {
  if (!payload || !payload.data) return;
  Object.assign(state, payload.data);
  updatesCount++;

  if (state.ALTIN && state.USDTRY && state.USDKG) {
    console.log(`Update #${updatesCount}: ALTIN=${state.ALTIN.satis} (${state.ALTIN.tarih}), USDTRY=${state.USDTRY.alis}, USDKG=${state.USDKG.satis}`);
  }
});

setTimeout(() => {
  console.log("Total updates in 10s:", updatesCount);
  process.exit(0);
}, 10000);
