import express from "express";
import bodyParser from "body-parser";
import rawBody from "raw-body";
import { io } from "socket.io-client";
import axios from "axios";
import "dotenv/config";

// =====================================================
// ENV
// =====================================================
const SERVER_URL = process.env.SERVER_URL;
const SUPPLIER_ID = process.env.SUPPLIER_ID;
const SUPPLIER_CODE = process.env.SUPPLIER_CODE;
const LOCAL_API = process.env.LOCAL_API || "http://127.0.0.1:8001"; // SPL lokal
const CALLBACK_PORT = process.env.CALLBACK_PORT || 8000;

if (!SERVER_URL || !SUPPLIER_ID || !SUPPLIER_CODE) {
  console.error("❌ ENV belum lengkap. SERVER_URL, SUPPLIER_ID, SUPPLIER_CODE harus ada.");
  process.exit(1);
}

// =====================================================
// LOGGER
// =====================================================
function log(...args) {
  console.log(new Date().toISOString(), "-", ...args);
}

// =====================================================
// UNIVERSAL CALLBACK KE SERVER UTAMA
// =====================================================
async function sendUniversalCallback(payload) {
  try {
    const url = `${SERVER_URL}/api/callback/${SUPPLIER_CODE}`;

    log("⬆️ CALLBACK →", url, payload);

    await axios.post(url, payload, {
      timeout: 15000,
      transformResponse: [(d) => d],
    });
  } catch (err) {
    log("❌ Callback gagal:", err.message);
  }
}

// =====================================================
// PROSES SPL LOKAL — format kode.tujuan.idtrx
// =====================================================
async function processLocal(method, payload) {
  log("➡️ Proses lokal:", payload);

  try {
    const path = `${payload.kode}.${payload.tujuan}.${payload.trxId}`;
    const url = `${LOCAL_API}/${path}`;

    log("➡️ LOCAL API CALL:", url);

    const resp = await axios.get(url, {
      timeout: 20000,
      transformResponse: [(d) => d], // raw string
    });

    const body = resp.data;

    // Supplier lokal mengirim response text
    if (typeof body === "string") {
      return {
        ok: true,
        status: "PROCESS",
        message: body,
        raw: body,
      };
    }

    return body;
  } catch (err) {
    log("❌ Error SPL lokal:", err.message);
    return {
      ok: false,
      status: "FAILED",
      message: err.message,
      raw: null,
    };
  }
}

// =====================================================
// SOCKET.IO CLIENT
// =====================================================
log("🔌 Connect to:", SERVER_URL, "supplierId=", SUPPLIER_ID);

const socket = io(`${SERVER_URL}/supplier`, {
  transports: ["websocket"],
  auth: { supplierId: SUPPLIER_ID },
});

socket.on("connect", () => {
  log("✅ Connected to server utama");
});

socket.on("supplier:request", async (req) => {
  const { method, ref, payload } = req;

  log("🔔 REQUEST MASUK!");
  log("Payload:", JSON.stringify(payload, null, 2));

  // 1. Proses SPL lokal
  const localResult = await processLocal(method, payload);

  // 2. Balas ke server via event reply
  socket.emit(`supplier:reply:${ref}`, localResult);

  // 3. Kirim universal callback
  await sendUniversalCallback({
    from: "LOCAL_PROCESS",
    trxId: payload.trxId,
    status: localResult.status,
    message: localResult.message,
    supplierResult: localResult.raw,
  });
});

socket.on("disconnect", () => {
  log("⚠️ Disconnected dari server utama");
});

// =====================================================
// CALLBACK SERVER UNTUK SOFTWARE JADUL / WINDOWS / SPL
// =====================================================
const app = express();

// Raw body catcher
app.use((req, res, next) => {
  rawBody(req, { encoding: "utf8", limit: "3mb" })
    .then((buf) => {
      req.rawBody = buf;
      next();
    })
    .catch(() => next());
});

// Parsers
app.use(bodyParser.json({ strict: false }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.text({ type: "*/*" }));

// =====================================================
// *** CALLBACK VIA PATH (MODEL SUPPLIER JADUL) ***
// Contoh: http://localhost:8000/235.0823434343.MOBO.R*323274
// =====================================================
app.all("/*", async (req, res, next) => {
  const path = req.path.replace("/", "").trim();

  if (!path) return next();

  log("⬇️ CALLBACK VIA PATH:", path);

  const payload = {
    from: "SUPPLIER_PATH_CALLBACK",
    method: req.method,
    raw: path,
    body: path,
    query: req.query,
  };

  await sendUniversalCallback(payload);

  res.setHeader("Content-Type", "text/plain");
  return res.end("OK");
});

// =====================================================
// OPSIONAL: Route /callback jika ada app lain pakai
// =====================================================
app.all("/callback", async (req, res) => {
  log("⬇️ CALLBACK /callback");

  const bodyText =
    typeof req.body === "string"
      ? req.body
      : req.rawBody
      ? String(req.rawBody)
      : JSON.stringify(req.body);

  const payload = {
    from: "WINDOWS_CALLBACK",
    method: req.method,
    body: bodyText,
    raw: bodyText,
    query: req.query,
  };

  await sendUniversalCallback(payload);

  res.setHeader("Content-Type", "text/plain");
  return res.end("OK");
});

// =====================================================
// START SERVER CALLBACK
// =====================================================
app.listen(CALLBACK_PORT, () => {
  log(`🚀 Callback server berjalan di port ${CALLBACK_PORT}`);
  log("Menunggu callback SPL / Windows / Aplikasi Jadul...");
});

log("🔥 Supplier client siap digunakan!");
