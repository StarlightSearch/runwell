// src/plugin/mod.ts
var NODE_HINT = "Runwell needs Node 20 or newer to run. Install it from https://nodejs.org. Claude Code is not affected.";
var root = decodeURIComponent(new URL("..", import.meta.url).pathname).replace(/\/$/, "");
var cli = `${root}/dist/cli.js`;
var launcher = `${root}/dist/launcher.js`;
var node = "node";
async function hintOnce($) {
  try {
    if (await $.store.get("nodeHintShown")) return;
    await $.store.set("nodeHintShown", true);
    $.ui.toast(NODE_HINT);
  } catch {
  }
}
async function runNode($, args) {
  try {
    return await $.process.run([node, ...args]);
  } catch {
    try {
      const home = await $.env.get("HOME");
      const cfg = JSON.parse(await $.fs.read(`${home}/.runwell/config.json`));
      if (typeof cfg.nodePath !== "string") return null;
      node = cfg.nodePath;
      return await $.process.run([node, ...args]);
    } catch {
      return null;
    }
  }
}
function register(on) {
  on("session.start", async ($, e, next) => {
    try {
      const r = await runNode($, [launcher]);
      if (!r || r.stderr.includes("Node 20")) await hintOnce($);
    } catch {
    }
    try {
      await $.command.register({ name: "runwell", description: "Open Runwell, or run a skill in it", argumentHint: "[run <skill> [brief] | last]", immediate: true });
    } catch {
    }
    return next(e);
  });
  on("command.run", { command: "runwell" }, async ($, e) => {
    try {
      const words = (e.args ?? "").trim().split(/\s+/).filter(Boolean);
      const cwd = await $.session.cwd();
      let argv;
      if (!words.length || words[0] === "open") argv = [cli, "open"];
      else if (words[0] === "last") argv = [cli, "last", "--cwd", cwd];
      else if (words[0] === "run" && words[1]) argv = [cli, "run", words[1], words.slice(2).join(" "), "--cwd", cwd];
      else if (words[0] === "run") argv = [cli, "run"];
      else return { text: "Usage: /runwell, /runwell last, or /runwell run <skill> [brief]", isTextDisplayOnly: true };
      const r = await runNode($, argv);
      if (!r) {
        await hintOnce($);
        return { text: NODE_HINT, isTextDisplayOnly: true };
      }
      const text = r.stdout.trim() || r.stderr.trim() || "Runwell could not start.";
      return { text: text.length > 6e3 ? `${text.slice(0, 6e3)}\u2026` : text, isTextDisplayOnly: true };
    } catch {
      return { text: "Runwell could not start. Try npx runwell in a terminal.", isTextDisplayOnly: true };
    }
  });
}
export {
  register
};
