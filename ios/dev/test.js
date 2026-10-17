// Run the phone data layer under Node: node ios/dev/test.js  → ios/dev/out/data.json + summary.
// Compare with the Mac's ~/Library/Application Support/sports-tracker/data.json.
const fs = require("fs"), path = require("path");
const { load, ROOT } = require("./shim");
const src = fs.readFileSync(path.join(ROOT, "ios/Sports Tracker.js"), "utf8");
const CONFIG = eval("(" + src.match(/const CONFIG = (\{[\s\S]*?\n\});/)[1] + ")");
const mod = load(path.join(ROOT, "ios/Sports Data.js"));
(async () => {
  const t = Date.now();
  const lite = process.argv.includes("--lite");
  const d = lite ? await mod.load(CONFIG, { lite: true, force: true }) : await mod.fetchAll(CONFIG, null);
  fs.writeFileSync(path.join(__dirname, "out/data.json"), JSON.stringify(d, null, 1));
  console.log("took", (Date.now() - t) / 1000, "s");
  for (const sp of d.sports) for (const s of sp.subjects)
    console.log(s.id, s.stale ? "STALE " + s.error : "ok", "| next", s.next && s.next.title, "| last", s.last && (s.last.result || {}).summary);
})();
