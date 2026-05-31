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

console.log("📋 Service Account Project ID:", serviceAccount.project_id);
console.log("📋 Service Account Email:", serviceAccount.client_email);

let firebaseApp;
try {
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://money-saver-e0504-default-rtdb.firebaseio.com"
  });
  console.log("✅ Firebase Admin SDK initialized");
} catch (err) {
  console.error("❌ Firebase init failed:", err.message);
}

const db = admin.database();

// Track Firebase connection state
let firebaseConnected = false;

console.log("🔄 Listening for Firebase connection state...");
db.ref(".info/connected").on("value", (snapshot) => {
  if (snapshot.val() === true) {
    firebaseConnected = true;
    console.log("✅ Firebase connected at", new Date().toISOString());
  } else {
    firebaseConnected = false;
    console.log("❌ Firebase disconnected at", new Date().toISOString());
  }
}, (err) => {
  console.error("❌ Error listening to connection state:", err.message);
});

// ------------------------
// HEALTH CHECK
// ------------------------
app.get("/", (req, res) => {
  const status = firebaseConnected ? "🚀" : "⚠️";
  res.json({
    message: "💰 Money Saver Backend Running",
    firebase: firebaseConnected ? "connected" : "disconnected",
    status,
    timestamp: new Date().toISOString()
  });
});

// Firebase health check endpoint
app.get("/api/health", async (req, res) => {
  console.log("📊 Health check requested");
  try {
    const start = Date.now();
    
    console.log("🔍 Attempting to read .info/connected...");
    await Promise.race([
      db.ref(".info/connected").get(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Firebase health check timeout after 3s")), 3000)
      )
    ]);

    const duration = Date.now() - start;
    console.log(`✅ Health check passed in ${duration}ms`);
    res.json({
      firebase: "ok",
      responseTime: `${duration}ms`,
      connected: firebaseConnected,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("❌ Health check failed:", err.message);
    res.status(503).json({
      firebase: "error",
      message: err.message,
      connected: firebaseConnected,
      timestamp: new Date().toISOString()
    });
  }
});

// DEBUG: Test Firebase connectivity with detailed logging
app.get("/api/debug-firebase", async (req, res) => {
  console.log("\n=== FIREBASE DEBUG TEST ===");
  console.log("📍 Timestamp:", new Date().toISOString());
  console.log("📍 Current connection state:", firebaseConnected);
  
  try {
    console.log("🔍 Step 1: Creating test data object...");
    const testData = { 
      timestamp: Date.now(),
      test: "debug",
      serverTime: new Date().toISOString()
    };
    console.log("✅ Test data created:", testData);
    
    console.log("🔍 Step 2: Attempting to write to Firebase...");
    const startWrite = Date.now();
    
    const writePromise = db.ref("_test_connection").set(testData);
    console.log("🔄 Write promise created, waiting for completion...");
    
    await Promise.race([
      writePromise,
      new Promise((_, reject) =>
        setTimeout(() => {
          console.error("⏱️ Write timeout! Database URL: https://money-saver-e0504-default-rtdb.firebaseio.com");
          reject(new Error("Write operation timeout after 5s"));
        }, 5000)
      )
    ]);
    
    const writeDuration = Date.now() - startWrite;
    console.log(`✅ Firebase write successful in ${writeDuration}ms`);
    
    console.log("🔍 Step 3: Reading back the data...");
    const startRead = Date.now();
    const snap = await db.ref("_test_connection").get();
    const readDuration = Date.now() - startRead;
    
    console.log(`✅ Firebase read successful in ${readDuration}ms`);
    console.log("📊 Data read:", snap.val());
    
    console.log("=== TEST PASSED ===\n");
    
    res.json({ 
      success: true, 
      message: "Firebase is working!",
      written: testData,
      read: snap.val(),
      connected: firebaseConnected,
      timings: {
        write: `${writeDuration}ms`,
        read: `${readDuration}ms`
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("❌ Firebase debug error:", err.message);
    console.error("Error code:", err.code);
    console.error("Error details:", err);
    console.log("=== TEST FAILED ===\n");
    
    res.status(503).json({ 
      error: err.message, 
      code: err.code,
      connected: firebaseConnected,
      databaseURL: "https://money-saver-e0504-default-rtdb.firebaseio.com",
      tips: [
        "1. Verify Firebase Realtime Database exists at: https://console.firebase.google.com",
        "2. Check database rules allow read/write (temporarily set to public)",
        "3. Verify serviceAccountKey.json is valid and matches your Firebase project",
        "4. Check server logs above for detailed error information"
      ],
      timestamp: new Date().toISOString()
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
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log("Firebase connection status: ", firebaseConnected ? "✅ Connected" : "⏳ Connecting...");
  console.log("Database URL: https://money-saver-e0504-default-rtdb.firebaseio.com");
  console.log("Check /api/debug-firebase for diagnostics\n");
});
