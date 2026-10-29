const { io } = require("socket.io-client");

const socket = io("https://socket.haremaltin.com:443", {
  transports: ["websocket", "polling"],
  reconnection: true
});

let count = 0;
const start = Date.now();

socket.on("connect", () => {
  console.log("Connected at", new Date().toLocaleTimeString());
});

socket.on("price_changed", (data) => {
  count++;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const altin = data?.data?.ALTIN;
  const time = data?.data?.ALTIN?.tarih || "";
  console.log(`[#${count} at +${elapsed}s] ALTIN alis: ${altin?.alis}, satis: ${altin?.satis}, time: ${time}`);
});

setTimeout(() => {
  console.log(`Total events in 15s: ${count}`);
  process.exit(0);
}, 15000);
