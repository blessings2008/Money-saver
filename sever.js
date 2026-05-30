const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

// Firebase Admin (server-side only)
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://money-saver-e0504-default-rtdb.firebaseio.com"
});

const db = admin.database();

/* ----------------------------
   ADD TRANSACTION (RULE ENGINE)
-----------------------------*/
app.post("/transaction", async (req, res) => {
  const { network, amount, status } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  const transaction = {
    network, // TNM or Airtel
    amount,
    status: status || "pending",
    timestamp: Date.now()
  };

  const ref = db.ref("transactions").push();
  await ref.set(transaction);

  res.json({ success: true, id: ref.key });
});

/* ----------------------------
   APPROVE TRANSACTION
-----------------------------*/
app.post("/approve", async (req, res) => {
  const { id } = req.body;

  const ref = db.ref(`transactions/${id}`);
  const snap = await ref.get();

  if (!snap.exists()) {
    return res.status(404).json({ error: "Not found" });
  }

  const data = snap.val();

  await ref.update({ status: "approved" });

  res.json({ success: true, data });
});

/* ----------------------------
   GET BALANCE (ONLY APPROVED)
-----------------------------*/
app.get("/balance", async (req, res) => {
  const snap = await db.ref("transactions").get();
  const data = snap.val() || {};

  let balance = 0;

  Object.values(data).forEach(tx => {
    if (tx.status === "approved") {
      balance += Number(tx.amount);
    }
  });

  res.json({ balance });
});

app.listen(3000, () => {
  console.log("Backend running on port 3000");
});
