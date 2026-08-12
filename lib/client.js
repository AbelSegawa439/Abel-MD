const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs-extra");
const path = require("path");
const config = require("../config");
const chalk = require("chalk");

let globalSock = null;

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
    browser: Browsers.ubuntu("Chrome"),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: true,
    getMessage: async () => undefined
  });

  globalSock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(chalk.yellow("QR received - prefer using Pairing Code from the website"));
    }

    if (connection === "open") {
      console.log(chalk.green("\n✅ Abel-MD connected successfully!\n"));
      try {
        const ownerJid = config.OWNER_NUMBER + "@s.whatsapp.net";
        await sock.sendMessage(ownerJid, {
          text: `✨ *${config.BOT_NAME}* is now online!\n\nPrefix: ${config.PREFIX}`
        });
      } catch (e) {}
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(chalk.red("Connection closed:", statusCode));

      if (shouldReconnect) {
        console.log(chalk.yellow("Reconnecting in 5s..."));
        setTimeout(() => startAbel(), 5000);
      } else {
        console.log(chalk.red("Logged out. Delete session folder."));
      }
    }
  });

  return sock;
}

function getSock() {
  return globalSock;
}

module.exports = { startAbel, getSock };