// Mock of Scriptable's widget API that renders the widget tree to approximate HTML, plus the
// detail page: node ios/dev/widgetmock.js  → ios/dev/out/www/{widgets,detail}.html
// (serve with: python3 -m http.server 8765 --bind 127.0.0.1 -d ios/dev/out/www). Needs out/data.json (test.js).
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "../.."), OUT = path.join(__dirname, "out/www");
fs.mkdirSync(OUT, { recursive: true });
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
class Color { constructor(h, a) { this.hex = h; this.a = a == null ? 1 : a; } static white() { return new Color("#ffffff"); }
  css() { const n = parseInt(this.hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${this.a})`; } }
class Font { constructor(w, s) { if (typeof w === "string") { this.fam = w; this.w = 900; } else this.w = w; this.s = s; } }
[["heavySystemFont", 900], ["boldSystemFont", 700], ["semiboldSystemFont", 600], ["boldRoundedSystemFont", 700], ["systemFont", 400]]
  .forEach(([n, w]) => { Font[n] = (s) => new Font(w, s); });
class Point { constructor(x, y) { this.x = x; this.y = y; } }
class Size { constructor(w, h) { this.width = w; this.height = h; } }
class Rect { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } }
class LinearGradient { css() { return `linear-gradient(135deg,${this.colors.map((c) => c.css()).join(",")})`; } }
class Path { constructor() { this.d = ""; } move(p) { this.d += `M${p.x},${p.y}`; } addLine(p) { this.d += `L${p.x},${p.y}`; } closeSubpath() { this.d += "Z"; }
  addRoundedRect(r, a) { this.d += `M${r.x + a},${r.y}H${r.x + r.w - a}V${r.y + r.h}H${r.x + a}Z`; } }
class DrawContext {
  constructor() { this.p = []; }
  addPath(p) { this.cur = p; } setStrokeColor(c) { this.sc = c; } setLineWidth(w) { this.lw = w; } setFillColor(c) { this.fc = c; }
  strokePath() { this.p.push(`<path d="${this.cur.d}" stroke="${this.sc.css()}" stroke-width="${this.lw}" fill="none"/>`); }
  fillPath() { this.p.push(`<path d="${this.cur.d}" fill="${this.fc.css()}"/>`); }
  fillEllipse(r) { this.p.push(`<ellipse cx="${r.x + r.w / 2}" cy="${r.y + r.h / 2}" rx="${r.w / 2}" ry="${r.h / 2}" fill="${this.fc.css()}"/>`); }
  fillRect(r) { this.p.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${this.fc.css()}"/>`); }
  setFont(f) { this.f = f; } setTextColor(c) { this.tc = c; } setTextAlignedCenter() {}
  drawTextInRect(t, r) { this.p.push(`<text x="${r.x + r.w / 2}" y="${r.y + this.f.s * 0.85}" text-anchor="middle" font-family="HelveticaNeue-CondensedBlack" font-size="${this.f.s}" fill="${this.tc.css()}">${t}</text>`); }
  getImage() { const { width: w, height: h } = this.size;
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${this.p.join("")}</svg>`, size: this.size }; }
}
class Node_ { constructor(kind) { this.kind = kind; this.kids = []; this.dir = "column"; }
  addStack() { const s = new Node_("stack"); this.kids.push(s); return s; }
  addText(t) { const n = new Node_("text"); n.t = t; n.centerAlignText = () => (n.center = true); this.kids.push(n); return n; }
  addImage(i) { const n = new Node_("img"); n.i = i; this.kids.push(n); return n; }
  addDate(d) { // WidgetDate with applyTimerStyle → render the remaining m:ss at render time
    const n = new Node_("text"); const sec = Math.max(0, Math.round((d - Date.now()) / 1000));
    n.t = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; n.applyTimerStyle = () => {}; this.kids.push(n); return n; }
  addSpacer(l) { const n = new Node_("spacer"); n.l = l; this.kids.push(n); return n; }
  layoutHorizontally() { this.dir = "row"; } layoutVertically() { this.dir = "column"; } centerAlignContent() { this.align = "center"; } topAlignContent() { this.align = "flex-start"; }
  setPadding(t, l, b, r) { this.pad = [t, l, b, r]; } }
class ListWidget extends Node_ { constructor() { super("widget"); this.pad = [16, 16, 16, 16]; } }
const SIZES = { small: [158, 158], medium: [338, 158], large: [338, 354] };
const bgUrl = (img) => `url('data:image/svg+xml,${encodeURIComponent(img.svg)}') 0 0/100% 100%`;
function html(n, dir) {
  if (n.kind === "spacer") return `<div style="${n.l != null ? (dir === "row" ? `width:${n.l}px` : `height:${n.l}px`) + ";flex:none" : "flex:1"}"></div>`;
  if (n.kind === "text") { const f = n.font || Font.systemFont(14);
    return `<div style="font-size:${f.s}px;font-weight:${f.w};${f.fam ? `font-family:${f.fam};` : ""}color:${n.textColor ? n.textColor.css() : "#fff"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0${n.center ? ";text-align:center" : ""}">${esc(n.t)}</div>`; }
  if (n.kind === "img") { const w = n.imageSize ? n.imageSize.width : 20, h = n.imageSize ? n.imageSize.height : 20;
    return n.i.svg ? n.i.svg : `<img src="${n.i.url}" style="width:${w}px;height:${h}px;object-fit:contain;flex:none">`; }
  const st = [`display:flex;flex-direction:${n.dir};align-items:${n.align || (n.dir === "row" ? "center" : "flex-start")};min-width:0`];
  if (n.spacing) st.push(`gap:${n.spacing}px`);
  if (n.pad) st.push(`padding:${n.pad[0]}px ${n.pad[3]}px ${n.pad[2]}px ${n.pad[1]}px`);
  const bgs = [];
  if (n.backgroundImage) bgs.push(bgUrl(n.backgroundImage));
  if (n.backgroundGradient) bgs.push(n.backgroundGradient.css());
  else if (n.backgroundColor) bgs.push(`linear-gradient(${n.backgroundColor.css()},${n.backgroundColor.css()})`);
  if (bgs.length) st.push(`background:${bgs.join(",")}`);
  if (n.cornerRadius) st.push(`border-radius:${n.cornerRadius}px;overflow:hidden`);
  if (n.kind === "stack" && dir === "column") st.push("align-self:stretch");
  // Like iOS: a stack holding a flexible spacer grows to fill its row.
  const flexy = (x) => x.kids && x.kids.some((k) => (k.kind === "spacer" && k.l == null) || (k.kind === "stack" && !k.size && flexy(k)));
  if (n.kind === "stack" && dir === "row" && !n.size && flexy(n)) st.push("flex:1");
  if (n.size) st.push(`${n.size.width > 0 ? `width:${n.size.width}px;` : "align-self:stretch;"}${n.size.height > 0 ? `height:${n.size.height}px;` : ""}box-sizing:border-box;flex:none;overflow:hidden`);
  if (n.kind === "widget") { const [w, h] = SIZES[n.family]; st.push(`width:${w}px;height:${h}px;box-sizing:border-box;border-radius:22px;overflow:hidden;font-family:-apple-system,'PingFang SC'`); }
  return `<div style="${st.join(";")}">${n.kids.map((k) => html(k, n.dir)).join("")}</div>`;
}
const fm = { documentsDirectory: () => path.join(__dirname, "out/docs"), joinPath: path.join, fileExists: () => false,
  createDirectory: () => {}, readImage: () => null, writeImage: () => {} };
class Request { constructor(u) { this.u = u; } async loadImage() { return { url: this.u }; } }
const src = fs.readFileSync(path.join(ROOT, "ios/Sports Tracker.js"), "utf8").split("// ---------- main ----------")[0];
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "out/data.json"), "utf8"));
const ctx = { console, Color, Font, Point, Size, Rect, LinearGradient, Path, DrawContext, ListWidget, Request, Intl, Date, Math,
  JSON, Promise, Array, String, Number, Object, FileManager: { local: () => fm }, Device: { screenSize: () => ({ width: 393, height: 852 }) },
  importModule: () => ({}), args: {}, config: {}, Script: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
(async () => {
  let out = "<meta charset=utf-8><body style='background:#5b7f96;display:flex;flex-wrap:wrap;gap:20px;padding:20px;align-items:flex-start'>";
  for (const [fam, p] of [["small", null], ["small", "nhl"], ["medium", "f1"], ["medium", "nhl"], ["medium", "badminton"], ["large", null]]) {
    const w = fam === "small" ? await ctx.smallWidget(data, p) : fam === "large" ? await ctx.largeWidget(data) : await ctx.mediumWidget(data, p);
    w.family = fam;
    out += `<div><div style="color:#fff;font:12px sans-serif">${fam} ${p || ""}</div>${html(w)}</div>`;
  }
  fs.writeFileSync(path.join(OUT, "widgets.html"), out + "</body>");
  fs.writeFileSync(path.join(OUT, "detail.html"), ctx.detailHTML(data, null));
  console.log("wrote", OUT);
})().catch((e) => { console.error(e.stack); process.exit(1); });
