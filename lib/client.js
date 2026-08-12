const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const fs = require("fs-extra");
const path = require("path");
const config = require("../config");
const chalk = require("chalk");

async function startAbel() {
  const sessionPath = path.resolve(config.SESSION_DIR);
  await fs.ensureDir(sessionPath);

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
    },
    browser: Browsers.macOS("Desktop"),
    syncFullHistory: false,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(chalk.yellow("\n📱 Scan this QR code with WhatsApp:\n"));
      qrcode.generate(qr, { small: true });
      console.log(chalk.cyan("\nOr use pairing code method from the web panel.\n"));
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(chalk.red("Connection closed. Status:"), statusCode);

      if (shouldReconnect) {
        console.log(chalk.yellow("Reconnecting..."));
        setTimeout(() => startAbel(), 3000);
      } else {
        console.log(chalk.red("Logged out. Delete session folder and restart."));
      }
    }

    if (connection === "open") {
      console.log(chalk.green("\n✅ Abel-MD connected successfully!\n"));
      try {
        const ownerJid = config.OWNER_NUMBER + "@s.whatsapp.net";
        await sock.sendMessage(ownerJid, {
          text: `✨ *${config.BOT_NAME}* is now online!\n\nPrefix: ${config.PREFIX}\nOwner: ${config.OWNER_NAME}`
        });
      } catch (e) {}
    }
  });

  return sock;
}

module.exports = { startAbel };