/**
 * ═══════════════════════════════════════
 *          A B E L - M D
 * ═══════════════════════════════════════
 *  Clean WhatsApp Multi-Device Bot
 *  Created by AbelSegawa439
 * ═══════════════════════════════════════
 */

const express = require("express");
const cors = require("cors");
const path = require("path");
const chalk = require("chalk");

const config = require("./config");
const {
  startAbel,
  getSock
} = require("./lib/client");

const {
  loadPlugins,
  handleMessage
} = require("./lib/message");

const app = express();

/* =========================================================
   EXPRESS CONFIG
========================================================= */

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

/* =========================================================
   BOT STATE
========================================================= */

let sock = null;

let botState = {
  status: "starting",
  connected: false,
  pairing: false,
  paired: false,
  lastConnectionUpdate: null,
  lastError: null,
  startedAt: Date.now()
};

/* Prevent multiple pairing requests */
let pairingInProgress = false;

/* Simple cooldown */
let lastPairRequest = 0;

const PAIR_COOLDOWN = 10000;

/* =========================================================
   HELPERS
========================================================= */

function updateState(values = {}) {
  botState = {
    ...botState,
    ...values,
    lastConnectionUpdate: new Date().toISOString()
  };
}

function getCurrentSocket() {
  return sock || getSock();
}

function cleanPhoneNumber(number) {
  if (!number) {
    throw new Error("Phone number is required");
  }

  let phone = String(number).trim();

  /*
   * Remove spaces, +, -, brackets and other characters.
   */
  phone = phone.replace(/\D/g, "");

  /*
   * Uganda example:
   * 0700000000 -> 256700000000
   *
   * But don't blindly add 256 to every number.
   */

  if (phone.startsWith("00")) {
    phone = phone.substring(2);
  }

  if (phone.startsWith("0")) {
    /*
     * Default Uganda handling.
     * Change this if your bot is intended for another country.
     */
    const countryCode =
      config.COUNTRY_CODE || "256";

    phone =
      countryCode +
      phone.substring(1);
  }

  /*
   * WhatsApp pairing numbers should normally
   * be international numbers.
   */
  if (phone.length < 8) {
    throw new Error("Invalid phone number");
  }

  return phone;
}

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    bot: config.BOT_NAME,
    connected: botState.connected,
    paired: botState.paired,
    uptime: Math.floor(
      (Date.now() - botState.startedAt) / 1000
    )
  });
});

/* =========================================================
   HOME
========================================================= */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

/* =========================================================
   PAIR PAGE
========================================================= */

app.get("/pair", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "pair.html"
    )
  );
});

/* =========================================================
   BOT STATUS API
========================================================= */

app.get("/status", (req, res) => {
  const currentSock = getCurrentSocket();

  const registered =
    currentSock?.authState?.creds?.registered === true;

  res.json({
    bot: config.BOT_NAME,
    owner: config.OWNER_NAME,

    status: botState.status,

    connected: botState.connected,

    paired:
      registered ||
      botState.paired,

    pairing:
      pairingInProgress,

    uptime:
      Math.floor(
        (Date.now() - botState.startedAt) / 1000
      ),

    lastConnectionUpdate:
      botState.lastConnectionUpdate,

    lastError:
      botState.lastError
  });
});

/* =========================================================
   PAIRING API
========================================================= */

app.post("/api/pair", async (req, res) => {
  try {

    /*
     * Prevent accidental simultaneous requests.
     */
    if (pairingInProgress) {
      return res.status(429).json({
        success: false,
        error:
          "A pairing request is already being processed."
      });
    }

    /*
     * Cooldown.
     */
    const now = Date.now();

    if (
      now - lastPairRequest <
      PAIR_COOLDOWN
    ) {
      const remaining =
        Math.ceil(
          (PAIR_COOLDOWN -
            (now - lastPairRequest)) /
            1000
        );

      return res.status(429).json({
        success: false,
        error:
          `Please wait ${remaining} seconds before requesting another code.`
      });
    }

    const { number } = req.body || {};

    if (!number) {
      return res.status(400).json({
        success: false,
        error: "Number is required."
      });
    }

    const phone =
      cleanPhoneNumber(number);

    console.log(
      chalk.cyan(
        `Pair request received for ${phone}`
      )
    );

    const currentSock =
      getCurrentSocket();

    /*
     * Bot must have a socket before pairing.
     */
    if (!currentSock) {
      return res.status(503).json({
        success: false,
        error:
          "WhatsApp client is still starting. Please wait a few seconds and try again."
      });
    }

    /*
     * Check whether account is already paired.
     */
    if (
      currentSock.authState?.creds?.registered
    ) {

      updateState({
        paired: true
      });

      return res.json({
        success: true,
        alreadyPaired: true,
        message:
          "This bot is already paired."
      });
    }

    /*
     * Make sure pairing method exists.
     */
    if (
      typeof currentSock.requestPairingCode !==
      "function"
    ) {
      return res.status(503).json({
        success: false,
        error:
          "Pairing-code support is not available in the current Baileys client."
      });
    }

    pairingInProgress = true;
    lastPairRequest = now;

    updateState({
      status: "pairing",
      pairing: true,
      lastError: null
    });

    /*
     * Request WhatsApp pairing code.
     */
    const code =
      await currentSock.requestPairingCode(
        phone
      );

    console.log(
      chalk.green(
        `Pairing code generated: ${code}`
      )
    );

    updateState({
      status: "waiting_for_pairing",
      pairing: true
    });

    return res.json({
      success: true,

      code,

      phone,

      expiresIn: 60,

      message:
        "Pairing code generated. Enter it in WhatsApp quickly."
    });

  } catch (err) {

    console.error(
      chalk.red("Pairing error:"),
      err
    );

    updateState({
      status: "error",
      lastError:
        err.message || "Pairing failed"
    });

    return res.status(500).json({
      success: false,
      error:
        err.message ||
        "Failed to generate pairing code."
    });

  } finally {

    pairingInProgress = false;

    updateState({
      pairing: false
    });
  }
});

/* =========================================================
   BOT INFORMATION
========================================================= */

app.get("/api/info", (req, res) => {

  res.json({
    name: config.BOT_NAME,
    owner: config.OWNER_NAME,

    platform: "WhatsApp",

    mode: "Multi-Device",

    status: botState.status,

    connected:
      botState.connected,

    paired:
      botState.paired,

    uptime:
      Math.floor(
        (Date.now() - botState.startedAt) /
          1000
      )
  });
});

/* =========================================================
   WHATSAPP EVENT SETUP
========================================================= */

function setupSocketEvents(client) {

  if (!client || !client.ev) {
    throw new Error(
      "Invalid WhatsApp socket returned by startAbel()"
    );
  }

  /*
   * Connection updates
   */
  client.ev.on(
    "connection.update",
    async (update) => {

      const {
        connection,
        lastDisconnect
      } = update;

      console.log(
        chalk.blue(
          "WhatsApp connection:",
          connection || "update"
        )
      );

      if (connection === "connecting") {

        updateState({
          status: "connecting",
          connected: false
        });
      }

      if (connection === "open") {

        updateState({
          status: "connected",
          connected: true,
          paired: true,
          lastError: null
        });

        console.log(
          chalk.green(
            "\n✓ WhatsApp connected successfully\n"
          )
        );
      }

      if (connection === "close") {

        updateState({
          status: "disconnected",
          connected: false
        });

        console.log(
          chalk.yellow(
            "\nWhatsApp connection closed."
          )
        );

        if (lastDisconnect) {
          console.log(
            chalk.gray(
              "Disconnect information:",
              lastDisconnect
            )
          );
        }
      }
    }
  );

  /*
   * Incoming messages
   */
  client.ev.on(
    "messages.upsert",
    async ({ messages, type }) => {

      if (type !== "notify") {
        return;
      }

      for (const message of messages) {

        try {

          if (!message) {
            continue;
          }

          /*
           * Ignore messages sent by the bot itself.
           */
          if (message.key?.fromMe) {
            continue;
          }

          await handleMessage(
            client,
            message
          );

        } catch (error) {

          console.error(
            chalk.red(
              "Message handling error:"
            ),
            error
          );
        }
      }
    }
  );
}

/* =========================================================
   START BOT
========================================================= */

async function startBot() {

  try {

    console.log(
      chalk.cyan(
        "\nStarting WhatsApp connection..."
      )
    );

    updateState({
      status: "starting",
      connected: false
    });

    const client =
      await startAbel();

    if (!client) {
      throw new Error(
        "startAbel() did not return a WhatsApp socket."
      );
    }

    sock = client;

    setupSocketEvents(client);

    /*
     * Detect already-paired account.
     */
    if (
      client.authState?.creds?.registered
    ) {

      updateState({
        paired: true
      });

      console.log(
        chalk.green(
          "Existing WhatsApp session detected."
        )
      );
    }

    console.log(
      chalk.green(
        "WhatsApp client initialized."
      )
    );

  } catch (error) {

    console.error(
      chalk.red(
        "\nBaileys start error:"
      ),
      error
    );

    updateState({
      status: "error",
      connected: false,
      lastError:
        error.message ||
        "WhatsApp startup failed"
    });

    /*
     * Retry after 10 seconds.
     */
    console.log(
      chalk.yellow(
        "Retrying WhatsApp connection in 10 seconds..."
      )
    );

    setTimeout(
      startBot,
      10000
    );
  }
}

/* =========================================================
   EXPRESS + PLUGINS + BOT
========================================================= */

async function main() {

  const port =
    process.env.PORT ||
    config.PORT ||
    3000;

  /*
   * Start HTTP server immediately.
   * Important for Railway.
   */
  app.listen(
    port,
    "0.0.0.0",
    () => {

      console.log(
        chalk.green(
          `\n🌐 Server running on port ${port}`
        )
      );

      console.log(
        chalk.yellow(
          `   Home: /`
        )
      );

      console.log(
        chalk.yellow(
          `   Pair: /pair`
        )
      );

      console.log(
        chalk.yellow(
          `   Status: /status`
        )
      );

      console.log(
        chalk.yellow(
          `   Health: /health\n`
        )
      );
    }
  );

  /*
   * Load plugins before messages arrive.
   */
  try {

    loadPlugins();

    console.log(
      chalk.green(
        "✓ Plugins loaded"
      )
    );

  } catch (error) {

    console.error(
      chalk.red(
        "Plugin loading error:"
      ),
      error
    );
  }

  /*
   * Start WhatsApp after HTTP server.
   */
  setTimeout(
    startBot,
    2500
  );
}

/* =========================================================
   GLOBAL ERROR HANDLING
========================================================= */

process.on(
  "unhandledRejection",
  (error) => {

    console.error(
      chalk.red(
        "Unhandled promise rejection:"
      ),
      error
    );
  }
);

process.on(
  "uncaughtException",
  (error) => {

    console.error(
      chalk.red(
        "Uncaught exception:"
      ),
      error
    );
  }
);

/* =========================================================
   START APPLICATION
========================================================= */

main().catch(
  (error) => {

    console.error(
      chalk.red(
        "Fatal application error:"
      ),
      error
    );

    process.exit(1);
  }
);