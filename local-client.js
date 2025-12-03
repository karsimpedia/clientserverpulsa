import { io } from "socket.io-client";
import axios from "axios";
import "dotenv/config";

// =========================================
// ENV
// =========================================
const SERVER_URL = process.env.SERVER_URL;
const SUPPLIER_ID = process.env.SUPPLIER_ID;
const SUPPLIER_CODE = process.env.SUPPLIER_CODE;
const LOCAL_API = process.env.LOCAL_API || "http://127.0.0.1:5001";

if (!SUPPLIER_ID || !SUPPLIER_CODE) {
  console.error("❌ SUPPLIER_ID dan SUPPLIER_CODE wajib ada di .env");
  process.exit(1);
}

// =========================================
// LOGGER
// =========================================
function log(...args) {
  console.log(new Date().toISOString(), "-", ...args);
}

// =========================================
// Universal Callback → Kirim ke server utama
// =========================================
async function sendUniversalCallback(payload) {
  try {
    const url = `${SERVER_URL}/api/callback/${SUPPLIER_CODE}`;

    log("⬆️ CALLBACK →", url, payload);

    await axios.post(url, payload, { timeout: 15000 });
  } catch (err) {
    log("❌ Callback gagal:", err.message);
  }
}

// =========================================
// Proses ke software lokal (API lokal)
// =========================================
async function processLocal(method, payload) {
  log("➡️  Proses lokal:", method, payload);

  try {
    const resp = await axios.post(
      `${LOCAL_API}/topup`,
      { method, payload },
      { timeout: 20000 }
    );

    return resp.data;
  } catch (err) {
    return {
      ok: false,
      status: "FAILED",
      message: err.message,
      raw: null,
    };
  }
}

// =========================================
// CONNECT TO SERVER
// =========================================
log("🔌 Connect to:", SERVER_URL, "supplierId=", SUPPLIER_ID);

const socket = io(`${SERVER_URL}/supplier`, {
  transports: ["websocket"],
  auth: { supplierId: SUPPLIER_ID }   // FIX HERE
});

// -----------------------------------------
// ON CONNECT
// -----------------------------------------
socket.on("connect", () => {
  log("✅ Connected to server");
    // console.log("SupplierId:", socket.handshake.query);
});

// -----------------------------------------
// ON SUPPLIER REQUEST
// -----------------------------------------
socket.on("supplier:request", async (req) => {
  const { method, ref, payload } = req;

  log("🔔 REQUEST MASUK!");
  log("Waktu:", new Date().toISOString());
  log("Method:", method);
  log("Ref:", ref);
  log("Payload:", JSON.stringify(payload, null, 2));
  log("==============================================");

  // 1. Proses API lokal
  const localResult = await processLocal(method, payload);

  // 2. Reply ke server
  const replyEvent = `supplier:reply:${ref}`;
  log("⬆️ SEND REPLY:", replyEvent);
  socket.emit(replyEvent, localResult);

  // 3. Kirim callback universal
  await sendUniversalCallback({
    trxId: payload?.trxId,
    status: localResult.status,
    message: localResult.message,
    supplierResult: localResult.raw,
  });
});

// -----------------------------------------
// DISCONNECT
// -----------------------------------------
socket.on("disconnect", () => {
  log("⚠️ Disconnected from server");
});
