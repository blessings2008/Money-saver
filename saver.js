const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

// -----------------------------------
// FIREBASE ADMIN (SERVER ONLY)
// -----------------------------------
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://money-saver-e0504-default-rtdb.firebaseio.com"
});

const db = admin.database();

// -----------------------------------
// HEALTH CHECK
// -----------------------------------
app.get("/", (req, res) => {
  res.send("Money Saver Backend Running");
});

// -----------------------------------
// SAVE TRANSACTION (optional future use)
// -----------------------------------
app.post("/api/transactions", async (req, res) => {
  try {
    const data = req.body;

    const ref = db.ref("transactions").push();
    await ref.set(data);

    res.json({ success: true, id: ref.key });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------
// 🔥 TRANSFER ENGINE (MAIN FEATURE)
// -----------------------------------
app.post("/api/transfers", async (req, res) => {
  try {
    const { amount, network, status, createdAt } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount"
      });
    }

    const transfer = {
      amount,
      network: network || "airtel",
      status: status || "waiting_transfer",
      createdAt: createdAt || Date.now()
    };

    const ref = db.ref("transfers").push();
    await ref.set(transfer);

    return res.json({
      success: true,
      id: ref.key,
      message: "Transfer queued successfully"
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// -----------------------------------
// GET ALL TRANSFERS (FOR DEBUG / ADMIN)
// -----------------------------------
app.get("/api/transfers", async (req, res) => {
  try {
    const snap = await db.ref("transfers").get();
    const data = snap.val() || {};

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------
// APPROVE TRANSFER (OPTIONAL CONTROL)
// -----------------------------------
app.post("/api/approve-transfer", async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Transfer ID required"
      });
    }

    const ref = db.ref(`transfers/${id}`);
    const snap = await ref.get();

    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        message: "Transfer not found"
      });
    }

    await ref.update({
      status: "approved",
      approvedAt: Date.now()
    });

    res.json({
      success: true,
      message: "Transfer approved"
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// -----------------------------------
// GET APPROVED SAVINGS LOGIC SOURCE
// -----------------------------------
app.get("/api/approved-savings", async (req, res) => {
  try {
    const snap = await db.ref("transactions").get();
    const data = snap.val() || {};

    let approvedSavings = 0;

    Object.values(data).forEach(tx => {
      if (tx.savingsStatus === "approved") {
        approvedSavings += Number(tx.saveAmount || 0);
      }
    });

    res.json({ approvedSavings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------
app.listen(3000, () => {
  console.log("🚀 Money Saver Backend running on port 3000");
});
