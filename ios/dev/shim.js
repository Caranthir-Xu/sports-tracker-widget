// Minimal Scriptable API stand-ins (Request, FileManager, Timer) to run "Sports Data.js" under Node.
const fs = require("fs"), path = require("path"), https = require("https"), vm = require("vm");
const { execFile } = require("child_process");
const ROOT = path.resolve(__dirname, "../..");
const DOCS = path.join(__dirname, "out", "docs");
fs.mkdirSync(DOCS, { recursive: true });

function get(url, headers, n = 0) {
  return new Promise((res, rej) => {
    const req = https.get(url, { headers }, (r) => {
      if ([301, 302, 307, 308].includes(r.statusCode) && n < 5) return res(get(new URL(r.headers.location, url).href, headers, n + 1));
      let b = ""; r.setEncoding("utf8"); r.on("data", (c) => (b += c)); r.on("end", () => res({ code: r.statusCode, body: b }));
    });
    req.on("error", rej); req.setTimeout(25000, () => req.destroy(new Error("timeout")));
  });
}
// BWF blocks Node's TLS fingerprint; go through curl_cffi in tests (the phone itself is not blocked).
function viaCffi(url) {
  return new Promise((res, rej) => execFile(path.join(ROOT, ".venv/bin/python"), [path.join(__dirname, "cffi.py"), url],
    { maxBuffer: 64 << 20 }, (e, out, err) => (e ? rej(e) : res({ code: +err, body: out }))));
}
class Request {
  constructor(u) { this.url = u; this.headers = {}; }
  async loadString() {
    const r = /bwfbadminton/.test(this.url) ? await viaCffi(this.url) : await get(this.url, this.headers);
    this.response = { statusCode: r.code };
    return r.body;
  }
}
const FileManager = { local: () => ({
  documentsDirectory: () => DOCS, joinPath: path.join, fileExists: fs.existsSync,
  createDirectory: (p) => fs.mkdirSync(p, { recursive: true }), readString: (p) => fs.readFileSync(p, "utf8"),
  writeString: (p, s) => fs.writeFileSync(p, s) }) };
const Timer = { schedule: (ms, rep, fn) => { const t = setTimeout(fn, ms); t.unref(); return t; } };

function load(file) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), { module, exports: module.exports, Request, FileManager, Timer,
    console, Promise, Date, JSON, Math, encodeURIComponent, URL, setTimeout, Set, Array, Object, String, Number });
  return module.exports;
}
module.exports = { load, ROOT };
