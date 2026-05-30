const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());

// ------------------------
// FIREBASE INIT
// ------------------------
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://money-saver-e0504-default-rtdb.firebaseio.com"
});

const db = admin.database();

// ------------------------
// HEALTH CHECK
// ------------------------
app.get("/", (req, res) => {
  res.send("💰 Money Saver Backend Running 🚀");
});

// ------------------------
// GENERATE UNIQUE ID (ANTI DUPLICATE)
// ------------------------
function generateTid(message) {
  return crypto.createHash("sha256").update(message).digest("hex");
}

// ------------------------
// GET ALL TRANSACTIONS (FIXED + NO HANG)
// ------------------------
app.get("/api/transactions", async (req, res) => {
  try {
    const ref = db.ref("transactions");

    const snap = await Promise.race([
      ref.get(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Firebase timeout")), 8000)
      )
    ]);

    res.json(snap.val() || {});
  } catch (err) {
    console.log("❌ /api/transactions error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------
// PROCESS SMS / TRANSACTION ENGINE
// ------------------------
app.post("/api/process-sms", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    const tid = generateTid(message);

    // Extract amount (basic parser)
    const amountMatch = message.match(/(?:MK|MWK)\s?([\d,]+)/i);
    const amount = amountMatch
      ? Number(amountMatch[1].replace(/,/g, ""))
      : 0;

    // Simple savings logic
    let saveAmount = 0;
    let savingsStatus = "blocked";

    if (amount >= 5000) {
      saveAmount = Math.floor(amount * 0.4);
      savingsStatus = "autoApproved";
    } else if (amount >= 1000) {
      saveAmount = Math.floor(amount * 0.25);
      savingsStatus = "autoDeferred";
    }

    const transaction = {
      tid,
      message,
      amount,
      saveAmount,
      savingsStatus,
      timestamp: Date.now()
    };

    // STORE IN FIREBASE (NO DUPLICATES)
    await db.ref(`transactions/${tid}`).set(transaction);

    // AUTO TRANSFER QUEUE
    if (savingsStatus === "autoApproved") {
      await db.ref(`transfers/${tid}`).set({
        tid,
        amount: saveAmount,
        status: "queued",
        createdAt: Date.now()
      });
    }

    res.json({
      success: true,
      transaction
    });

  } catch (err) {
    console.log("❌ process-sms error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------
// GET TRANSFERS
// ------------------------
app.get("/api/transfers", async (req, res) => {
  try {
    const snap = await db.ref("transfers").get();
    res.json(snap.val() || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------
// SERVER START (RENDER SAFE)
// ------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
