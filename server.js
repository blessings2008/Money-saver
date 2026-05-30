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
  res.send("Money Saver Backend Running 🚀");
});

// ------------------------
// HASH ID (ANTI-DUPLICATE CORE)
// ------------------------
function generateTid(message) {
  return crypto.createHash("sha256").update(message).digest("hex");
}

// ------------------------
// SAVINGS RULE ENGINE (NO MANUAL APPROVAL)
// ------------------------
function calculateSavings(amount) {
  let percent = 0;
  let status = "blocked";

  if (amount >= 5000) {
    percent = 40;
    status = "autoApproved";
  } else if (amount >= 1000) {
    percent = 25;
    status = "autoDeferred";
  }

  const saveAmount = Math.floor((amount * percent) / 100);

  return { percent, saveAmount, status };
}

// ------------------------
// MAIN SMS PROCESSING ENDPOINT
// ------------------------
app.post("/api/process-sms", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    const tid = generateTid(message);

    const amountMatch = message.match(/(?:MK|MWK)\s?([\d,]+)/i);
    const amount = amountMatch
      ? Number(amountMatch[1].replace(/,/g, ""))
      : 0;

    const savings = calculateSavings(amount);

    const transaction = {
      tid,
      message,
      amount,
      saveAmount: savings.saveAmount,
      savingsPercent: savings.percent,
      savingsStatus: savings.status,
      timestamp: Date.now()
    };

    // STORE (NO DUPLICATES)
    await db.ref(`transactions/${tid}`).set(transaction);

    // AUTO TRANSFER QUEUE (ONLY IF APPROVED)
    if (savings.status === "autoApproved") {
      await db.ref(`transfers/${tid}`).set({
        tid,
        amount: savings.saveAmount,
        status: "queued",
        createdAt: Date.now()
      });
    }

    return res.json({
      success: true,
      transaction
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ------------------------
// GET ALL TRANSACTIONS
// ------------------------
app.get("/api/transactions", async (req, res) => {
  try {
    const snap = await db.ref("transactions").get();
    res.json(snap.val() || {});
  } catch (err) {
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
app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
