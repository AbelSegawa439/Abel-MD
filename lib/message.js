const config = require("../config");
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");

const plugins = new Map();

function loadPlugins() {
  const pluginsDir = path.join(__dirname, "../plugins");
  if (!fs.existsSync(pluginsDir)) return;

  const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith(".js"));
  for (const file of files) {
    try {
      delete require.cache[require.resolve(path.join(pluginsDir, file))];
      const plugin = require(path.join(pluginsDir, file));
      if (plugin.commands && Array.isArray(plugin.commands)) {
        for (const cmd of plugin.commands) {
          plugins.set(cmd.toLowerCase(), plugin);
        }
        console.log(chalk.green(`✔ Loaded plugin: ${file}`));
      }
    } catch (err) {
      console.error(chalk.red(`Failed to load ${file}:`), err.message);
    }
  }
}

async function handleMessage(sock, m) {
  try {
    if (!m.message) return;

    const from = m.key.remoteJid;
    const isGroup = from.endsWith("@g.us");
    const sender = isGroup ? (m.key.participant || m.participant) : from;
    const pushName = m.pushName || "User";

    const messageType = Object.keys(m.message)[0];
    let body = "";

    if (messageType === "conversation") {
      body = m.message.conversation;
    } else if (messageType === "extendedTextMessage") {
      body = m.message.extendedTextMessage.text;
    } else if (messageType === "imageMessage" && m.message.imageMessage.caption) {
      body = m.message.imageMessage.caption;
    } else if (messageType === "videoMessage" && m.message.videoMessage.caption) {
      body = m.message.videoMessage.caption;
    }

    if (!body) return;

    const prefix = config.PREFIX;
    if (!body.startsWith(prefix)) return;

    const args = body.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    console.log(chalk.blue(`[CMD] ${pushName} → \( {prefix} \){command}`));

    const plugin = plugins.get(command);
    if (plugin && typeof plugin.handler === "function") {
      await plugin.handler(sock, m, {
        args,
        command,
        prefix,
        from,
        sender,
        isGroup,
        pushName,
        body,
        config
      });
    }
  } catch (err) {
    console.error("Message handler error:", err);
  }
}

module.exports = { loadPlugins, handleMessage, plugins };