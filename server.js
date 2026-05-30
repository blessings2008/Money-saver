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

// Track Firebase connection state
let firebaseConnected = false;

db.ref(".info/connected").on("value", (snapshot) => {
  if (snapshot.val() === true) {
    firebaseConnected = true;
    console.log("✅ Firebase connected");
  } else {
    firebaseConnected = false;
    console.log("❌ Firebase disconnected");
  }
});

// ------------------------
// HEALTH CHECK
// ------------------------
app.get("/", (req, res) => {
  const status = firebaseConnected ? "🚀" : "⚠️";
  res.json({
    message: "💰 Money Saver Backend Running",
    firebase: firebaseConnected ? "connected" : "disconnected",
    status
  });
});

// Firebase health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    const start = Date.now();
    
    await Promise.race([
      db.ref(".info/connected").get(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Firebase health check timeout")), 3000)
      )
    ]);

    const duration = Date.now() - start;
    res.json({
      firebase: "ok",
      responseTime: `${duration}ms`,
      connected: firebaseConnected
    });
  } catch (err) {
    res.status(503).json({
      firebase: "error",
      message: err.message,
      connected: firebaseConnected
    });
  }
});

// ------------------------
// GENERATE UNIQUE ID (ANTI DUPLICATE)
// ------------------------
function generateTid(message) {
  return crypto.createHash("sha256").update(message).digest("hex");
}

// Helper function to retry Firebase operations
async function firebaseRetry(operation, maxRetries = 2, timeout = 5000) {
  let lastError;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      console.log(`🔄 Firebase operation attempt ${i + 1}/${maxRetries + 1}`);
      
      const result = await Promise.race([
        operation(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Firebase operation timeout")), timeout)
        )
      ]);
      
      console.log(`✅ Firebase operation succeeded on attempt ${i + 1}`);
      return result;
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Attempt ${i + 1} failed:`, err.message);
      
      if (i < maxRetries) {
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 500));
      }
    }
  }
  
  throw lastError;
}

// ------------------------
// GET ALL TRANSACTIONS (WITH RETRY)
// ------------------------
app.get("/api/transactions", async (req, res) => {
  try {
    const snap = await firebaseRetry(
      () => db.ref("transactions").get(),
      2,
      6000
    );

    res.json(snap.val() || {});
  } catch (err) {
    console.error("❌ /api/transactions error:", err.message);
    res.status(503).json({
      error: err.message,
      message: "Firebase is not responding. Please try again in a moment.",
      firebase: firebaseConnected
    });
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

    if (!firebaseConnected) {
      return res.status(503).json({
        error: "Firebase not connected",
        message: "Server is not ready. Please try again shortly."
      });
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

    // STORE IN FIREBASE WITH RETRY
    await firebaseRetry(
      () => db.ref(`transactions/${tid}`).set(transaction),
      2,
      6000
    );

    // AUTO TRANSFER QUEUE
    if (savingsStatus === "autoApproved") {
      await firebaseRetry(
        () => db.ref(`transfers/${tid}`).set({
          tid,
          amount: saveAmount,
          status: "queued",
          createdAt: Date.now()
        }),
        1,
        5000
      ).catch(err => {
        console.warn("⚠️ Transfer queue write failed:", err.message);
        // Don't fail the entire request if transfer queue fails
      });
    }

    res.json({
      success: true,
      transaction
    });

  } catch (err) {
    console.error("❌ /api/process-sms error:", err.message);
    res.status(503).json({
      error: err.message,
      message: "Failed to process SMS. Firebase may be unavailable."
    });
  }
});

// ------------------------
// GET TRANSFERS
// ------------------------
app.get("/api/transfers", async (req, res) => {
  try {
    const snap = await firebaseRetry(
      () => db.ref("transfers").get(),
      2,
      6000
    );

    res.json(snap.val() || {});
  } catch (err) {
    console.error("❌ /api/transfers error:", err.message);
    res.status(503).json({
      error: err.message,
      firebase: firebaseConnected
    });
  }
});

// ------------------------
// SERVER START (RENDER SAFE)
// ------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("Firebase connection status: ", firebaseConnected ? "✅ Connected" : "⏳ Connecting...");
});
