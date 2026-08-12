const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
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
let pairingRequest = null;

/*
 * Current connection state.
 */
let connectionState = {
  status: "starting",
  connected: false,
  paired: false,
  lastError: null
};


/* =========================================================
   HELPERS
========================================================= */

function getSock() {
  return globalSock;
}

function isConnected() {
  return !!globalSock;
}

function getConnectionState() {
  return {
    ...connectionState
  };
}

function normalizeNumber(number) {
  let phone = String(number || "")
    .replace(/\D/g, "");

  /*
   * Convert local Ugandan numbers:
   * 07XXXXXXXX
   * -> 2567XXXXXXXX
   */
  if (phone.startsWith("0")) {
    phone =
      (config.COUNTRY_CODE || "256") +
      phone.substring(1);
  }

  /*
   * Remove 00 international prefix.
   */
  if (phone.startsWith("00")) {
    phone = phone.substring(2);
  }

  if (phone.length < 8) {
    throw new Error(
      "Invalid phone number."
    );
  }

  return phone;
}

function isLoggedOut(statusCode) {
  return (
    statusCode ===
    DisconnectReason.loggedOut
  );
}


/* =========================================================
   CREATE SOCKET
========================================================= */

async function createSocket() {
  const sessionPath = path.resolve(
    config.SESSION_DIR || "./session"
  );

  await fs.ensureDir(
    sessionPath
  );

  console.log(
    chalk.cyan(
      `Loading WhatsApp session from: ${sessionPath}`
    )
  );

  const {
    state,
    saveCreds
  } = await useMultiFileAuthState(
    sessionPath
  );

  /*
   * IMPORTANT:
   *
   * We deliberately do not call
   * fetchLatestBaileysVersion().
   *
   * Automatically following the newest
   * WhatsApp Web version can make pairing
   * unstable when Baileys/WhatsApp versions
   * temporarily disagree.
   *
   * Baileys will use its compatible default.
   */

  const sock = makeWASocket({
    auth: state,

    logger: pino({
      level:
        config.LOG_LEVEL ||
        "silent"
    }),

    /*
     * REQUIRED for pairing-code mode.
     */
    printQRInTerminal: false,

    browser:
      Browsers.ubuntu(
        "Abel-MD"
      ),

    syncFullHistory: false,

    markOnlineOnConnect: false,

    generateHighQualityLinkPreview: true,

    connectTimeoutMs: 60000,

    defaultQueryTimeoutMs: 60000,

    keepAliveIntervalMs: 15000,

    retryRequestDelayMs: 5000,

    getMessage: async () => {
      return undefined;
    }
  });

  globalSock = sock;

  /*
   * Save credentials.
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

      if (qr) {
        console.log(
          chalk.gray(
            "WhatsApp emitted a QR reference; pairing-code mode is being used."
          )
        );
      }

      if (
        connection ===
        "connecting"
      ) {
        connectionState = {
          ...connectionState,
          status: "connecting",
          connected: false
        };

        console.log(
          chalk.yellow(
            "Connecting to WhatsApp..."
          )
        );
      }

      if (
        connection ===
        "open"
      ) {
        connectionState = {
          ...connectionState,
          status: "connected",
          connected: true,
          paired:
            !!sock.authState?.creds
              ?.registered,
          lastError: null
        };

        starting = false;

        console.log(
          chalk.green(
            "\n✅ Abel-MD connected successfully!\n"
          )
        );

        /*
         * Notify owner only after a
         * successful connection.
         */
        try {
          if (
            config.OWNER_NUMBER
          ) {
            let owner =
              normalizeNumber(
                config.OWNER_NUMBER
              );

            await sock.sendMessage(
              `${owner}@s.whatsapp.net`,
              {
                text:
                  `✨ *${config.BOT_NAME}* is now online!\n\n` +
                  `Prefix: ${config.PREFIX}`
              }
            );
          }
        } catch (error) {
          console.log(
            chalk.gray(
              "Owner notification could not be sent."
            )
          );
        }

        return;
      }

      if (
        connection ===
        "close"
      ) {
        starting = false;

        const statusCode =
          lastDisconnect
            ?.error
            ?.output
            ?.statusCode;

        connectionState = {
          ...connectionState,
          status:
            isLoggedOut(
              statusCode
            )
              ? "logged_out"
              : "disconnected",
          connected: false,
          lastError:
            statusCode
              ? `Connection closed: ${statusCode}`
              : "Connection closed"
        };

        /*
         * Don't leave a dead socket
         * available to /api/pair.
         */
        if (
          globalSock === sock
        ) {
          globalSock = null;
        }

        console.log(
          chalk.red(
            `WhatsApp connection closed. Code: ${
              statusCode || "unknown"
            }`
          )
        );

        /*
         * Logged out means the credentials
         * are no longer usable.
         */
        if (
          isLoggedOut(
            statusCode
          )
        ) {
          console.log(
            chalk.red(
              "❌ WhatsApp session logged out."
            )
          );

          connectionState = {
            ...connectionState,
            status: "logged_out",
            paired: false
          };

          return;
        }

        /*
         * Don't automatically create an
         * endless unregistered QR session.
         *
         * For an unpaired socket, the next
         * /api/pair request creates a fresh
         * socket.
         */
        if (
          !sock.authState?.creds
            ?.registered
        ) {
          console.log(
            chalk.yellow(
              "Unpaired socket closed. Waiting for the next pairing request."
            )
          );

          return;
        }

        /*
         * Registered sessions reconnect.
         */
        if (
          reconnectTimer
        ) {
          return;
        }

        reconnectTimer =
          setTimeout(
            async () => {
              reconnectTimer =
                null;

              try {
                await startAbel();
              } catch (error) {
                console.error(
                  chalk.red(
                    "Reconnect failed:"
                  ),
                  error
                );
              }
            },
            config.RECONNECT_DELAY ||
              5000
          );
      }
    }
  );

  return sock;
}


/* =========================================================
   START NORMAL BOT
========================================================= */

async function startAbel() {
  if (starting) {
    return globalSock;
  }

  /*
   * If an existing connected socket
   * already exists, reuse it.
   */
  if (
    globalSock &&
    connectionState.connected
  ) {
    return globalSock;
  }

  starting = true;

  try {
    const sock =
      await createSocket();

    return sock;

  } catch (error) {
    starting = false;
    globalSock = null;

    connectionState = {
      ...connectionState,
      status: "error",
      connected: false,
      lastError:
        error.message
    };

    throw error;
  }
}


/* =========================================================
   REQUEST PAIRING CODE
========================================================= */

async function requestPairingCode(
  number
) {
  /*
   * Prevent simultaneous requests.
   */
  if (pairingRequest) {
    return pairingRequest;
  }

  pairingRequest =
    (async () => {
      const phone =
        normalizeNumber(
          number
        );

      /*
       * Existing registered account
       * should not request another code.
       */
      if (
        globalSock
          ?.authState
          ?.creds
          ?.registered
      ) {
        throw new Error(
          "This bot is already paired."
        );
      }

      /*
       * Remove an old dead socket.
       */
      if (
        globalSock &&
        !connectionState.connected &&
        connectionState.status ===
          "disconnected"
      ) {
        globalSock = null;
      }

      /*
       * Create a fresh socket specifically
       * for pairing.
       */
      if (!globalSock) {
        console.log(
          chalk.cyan(
            "Creating fresh pairing socket..."
          )
        );

        await createSocket();
      }

      const sock =
        globalSock;

      if (!sock) {
        throw new Error(
          "WhatsApp socket could not be created."
        );
      }

      if (
        sock.authState
          ?.creds
          ?.registered
      ) {
        throw new Error(
          "This bot is already paired."
        );
      }

      /*
       * Give the WebSocket a moment to
       * complete its initial handshake.
       *
       * This is important because calling
       * requestPairingCode() against a socket
       * that has not initialized can result
       * in 428 Connection Closed.
       */
      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            2000
          )
      );

      /*
       * Check again before requesting.
       */
      if (
        globalSock !== sock
      ) {
        throw new Error(
          "WhatsApp socket changed during pairing. Try again."
        );
      }

      if (
        typeof sock.requestPairingCode !==
        "function"
      ) {
        throw new Error(
          "Pairing-code support is unavailable."
        );
      }

      console.log(
        chalk.cyan(
          `Requesting pairing code for ${phone}`
        )
      );

      /*
       * Request code.
       */
      const code =
        await sock.requestPairingCode(
          phone
        );

      connectionState = {
        ...connectionState,
        status:
          "waiting_for_pairing",
        paired: false,
        lastError: null
      };

      console.log(
        chalk.green(
          `🔗 Pairing code generated: ${code}`
        )
      );

      return code;
    })();

  try {
    return await pairingRequest;
  } finally {
    pairingRequest =
      null;
  }
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  startAbel,
  getSock,
  isConnected,
  getConnectionState,
  requestPairingCode
};