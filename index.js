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
  getSock,
  requestPairingCode,
  getConnectionState
} = require("./lib/client");

const {
  loadPlugins,
  handleMessage
} = require("./lib/message");

const app = express();

app.use(cors());
app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);

let sock = null;

let startedAt =
  Date.now();

let lastPairRequest = 0;

const PAIR_COOLDOWN =
  config.PAIRING_COOLDOWN ||
  10000;


/* =========================================================
   HOME
========================================================= */

app.get(
  "/",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);


/* =========================================================
   PAIR PAGE
========================================================= */

app.get(
  "/pair",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "public",
        "pair.html"
      )
    );
  }
);


/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/health",
  (req, res) => {
    const state =
      getConnectionState();

    res.status(200).json({
      status: "ok",
      bot: config.BOT_NAME,
      whatsapp:
        state.status,
      connected:
        state.connected,
      paired:
        state.paired,
      uptime:
        Math.floor(
          (Date.now() -
            startedAt) /
            1000
        )
    });
  }
);


/* =========================================================
   STATUS
========================================================= */

app.get(
  "/status",
  (req, res) => {
    const state =
      getConnectionState();

    res.json({
      bot: config.BOT_NAME,
      owner:
        config.OWNER_NAME,

      status:
        state.status,

      connected:
        state.connected,

      paired:
        state.paired,

      lastError:
        state.lastError,

      uptime:
        Math.floor(
          (Date.now() -
            startedAt) /
            1000
        )
    });
  }
);


/* =========================================================
   PAIRING API
========================================================= */

app.post(
  "/api/pair",
  async (req, res) => {
    try {
      const now =
        Date.now();

      /*
       * Cooldown.
       */
      if (
        now -
          lastPairRequest <
        PAIR_COOLDOWN
      ) {
        const seconds =
          Math.ceil(
            (
              PAIR_COOLDOWN -
              (
                now -
                lastPairRequest
              )
            ) / 1000
          );

        return res
          .status(429)
          .json({
            success: false,
            error:
              `Please wait ${seconds} seconds before requesting another code.`
          });
      }

      const number =
        req.body?.number;

      if (!number) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Phone number is required."
          });
      }

      /*
       * Don't expose the complete number
       * in normal logs.
       */
      const cleaned =
        String(number)
          .replace(/\D/g, "");

      console.log(
        chalk.cyan(
          `Pair request received for number ending ${cleaned.slice(-4)}`
        )
      );

      /*
       * If already connected and registered,
       * don't generate another code.
       */
      const currentSock =
        getSock();

      if (
        currentSock
          ?.authState
          ?.creds
          ?.registered
      ) {
        return res.json({
          success: true,
          alreadyPaired: true,
          message:
            "This bot is already paired."
        });
      }

      lastPairRequest =
        now;

      /*
       * THIS IS THE IMPORTANT FIX.
       *
       * The client module creates/refreshes
       * the socket and waits before asking
       * Baileys for the pairing code.
       */
      const code =
        await requestPairingCode(
          number
        );

      res.json({
        success: true,

        code,

        expiresIn: 60,

        message:
          "Pairing code generated. Enter it in WhatsApp under Linked Devices → Link with phone number."
      });

    } catch (error) {
      console.error(
        chalk.red(
          "Pairing error:"
        ),
        error
      );

      res
        .status(500)
        .json({
          success: false,
          error:
            error.message ||
            "Could not generate pairing code. Please try again."
        });
    }
  }
);


/* =========================================================
   BOT INFO
========================================================= */

app.get(
  "/api/info",
  (req, res) => {
    const state =
      getConnectionState();

    res.json({
      name:
        config.BOT_NAME,

      owner:
        config.OWNER_NAME,

      site:
        config.SITE_URL,

      pair:
        config.PAIR_URL,

      status:
        state.status,

      connected:
        state.connected,

      paired:
        state.paired
    });
  }
);


/* =========================================================
   START
========================================================= */

async function main() {

  const port =
    process.env.PORT ||
    config.PORT ||
    3000;

  /*
   * Railway needs the HTTP server
   * to start immediately.
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
          "   Home: /"
        )
      );

      console.log(
        chalk.yellow(
          "   Pair: /pair"
        )
      );

      console.log(
        chalk.yellow(
          "   Status: /status"
        )
      );

      console.log(
        chalk.yellow(
          "   Health: /health\n"
        )
      );
    }
  );


  /* =======================================================
     LOAD PLUGINS
  ======================================================= */

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


  /* =======================================================
     START WHATSAPP
  ======================================================= */

  setTimeout(
    async () => {
      try {
        console.log(
          chalk.cyan(
            "Starting WhatsApp connection..."
          )
        );

        sock =
          await startAbel();

        /*
         * Handle incoming messages.
         */
        sock.ev.on(
          "messages.upsert",
          async ({
            messages,
            type
          }) => {

            if (
              type !==
              "notify"
            ) {
              return;
            }

            for (
              const message
              of messages
            ) {

              try {

                if (
                  !message ||
                  message.key
                    ?.fromMe
                ) {
                  continue;
                }

                await handleMessage(
                  sock,
                  message
                );

              } catch (error) {

                console.error(
                  chalk.red(
                    "Message processing error:"
                  ),
                  error
                );
              }
            }
          }
        );

      } catch (error) {

        console.error(
          chalk.red(
            "Baileys start error:"
          ),
          error
        );
      }
    },
    1500
  );
}


/* =========================================================
   GLOBAL ERRORS
========================================================= */

process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      chalk.red(
        "Unhandled rejection:"
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
   RUN
========================================================= */

main().catch(
  (error) => {
    console.error(
      chalk.red(
        "Fatal error:"
      ),
      error
    );

    process.exit(1);
  }
);