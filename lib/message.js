const config = require("../config");
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");

const plugins = new Map();

/* =========================================================
   LOAD PLUGINS
========================================================= */

function loadPlugins() {
  const pluginsDir = path.join(
    __dirname,
    "../plugins"
  );

  if (!fs.existsSync(pluginsDir)) {
    console.log(
      chalk.yellow(
        "⚠ Plugins directory not found."
      )
    );

    return;
  }

  /*
   * Clear previously loaded plugins.
   * Useful when reloading.
   */
  plugins.clear();

  const files = fs
    .readdirSync(pluginsDir)
    .filter(
      (file) =>
        file.endsWith(".js") &&
        !file.startsWith("_")
    );

  if (files.length === 0) {
    console.log(
      chalk.yellow(
        "⚠ No plugins found."
      )
    );

    return;
  }

  for (const file of files) {
    const pluginPath =
      path.join(
        pluginsDir,
        file
      );

    try {
      delete require.cache[
        require.resolve(pluginPath)
      ];

      const plugin =
        require(pluginPath);

      /*
       * Validate plugin.
       */
      if (
        !plugin ||
        !Array.isArray(
          plugin.commands
        )
      ) {
        console.log(
          chalk.yellow(
            `⚠ Skipped ${file}: no commands array`
          )
        );

        continue;
      }

      if (
        typeof plugin.handler !==
        "function"
      ) {
        console.log(
          chalk.yellow(
            `⚠ Skipped ${file}: no handler function`
          )
        );

        continue;
      }

      /*
       * Register every command.
       */
      for (const command of plugin.commands) {
        if (
          typeof command !==
          "string"
        ) {
          continue;
        }

        const cmd =
          command
            .trim()
            .toLowerCase();

        if (!cmd) {
          continue;
        }

        /*
         * Warn if another plugin already
         * owns the command.
         */
        if (plugins.has(cmd)) {
          console.log(
            chalk.yellow(
              `⚠ Command "${cmd}" was already registered.`
            )
          );
        }

        plugins.set(
          cmd,
          plugin
        );
      }

      console.log(
        chalk.green(
          `✔ Loaded plugin: ${file} → ${plugin.commands.join(", ")}`
        )
      );

    } catch (err) {
      console.error(
        chalk.red(
          `✖ Failed to load ${file}:`
        ),
        err
      );
    }
  }

  console.log(
    chalk.cyan(
      `📦 ${plugins.size} command(s) registered.`
    )
  );
}

/* =========================================================
   GET MESSAGE BODY
========================================================= */

function getMessageBody(message) {
  if (!message) {
    return "";
  }

  /*
   * Normal text.
   */
  if (
    typeof message.conversation ===
    "string"
  ) {
    return message.conversation;
  }

  /*
   * Extended text.
   */
  if (
    message.extendedTextMessage
      ?.text
  ) {
    return (
      message.extendedTextMessage.text
    );
  }

  /*
   * Image caption.
   */
  if (
    message.imageMessage
      ?.caption
  ) {
    return (
      message.imageMessage.caption
    );
  }

  /*
   * Video caption.
   */
  if (
    message.videoMessage
      ?.caption
  ) {
    return (
      message.videoMessage.caption
    );
  }

  /*
   * Document caption.
   */
  if (
    message.documentMessage
      ?.caption
  ) {
    return (
      message.documentMessage.caption
    );
  }

  /*
   * Buttons.
   */
  if (
    message.buttonsResponseMessage
      ?.selectedButtonId
  ) {
    return (
      message.buttonsResponseMessage
        .selectedButtonId
    );
  }

  /*
   * List menu.
   */
  if (
    message.listResponseMessage
      ?.singleSelectReply
      ?.selectedRowId
  ) {
    return (
      message.listResponseMessage
        .singleSelectReply
        .selectedRowId
    );
  }

  /*
   * Template button.
   */
  if (
    message.templateButtonReplyMessage
      ?.selectedId
  ) {
    return (
      message.templateButtonReplyMessage
        .selectedId
    );
  }

  return "";
}

/* =========================================================
   UNWRAP EPHEMERAL / VIEW-ONCE MESSAGES
========================================================= */

function unwrapMessage(message) {
  if (!message) {
    return message;
  }

  /*
   * Ephemeral message.
   */
  if (
    message.ephemeralMessage
      ?.message
  ) {
    return unwrapMessage(
      message.ephemeralMessage.message
    );
  }

  /*
   * View once.
   */
  if (
    message.viewOnceMessage
      ?.message
  ) {
    return unwrapMessage(
      message.viewOnceMessage.message
    );
  }

  /*
   * View once v2.
   */
  if (
    message.viewOnceMessageV2
      ?.message
  ) {
    return unwrapMessage(
      message.viewOnceMessageV2.message
    );
  }

  /*
   * Document with bytes.
   */
  if (
    message.documentWithCaptionMessage
      ?.message
  ) {
    return unwrapMessage(
      message
        .documentWithCaptionMessage
        .message
    );
  }

  return message;
}

/* =========================================================
   PARSE COMMAND
========================================================= */

function parseCommand(body) {
  const prefix =
    config.PREFIX || ".";

  if (
    !body ||
    !body.startsWith(prefix)
  ) {
    return null;
  }

  const content =
    body
      .slice(prefix.length)
      .trim();

  if (!content) {
    return null;
  }

  const parts =
    content.split(/\s+/);

  const command =
    parts
      .shift()
      .toLowerCase();

  const args = parts;

  return {
    command,
    args,
    prefix
  };
}

/* =========================================================
   HANDLE MESSAGE
========================================================= */

async function handleMessage(
  sock,
  m
) {
  try {
    if (
      !m ||
      !m.message ||
      !m.key
    ) {
      return;
    }

    /*
     * Ignore protocol/system messages.
     */
    if (
      m.key.remoteJid ===
      "status@broadcast"
    ) {
      return;
    }

    const from =
      m.key.remoteJid;

    if (!from) {
      return;
    }

    const isGroup =
      from.endsWith(
        "@g.us"
      );

    const sender =
      isGroup
        ? (
            m.key.participant ||
            m.participant ||
            from
          )
        : from;

    const pushName =
      m.pushName ||
      "User";

    /*
     * Unwrap special message containers.
     */
    const message =
      unwrapMessage(
        m.message
      );

    /*
     * Get readable message text.
     */
    const body =
      getMessageBody(
        message
      );

    if (!body) {
      return;
    }

    /*
     * Only process commands.
     */
    const parsed =
      parseCommand(
        body
      );

    if (!parsed) {
      return;
    }

    const {
      command,
      args,
      prefix
    } = parsed;

    /*
     * FIXED LOGGING LINE
     */
    console.log(
      chalk.blue(
        `[CMD] ${pushName} → ${prefix}${command}`
      )
    );

    /*
     * Find plugin.
     */
    const plugin =
      plugins.get(
        command
      );

    if (
      !plugin ||
      typeof plugin.handler !==
        "function"
    ) {
      /*
       * Unknown command.
       *
       * We silently ignore it instead of
       * sending unnecessary messages.
       */
      return;
    }

    /*
     * Plugin context.
     */
    const context = {
      args,
      command,
      prefix,

      from,
      sender,

      isGroup,

      pushName,

      body,

      config,

      /*
       * Original message.
       */
      message: m,

      /*
       * Unwrapped message.
       */
      rawMessage: message
    };

    /*
     * Execute plugin.
     */
    await plugin.handler(
      sock,
      m,
      context
    );

  } catch (err) {
    console.error(
      chalk.red(
        "Message handler error:"
      ),
      err
    );
  }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  loadPlugins,
  handleMessage,
  getMessageBody,
  parseCommand,
  plugins
};