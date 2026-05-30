import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  databaseURL: "https://money-saver-e0504-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);

const db = getDatabase(app);

const transactionsRef = ref(db, "transactions");

const container = document.getElementById("transactions");

onValue(transactionsRef, (snapshot) => {

  const data = snapshot.val();

  container.innerHTML = "";

  if (!data) {
    container.innerHTML = `
      <div class="empty">
        <h2>No transactions yet</h2>
      </div>
    `;
    return;
  }

  let totalReceived = 0;
  let totalSaved = 0;
  let totalSpend = 0;
  let totalGambling = 0;

  let incomeCount = 0;
  let expenseCount = 0;

  let cards = "";

  for (let id in data) {

    const item = data[id];

    const msg = item.message || "No message";

    // Extract amount
    const amountMatch = msg.match(/MK\s?([\d,]+)/i);

    const rawAmount = amountMatch
      ? amountMatch[1]
      : "0";

    const cleanAmount = rawAmount.replace(/,/g, "");

    const amount = Number(cleanAmount);

    // Savings logic
    const saveAmount = amount * 0.8;
    const spendAmount = amount * 0.2;

    totalReceived += amount;
    totalSaved += saveAmount;
    totalSpend += spendAmount;

    // Sender extraction
    const senderMatch = msg.match(/from\s(.+)/i);

    const sender = senderMatch
      ? senderMatch[1]
      : "Unknown";

    // Transaction type detection
    let type = "income";

    if (/sent/i.test(msg)) {
      type = "expense";
      expenseCount++;
    }

    else if (/betpawa|premierbet/i.test(msg)) {
      type = "gambling";
      totalGambling += amount;
    }

    else if (/airtime/i.test(msg)) {
      type = "airtime";
    }

    else {
      incomeCount++;
    }

    // Warning system
    let warning = "";

    if (type === "gambling") {
      warning = "⚠ Gambling transaction detected";
    }

    if (amount >= 100000) {
      warning += "<br>💰 Large transaction detected";
    }

    cards += `

      <div class="card ${type}">

        <div class="top">

          <div>
            <h3>${sender}</h3>
            <p class="small">${type.toUpperCase()}</p>
          </div>

          <div class="amount">
            MK ${amount.toLocaleString()}
          </div>

        </div>

        <div class="stats">

          <p>
            💾 Save:
            MK ${saveAmount.toLocaleString()}
          </p>

          <p>
            💸 Spend:
            MK ${spendAmount.toLocaleString()}
          </p>

        </div>

        <div class="message">
          ${msg}
        </div>

        <div class="warning">
          ${warning}
        </div>

      </div>

    `;
  }

  // Monthly insights
  let insight = "";

  if (totalGambling > totalSpend * 0.3) {
    insight =
      "⚠ High gambling activity detected this month.";
  }

  else if (totalSaved > totalSpend) {
    insight =
      "🔥 Excellent savings discipline this month.";
  }

  else {
    insight =
      "📈 Your finances are looking balanced.";
  }

  // Dashboard render
  container.innerHTML = `

    <div class="dashboard">

      <div class="header">
        <h1>Money Saver Dashboard</h1>
        <p class="small">
          Smart Financial Tracking System
        </p>
      </div>

      <div class="grid">

        <div class="box green">
          <h2>MK ${totalReceived.toLocaleString()}</h2>
          <p>Total Received</p>
        </div>

        <div class="box blue">
          <h2>MK ${totalSaved.toLocaleString()}</h2>
          <p>Total Saved</p>
        </div>

        <div class="box red">
          <h2>MK ${totalSpend.toLocaleString()}</h2>
          <p>Total Spendable</p>
        </div>

        <div class="box yellow">
          <h2>MK ${totalGambling.toLocaleString()}</h2>
          <p>Gambling Amount</p>
        </div>

      </div>

      <div class="insight">
        <h2>Monthly Insight</h2>
        <p>${insight}</p>
      </div>

      <div class="chart-section">

        <h2>Activity Overview</h2>

        <div class="chart">

          <div
            class="bar income-bar"
            style="width:${incomeCount * 40}px"
          >
            Income (${incomeCount})
          </div>

          <div
            class="bar expense-bar"
            style="width:${expenseCount * 40}px"
          >
            Expenses (${expenseCount})
          </div>

        </div>

      </div>

    </div>

    <div class="transactions">

      <h2>Recent Transactions</h2>

      ${cards}

    </div>

  `;

});
