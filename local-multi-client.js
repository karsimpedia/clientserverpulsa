import { io } from "socket.io-client";
import axios from "axios";
import "dotenv/config";

const SERVER_URL = process.env.SERVER_URL;
const SUPPLIERS_RAW = process.env.SUPPLIERS || "";
const LOCAL_API = process.env.LOCAL_API || "http://127.0.0.1:5001";

if (!SERVER_URL) {
  console.error("❌ SERVER_URL wajib diisi di .env");
  process.exit(1);
}

if (!SUPPLIERS_RAW) {
  console.error("❌ SUPPLIERS wajib diisi di .env (format: id:code,id2:code2)");
  process.exit(1);
}

// ===================================================================
// PARSE SUPPLIERS
// ===================================================================
const SUPPLIERS = SUPPLIERS_RAW.split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((pair) => {
    const [id, code] = pair.split(":");
    return { id: id?.trim(), code: code?.trim() };
  })
  .filter((s) => s.id && s.code);

if (!SUPPLIERS.length) {
  console.error("❌ SUPPLIERS tidak valid. Contoh: SUPPLIERS=cltAAA:PC_A,cltBBB:PC_B");
  process.exit(1);
}

function log(...args) {
  console.log(new Date().toISOString(), "-", ...args);
}

// ===================================================================
// Universal Callback → ke server utama (per supplierCode)
// ===================================================================
async function sendUniversalCallback({ supplierCode, payload }) {
  try {
    const url = `${SERVER_URL}/api/supplier-callback?code=${encodeURIComponent(
      supplierCode
    )}`;

    log(`⬆️ [${supplierCode}] CALLBACK →`, url, payload);

    await axios.post(url, payload, { timeout: 15000 });
  } catch (err) {
    log(`❌ [${supplierCode}] Callback gagal:`, err.message);
  }
}

// ===================================================================
// Proses ke software lokal
// ===================================================================
async function processLocal({ method, payload, supplierId, supplierCode }) {
  log(`➡️ [${supplierCode}] Proses lokal op=${method}`, {
    supplierId,
    supplierCode,
    payload,
  });

  try {
    const resp = await axios.post(
      `${LOCAL_API}/process`,
      {
        method,
        payload,
        supplierId,
        supplierCode,
      },
      { timeout: 20000 }
    );

    // Harapkan response bentuk:
    // { ok, status, message, raw }
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

// ===================================================================
// Bikin 1 socket per supplier
// ===================================================================
function createSupplierSocket({ id: supplierId, code: supplierCode }) {
  log(`🔌 [${supplierCode}] Connect to: ${SERVER_URL}/supplier as ${supplierId}`);

  const socket = io(`${SERVER_URL}/supplier`, {
    transports: ["websocket"],
    query: { supplierId },
    reconnection: true,
    reconnectionDelay: 3000,
  });

  socket.on("connect", () => {
    log(`✅ [${supplierCode}] Connected. socket.id=${socket.id}`);
  });

  socket.on("disconnect", (reason) => {
    log(`⚠️ [${supplierCode}] Disconnected:`, reason);
  });

  socket.on("connect_error", (err) => {
    log(`❌ [${supplierCode}] Connect error:`, err.message);
  });

  // ===========================================
  // REQUEST dari server
  // ===========================================
  socket.on("supplier:request", async (req) => {
    const { method, ref, payload } = req || {};
    log(`📥 [${supplierCode}] REQUEST:`, req);

    // 1. Proses ke software lokal
    const localResult = await processLocal({
      method,
      payload,
      supplierId,
      supplierCode,
    });

    // 2. Balas ke server lewat socket (sesuai callLocalPc)
    const replyEvent = `supplier:reply:${ref}`;
    log(`⬆️ [${supplierCode}] REPLY EVENT: ${replyEvent}`, localResult);
    socket.emit(replyEvent, localResult);

    // 3. Kirim universal callback (optional tapi sesuai desain abang)
    await sendUniversalCallback({
      supplierCode,
      payload: {
        trxId: payload?.trxId,
        status: localResult.status,
        message: localResult.message,
        supplierResult: localResult.raw,
      },
    });
  });

  return socket;
}

// ===================================================================
// Start semua supplier
// ===================================================================
log("============================================");
log(" MULTI SUPPLIER CLIENT STARTING");
log(" SERVER_URL:", SERVER_URL);
log(" SUPPLIERS:", SUPPLIERS);
log(" LOCAL_API:", LOCAL_API);
log("============================================");

const sockets = SUPPLIERS.map(createSupplierSocket);

// optional: kalau mau di-export atau dipakai lagi
export default sockets;
