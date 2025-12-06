import express from "express";
import bodyParser from "body-parser";
import rawBody from "raw-body";
import axios from "axios";
import "dotenv/config";

const app = express();

// ==========================================
// FLEXIBLE PARSER
// ==========================================
app.use((req, res, next) => {
  // Simpan raw body untuk debugging dan fallback
  rawBody(req, {
    encoding: "utf8",
    limit: "2mb",
  })
    .then((buf) => {
      req.rawBody = buf;
      next();
    })
    .catch(() => next());
});

// Normal JSON
app.use(bodyParser.json({ strict: false }));
// urlencoded
app.use(bodyParser.urlencoded({ extended: true }));
// text
app.use(bodyParser.text({ type: "*/*" }));

// ==========================================
// UNIVERSAL CALLBACK HANDLER
// ==========================================
app.all("/callback", async (req, res) => {
  console.log("====================================");
  console.log("⬇️ CALLBACK MASUK DARI WINDOWS APP");
  console.log("Method:", req.method);
  console.log("Headers:", req.headers);
  console.log("Query:", req.query);
  console.log("Body:", req.body);
  console.log("RawBody:", req.rawBody);
  console.log("====================================");

  // =====================================
  // Normalisasi data (ambil apapun yg ada)
  // =====================================
  const payload = {
    method: req.method,
    query: req.query,
    body: req.body || null,
    raw: req.rawBody || null,
  };

  // Kirim ke server utama
  try {
    await axios.post(
      `${process.env.SERVER_URL}/api/callback/${process.env.SUPPLIER_CODE}`,
      payload,
      { timeout: 15000 }
    );
  } catch (err) {
    console.log("❌ Gagal kirim ke server:", err.message);
  }

  res.json({ ok: true });
});

// ==========================================
// JALANKAN SERVER
// ==========================================
const PORT = process.env.CALLBACK_PORT || 7000;
app.listen(PORT, () => {
  console.log(`🚀 Callback server berjalan di port ${PORT}`);
});
