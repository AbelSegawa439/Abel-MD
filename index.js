/**
 * ═══════════════════════════════════════
 *          A B E L - M D
 * ═══════════════════════════════════════
 *  Clean WhatsApp Multi-Device Bot
 *  Created by AbelSegawa439
 *  GitHub: https://github.com/AbelSegawa439
 * ═══════════════════════════════════════
 */

const express = require("express");
const cors = require("cors");
const path = require("path");
const chalk = require("chalk");
const config = require("./config");
const { startAbel } = require("./lib/client");
const { loadPlugins, handleMessage } = require("./lib/message");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let sock = null;

// Landing page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Pairing page
app.get("/pair", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "pair.html"));
});

// API to generate pairing code
app.post("/api/pair", async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) {
      return res.status(400).json({ error: "Number is required" });
    }

    let phone = number.replace(/\D/g, "");

    if (!sock) {
      return res.status(503).json({ error: "Bot is starting, try again in a few seconds" });
    }

    if (sock.authState?.creds?.registered) {
      return res.json({
        success: true,
        message: "Bot is already paired and connected.",
        alreadyPaired: true
      });
    }

    const code = await sock.requestPairingCode(phone);
    console.log(chalk.green(`Pairing code generated for ${phone}: ${code}`));

    res.json({
      success: true,
      code: code,
      message: "Enter this code in WhatsApp → Linked Devices → Link with phone number"
    });
  } catch (err) {
    console.error("Pair error:", err.message);
    res.status(500).json({ error: err.message || "Failed to generate pairing code" });
  }
});

app.get("/status", (req, res) => {
  res.json({
    bot: config.BOT_NAME,
    status: sock ? "running" : "starting",
    owner: config.OWNER_NAME
  });
});

async function main() {
  console.log(chalk.cyan(`\n🚀 Starting ${config.BOT_NAME}...\n`));

  loadPlugins();

  sock = await startAbel();

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      if (m.key.fromMe) continue;
      await handleMessage(sock, m);
    }
  });

  const port = config.PORT;
  app.listen(port, () => {
    console.log(chalk.green(`🌐 Pairing site running on port ${port}`));
    console.log(chalk.yellow(`   Local:  http://localhost:${port}`));
    console.log(chalk.yellow(`   Pair:   http://localhost:${port}/pair\n`));
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});