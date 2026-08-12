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
const chalk = require("chalk");

const config = require("../config");

let globalSock = null;
let reconnectTimer = null;
let starting = false;

/**
 * Start Abel-MD WhatsApp client
 */
async function startAbel() {
  /*
   * Prevent multiple sockets from being created
   * at the same time.
   */
  if (starting) {
    return globalSock;
  }

  starting = true;

  try {
    const sessionPath = path.resolve(
      config.SESSION_DIR || "./session"
    );

    await fs.ensureDir(sessionPath);

    console.log(
      chalk.cyan(
        `Loading WhatsApp session from: ${sessionPath}`
      )
    );

    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(sessionPath);

    /*
     * Get the latest Baileys version.
     */
    const {
      version
    } = await fetchLatestBaileysVersion();

    console.log(
      chalk.gray(
        `Baileys version: ${version.join(".")}`
      )
    );

    /*
     * Create WhatsApp socket.
     */
    const sock = makeWASocket({
      version,

      logger: pino({
        level: "silent"
      }),

      printQRInTerminal: false,

      auth: {
        creds: state.creds,

        keys: makeCacheableSignalKeyStore(
          state.keys,
          pino({
            level: "silent"
          })
        )
      },

      browser: Browsers.ubuntu(
        "Chrome"
      ),

      syncFullHistory: false,

      markOnlineOnConnect: false,

      generateHighQualityLinkPreview: true,

      /*
       * Used by Baileys when it needs
       * to retrieve a previous message.
       */
      getMessage: async () => {
        return undefined;
      }
    });

    /*
     * IMPORTANT:
     * Store the socket globally so /api/pair
     * and other parts of the application can
     * access the same socket.
     */
    globalSock = sock;

    /*
     * Save authentication credentials whenever
     * Baileys changes them.
     */
    sock.ev.on(
      "creds.update",
      saveCreds
    );

    /*
     * Connection events.
     */
    sock.ev.on(
      "connection.update",
      async (update) => {
        const {
          connection,
          lastDisconnect,
          qr
        } = update;

        /*
         * QR is disabled for pairing, but Baileys
         * may still emit one.
         */
        if (qr) {
          console.log(
            chalk.yellow(
              "QR received. Use the Pairing Code from the website."
            )
          );
        }

        /*
         * Connected.
         */
        if (connection === "open") {
          console.log(
            chalk.green(
              "\n✅ Abel-MD connected successfully!\n"
            )
          );

          starting = false;

          /*
           * Notify owner.
           */
          try {
            if (config.OWNER_NUMBER) {
              let ownerNumber =
                String(
                  config.OWNER_NUMBER
                ).replace(/\D/g, "");

              if (
                ownerNumber.startsWith("0")
              ) {
                const countryCode =
                  config.COUNTRY_CODE ||
                  "256";

                ownerNumber =
                  countryCode +
                  ownerNumber.substring(1);
              }

              const ownerJid =
                ownerNumber +
                "@s.whatsapp.net";

              await sock.sendMessage(
                ownerJid,
                {
                  text:
                    `✨ *${config.BOT_NAME}* is now online!\n\n` +
                    `Prefix: ${config.PREFIX || "."}`
                }
              );
            }
          } catch (error) {
            console.log(
              chalk.gray(
                "Could not send owner online notification."
              )
            );
          }

          return;
        }

        /*
         * Connecting.
         */
        if (connection === "connecting") {
          console.log(
            chalk.yellow(
              "Connecting to WhatsApp..."
            )
          );

          return;
        }

        /*
         * Connection closed.
         */
        if (connection === "close") {
          starting = false;

          /*
           * Extract disconnect code safely.
           */
          const statusCode =
            lastDisconnect?.error?.output
              ?.statusCode;

          const loggedOut =
            statusCode ===
            DisconnectReason.loggedOut;

          const connectionReplaced =
            statusCode ===
            DisconnectReason.connectionReplaced;

          console.log(
            chalk.red(
              `WhatsApp connection closed. Code: ${statusCode || "unknown"}`
            )
          );

          /*
           * Don't keep using a dead socket.
           */
          if (
            globalSock === sock
          ) {
            globalSock = null;
          }

          /*
           * Logged out.
           */
          if (loggedOut) {
            console.log(
              chalk.red(
                "❌ WhatsApp session was logged out."
              )
            );

            console.log(
              chalk.yellow(
                `Delete the session directory and pair again: ${
                  config.SESSION_DIR || "./session"
                }`
              )
            );

            return;
          }

          /*
           * Another device replaced this connection.
           */
          if (connectionReplaced) {
            console.log(
              chalk.red(
                "⚠️ WhatsApp connection was replaced by another session."
              )
            );

            return;
          }

          /*
           * Prevent multiple reconnect timers.
           */
          if (reconnectTimer) {
            return;
          }

          console.log(
            chalk.yellow(
              "🔄 Reconnecting in 5 seconds..."
            )
          );

          reconnectTimer =
            setTimeout(
              async () => {
                reconnectTimer = null;

                try {
                  await startAbel();
                } catch (error) {
                  console.error(
                    chalk.red(
                      "Reconnect error:"
                    ),
                    error
                  );
                }
              },
              5000
            );
        }
      }
    );

    /*
     * Return the SAME socket that was stored
     * in globalSock.
     */
    return sock;

  } catch (error) {
    starting = false;

    globalSock = null;

    console.error(
      chalk.red(
        "Failed to start Abel-MD:"
      ),
      error
    );

    throw error;
  }
}

/**
 * Return the current WhatsApp socket.
 */
function getSock() {
  return globalSock;
}

/**
 * Check whether WhatsApp is currently connected.
 */
function isConnected() {
  return !!globalSock;
}

/**
 * Clear the current socket reference.
 */
function clearSock() {
  globalSock = null;
}

/*
 * Export everything once.
 */
module.exports = {
  startAbel,
  getSock,
  isConnected,
  clearSock
};