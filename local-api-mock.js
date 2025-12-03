import express from "express";

const app = express();
app.use(express.json());

app.post("/process", (req, res) => {
  const { method, payload } = req.body;

  console.log("LOCAL API RECEIVED:", method, payload);

  res.json({
    ok: true,
    status: "SUCCESS",
    message: "Transaksi Berhasil (mock)",
    raw: {
      pulsa: "5000",
      sn: "123456789",
    }
  });
});

app.listen(5001, () => {
  console.log("LOCAL API MOCK running on port 5001");
});
