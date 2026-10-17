// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: trophy;

// Sports Tracker — iOS widget (Scriptable). Needs the "Sports Data" module in the same folder.
//
// Widget parameter (long-press widget → Edit Widget → Parameter):
//   f1 | nhl | badminton   show that sport;  empty = whatever is coming up next.
// Sizes: small (next event), medium (one sport), large (all sports), lock screen.
// Tapping a widget opens the full detail page. Running the script in the app shows a preview menu.

// ---------- what to follow (same as config.yaml on the Mac) ----------
const CONFIG = {
  timezone: "America/Detroit",
  sports: [
    { id: "f1", name: "F1", provider: "f1", subjects: [
      { id: "f1-leclerc", name: "Charles Leclerc", short: "LEC", number: 16, jolpica_id: "leclerc" },
      { id: "f1-verstappen", name: "Max Verstappen", short: "VER", number: 3, jolpica_id: "max_verstappen" },
    ] },
    { id: "nhl", name: "NHL", provider: "nhl", subjects: [
      { id: "nhl-sjs", name: "San Jose Sharks", short: "SJS", abbrev: "SJS", color: "#006D75" },
    ] },
    { id: "badminton", name: "羽毛球", provider: "badminton", subjects: [
      { id: "bwf-liang-wang", name: "梁伟铿 / 王昶", short: "梁伟铿 / 王昶", event: "MD", player_id: 90531, search: "LIANG Wei Keng" },
      { id: "bwf-chen-yufei", name: "陈雨菲", short: "陈雨菲", event: "WS", player_id: 78778, search: "CHEN Yu Fei" },
    ] },
  ],
};
const REFRESH_MIN = 15;          // widget data older than this is refetched
const ZH_SPORTS = ["badminton"]; // sports shown in Chinese

const DATA = importModule("Sports Data");

// ---------- colours ----------
const C = {
  text: new Color("#ffffff"), dim: new Color("#ffffff", 0.6), faint: new Color("#ffffff", 0.38),
  amber: new Color("#ffb340"), live: new Color("#ff453a"), win: new Color("#30d158"), loss: new Color("#ff6961"),
  teal: new Color("#5fd3da"), card: new Color("#000000", 0.22),
};
const SECTOR = ["#ff3b4f", "#3aa0ff", "#ffd23f"];
const DAY = 24 * 3600 * 1000;

// ---------- time helpers (data.timezone) ----------
const T = {
  en: { today: "Today", tomorrow: "Tomorrow", yesterday: "Yesterday", locale: "en-US", next: "Next", last: "Last",
        none: "No upcoming entries", live: "LIVE", recent: "Last 24h" },
  zh: { today: "今天", tomorrow: "明天", yesterday: "昨天", locale: "zh-CN", next: "下一场", last: "最近一场",
        none: "暂无报名赛事", live: "进行中", recent: "24小时内" },
};
let TZ = CONFIG.timezone;
const dayKey = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const isDateOnly = (ev) => ev.time_precision === "date";
const daysFromToday = (key) => Math.round((Date.parse(key) - Date.parse(dayKey(new Date()))) / DAY);
const clock = (s) => new Date(s).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const weekday = (s) => new Date(s).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" });

function relDay(ev, L) {
  const key = isDateOnly(ev) ? ev.start : dayKey(new Date(ev.start));
  const diff = daysFromToday(key);
  if (diff === 0) return L.today;
  if (diff === 1) return L.tomorrow;
  if (diff === -1) return L.yesterday;
  const [y, m, d] = key.split("-").map(Number);
  return `${new Date(y, m - 1, d).toLocaleDateString(L.locale, { weekday: "short" })} ${m}/${d}`;
}

function parts(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), m: m % 60 };
}

function countdown(ev, zh) {
  if (ev.status === "live") return zh ? "进行中" : "Live now";
  if (isDateOnly(ev)) {
    const n = daysFromToday(ev.start);
    if (zh) return n > 1 ? `${n} 天后` : n === 1 ? "明天" : n === 0 ? "今天" : "进行中";
    return n > 1 ? `in ${n} days` : n === 1 ? "tomorrow" : n === 0 ? "today" : "underway";
  }
  const ms = Date.parse(ev.start) - Date.now();
  if (ms <= 0) return zh ? "已开始" : "started";
  const p = parts(ms);
  if (zh) return p.d ? `${p.d}天${p.h}小时后` : p.h ? `${p.h}小时${p.m}分后` : `${p.m}分钟后`;
  return p.d ? `in ${p.d}d ${p.h}h` : p.h ? `in ${p.h}h ${p.m}m` : `in ${p.m}m`;
}

function isHot(ev) {
  if (!ev) return false;
  if (ev.status === "live") return true;
  if (isDateOnly(ev)) return ev.start === dayKey(new Date());
  const age = Date.now() - Date.parse(ev.start);
  return age >= 0 && age < DAY;
}

// Sort key: live first, then soonest upcoming.
function eventTime(ev) {
  if (!ev) return Infinity;
  if (ev.status === "live") return -Infinity;
  const t = isDateOnly(ev) ? Date.parse(ev.start + "T12:00:00Z") : Date.parse(ev.start);
  return t < Date.now() - 6 * 3600 * 1000 ? Infinity : t;
}

// ---------- text helpers ----------
function shortTitle(t) {
  const s = (t || "").replace("Grand Prix", "GP").replace(/\s*\(.*?\)/g, "").replace(/\s20\d\d\b/, "").trim();
  const w = s.split(" ");
  let i = 0;
  while (i < w.length - 2 && /^[A-Z0-9-]{2,}$/.test(w[i])) i++;
  return w.slice(i).join(" ");
}
const ZH_EVENTS = { MS: "男单", WS: "女单", MD: "男双", WD: "女双", XD: "混双" };
const ZH_ROUNDS = { F: "决赛", Final: "决赛", SF: "半决赛", QF: "1/4决赛", R16: "16强", R32: "32强", R64: "64强" };
const ZH_TOURNAMENTS = [
  ["World Tour Finals", "世界巡回赛总决赛"], ["All England", "全英公开赛"], ["Asian Games", "亚运会"],
  ["World Championships", "世锦赛"], ["Olympic", "奥运会"], ["Sudirman Cup", "苏迪曼杯"], ["Thomas", "汤姆斯杯"],
  ["Uber", "尤伯杯"], ["Asia Championships", "亚锦赛"], ["Malaysia Open", "马来西亚公开赛"],
  ["Malaysia Masters", "马来西亚大师赛"], ["India Open", "印度公开赛"], ["Indonesia Masters", "印尼大师赛"],
  ["Indonesia Open", "印尼公开赛"], ["Thailand Masters", "泰国大师赛"], ["Thailand Open", "泰国公开赛"],
  ["German Open", "德国公开赛"], ["Orleans Masters", "奥尔良大师赛"], ["Swiss Open", "瑞士公开赛"],
  ["Spain Masters", "西班牙大师赛"], ["Singapore Open", "新加坡公开赛"], ["Australian Open", "澳大利亚公开赛"],
  ["Japan Open", "日本公开赛"], ["Masters Japan", "日本大师赛"], ["China Open", "中国公开赛"],
  ["China Masters", "中国大师赛"], ["Macau Open", "澳门公开赛"], ["Hong Kong Open", "香港公开赛"],
  ["Taipei Open", "台北公开赛"], ["Korea Open", "韩国公开赛"], ["Korea Masters", "韩国大师赛"],
  ["Arctic Open", "北极公开赛"], ["Denmark Open", "丹麦公开赛"], ["French Open", "法国公开赛"],
  ["Hylo Open", "许洛公开赛"], ["HYLO Open", "许洛公开赛"], ["Syed Modi", "赛义德·莫迪国际赛"],
  ["Canada Open", "加拿大公开赛"], ["US Open", "美国公开赛"], ["Vietnam Open", "越南公开赛"],
];
const zhTournament = (t) => { const h = ZH_TOURNAMENTS.find(([en]) => (t || "").indexOf(en) >= 0); return h ? h[1] : shortTitle(t); };
const title = (ev, zh) => (zh ? zhTournament(ev.title) : shortTitle(ev.title));
const cname = (c, zh) => (zh && c.name_zh ? c.name_zh : c.short || c.name);
const round = (ev, zh) => { const r = (ev.subtitle || "").split(" vs ")[0]; return zh ? ZH_ROUNDS[r] || r : r; };

// ---------- images (cached on disk) ----------
const fm = FileManager.local();
const IMG_DIR = fm.joinPath(fm.documentsDirectory(), "sports-tracker/img");
if (!fm.fileExists(IMG_DIR)) fm.createDirectory(IMG_DIR, true);

// Widgets have tight memory limits, so images are kept tiny: flags are emoji, and NHL logos
// (SVG upstream, unsupported) come from ESPN's resizer at 96 px.
const ESPN_NHL = { SJS: "sj", LAK: "la", NJD: "nj", TBL: "tb", UTA: "utah", VGK: "vgk", WSH: "wsh", MTL: "mtl" };
function pngUrl(url) {
  if (!url) return null;
  const nhl = url.match(/nhl\/svg\/([A-Z]{3})_/);
  if (!nhl) return null; // everything else uses emoji flags
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nhl/500/${ESPN_NHL[nhl[1]] || nhl[1].toLowerCase()}.png&w=96&h=96`;
}

// ISO3 / IOC country code -> flag emoji (Chinese Taipei shows as text, like BWF does).
const ISO2 = { USA: "US", CHN: "CN", KOR: "KR", JPN: "JP", INA: "ID", IDN: "ID", MAS: "MY", MYS: "MY", IND: "IN",
  THA: "TH", DEN: "DK", DNK: "DK", FRA: "FR", HKG: "HK", SGP: "SG", SIN: "SG", GBR: "GB", ENG: "GB", GER: "DE",
  DEU: "DE", CAN: "CA", AUS: "AU", ESP: "ES", NED: "NL", NLD: "NL", BEL: "BE", ITA: "IT", MEX: "MX", BRA: "BR",
  QAT: "QA", UAE: "AE", ARE: "AE", KSA: "SA", SAU: "SA", BRN: "BH", BHR: "BH", AZE: "AZ", MON: "MC", MCO: "MC",
  AUT: "AT", HUN: "HU", SUI: "CH", CHE: "CH", VIE: "VN", VNM: "VN", PHI: "PH", TUR: "TR", UKR: "UA", BUL: "BG",
  POL: "PL", SWE: "SE", NOR: "NO", FIN: "FI", IRL: "IE", NZL: "NZ", RSA: "ZA", ISR: "IL", POR: "PT", PRT: "PT",
  CZE: "CZ", MAC: "MO", SCO: "GB", BAH: "BH" };
function flag(code) {
  if (!code) return "";
  if (code === "TPE") return "TPE";
  const two = ISO2[code] || (code.length === 2 ? code : null);
  return two ? String.fromCodePoint(...[...two.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : code;
}

async function image(url) {
  url = pngUrl(url);
  if (!url) return null;
  const path = fm.joinPath(IMG_DIR, url.replace(/[^a-z0-9]/gi, "_").slice(-120));
  if (fm.fileExists(path)) return fm.readImage(path);
  try {
    const img = await new Request(url).loadImage();
    fm.writeImage(path, img);
    return img;
  } catch (e) { return null; }
}

// ---------- widget building blocks ----------
// F1 racing type: condensed black, like F1 TV graphics (widgets can't slant text).
const raceFont = (size) => new Font("HelveticaNeue-CondensedBlack", size);
const F1_RED = "#ff2a1f";
function txt(stack, s, size, color, weight) {
  const t = stack.addText(String(s == null ? "" : s));
  t.font = weight === "race" ? raceFont(size) : weight === "heavy" ? Font.heavySystemFont(size) : weight === "bold" ? Font.boldSystemFont(size)
    : weight === "semi" ? Font.semiboldSystemFont(size) : weight === "round" ? Font.boldRoundedSystemFont(size)
    : Font.systemFont(size);
  t.textColor = color || C.text;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  return t;
}
const hstack = (p, spacing) => { const s = p.addStack(); s.layoutHorizontally(); s.centerAlignContent(); if (spacing != null) s.spacing = spacing; return s; };
const vstack = (p, spacing) => { const s = p.addStack(); s.layoutVertically(); if (spacing != null) s.spacing = spacing; return s; };

async function img(stack, url, w, h, radius) {
  const i = await image(url);
  if (!i) return null;
  const wi = stack.addImage(i);
  wi.imageSize = new Size(w, h || w);
  if (radius) wi.cornerRadius = radius;
  return wi;
}

function gradient(c1, a1, c2, a2) {
  const g = new LinearGradient();
  g.colors = [new Color(c1, a1), new Color(c2, a2)];
  g.locations = [0, 1];
  g.startPoint = new Point(0, 0);
  g.endPoint = new Point(1, 1);
  return g;
}

function pill(stack, s, color) {
  const p = stack.addStack();
  p.backgroundColor = color;
  p.cornerRadius = 4;
  p.setPadding(1, 4, 1, 4);
  txt(p, s, 8, C.text, "heavy");
}

// Circuit outline with S1/S2/S3 colours, drawn to an image.
function trackImage(track, w) {
  if (!track || !track.points) return null;
  const pad = 4, scale = (w - pad * 2) / track.w, h = track.h * scale + pad * 2;
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const P = (p) => new Point(pad + p[0] * scale, pad + p[1] * scale);
  const pts = track.points;
  const cuts = track.sectors || [];
  const bounds = cuts.length === 2 ? [0, cuts[0], cuts[1], pts.length] : [0, pts.length];
  for (let i = 0; i < bounds.length - 1; i++) {
    const path = new Path();
    path.move(P(pts[bounds[i]]));
    for (let k = bounds[i] + 1; k <= Math.min(bounds[i + 1], pts.length - 1); k++) path.addLine(P(pts[k]));
    if (bounds[i + 1] >= pts.length) path.addLine(P(pts[0]));
    ctx.addPath(path);
    ctx.setStrokeColor(new Color(cuts.length === 2 ? SECTOR[i] : "#ffffff"));
    ctx.setLineWidth(2.6);
    ctx.strokePath();
  }
  const s = P(pts[0]);
  ctx.setFillColor(Color.white());
  ctx.fillEllipse(new Rect(s.x - 2.5, s.y - 2.5, 5, 5));
  return ctx.getImage();
}

// Car number on a slanted team-colour plate.
function plateImage(number, color, h) {
  const w = Math.round(h * 1.35), sk = Math.round(h * 0.22);
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const p = new Path();
  p.move(new Point(sk, 0)); p.addLine(new Point(w, 0)); p.addLine(new Point(w - sk, h)); p.addLine(new Point(0, h)); p.closeSubpath();
  ctx.addPath(p);
  ctx.setFillColor(new Color(color || "#888888"));
  ctx.fillPath();
  ctx.setFont(raceFont(h * 0.72));
  ctx.setTextColor(Color.white());
  ctx.setTextAlignedCenter();
  ctx.drawTextInRect(String(number || ""), new Rect(0, h * 0.08, w, h));
  return ctx.getImage();
}

// Five start lights: one more lit per day as the session nears; all off once live.
function lightsImage(ev) {
  const days = Math.floor((Date.parse(ev.start) - Date.now()) / DAY);
  const lit = ev.status === "live" ? 0 : Math.max(0, Math.min(5, 5 - days));
  const d = 6, gap = 3, pad = 3, w = pad * 2 + d * 5 + gap * 4, h = d + pad * 2;
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const bg = new Path();
  bg.addRoundedRect(new Rect(0, 0, w, h), 3, 3);
  ctx.addPath(bg);
  ctx.setFillColor(new Color("#0b0b0d"));
  ctx.fillPath();
  for (let i = 0; i < 5; i++) {
    ctx.setFillColor(new Color(i < lit ? F1_RED : "#7a2c2c"));
    ctx.fillEllipse(new Rect(pad + i * (d + gap), pad, d, d));
  }
  return ctx.getImage();
}

// Widget background painted as one image: horizontal colour bands (left→right gradient each),
// optionally with a chequered strip on top. iOS stretches a background image to the real widget
// size, so nothing depends on knowing the exact widget width.
function bandsBackground(size, bands) {
  const ctx = new DrawContext();
  ctx.size = size;
  ctx.opaque = true;
  ctx.respectScreenScale = true;
  ctx.setFillColor(new Color("#14141a"));
  ctx.fillRect(new Rect(0, 0, size.width, size.height));
  const mix = (a, b, t) => {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
  };
  let y = 0;
  const strips = 48;
  for (const band of bands) {
    const h = Math.round(size.height * band.share);
    for (let i = 0; i < strips; i++) {
      // Opaque strips (alpha pre-mixed over the base) so the 1 px overlaps don't show as seams.
      const c = mix(band.colors[0], band.colors[1], i / (strips - 1));
      ctx.setFillColor(new Color(mix("#14141a", c, band.alpha || 1)));
      ctx.fillRect(new Rect((size.width * i) / strips, y, size.width / strips + 1, h));
    }
    if (band.checker) {
      const sq = 3;
      for (let x = 0; x < size.width; x += sq) {
        for (let r = 0; r < 2; r++) {
          ctx.setFillColor(new Color(((x / sq + r) % 2) ? "#111111" : "#ffffff", 0.6));
          ctx.fillRect(new Rect(x, y + r * sq, sq, sq));
        }
      }
    }
    y += h;
  }
  return ctx.getImage();
}

const BAND_COLORS = (sport) => sport.id === "f1" ? f1Colors(sport) : sport.id === "badminton" ? ["#0e7052", "#0a2a20"]
  : sport.subjects.length === 1 && sport.subjects[0].color ? [sport.subjects[0].color, "#0c2a2e"] : ["#2a2d35", "#1a1c21"];

function addImage(stack, image) {
  const wi = stack.addImage(image);
  wi.imageSize = image.size;
  return wi;
}

// ---------- F1 ----------
function f1Colors(sport) {
  return [(sport.subjects[0] || {}).color || "#ED1131", (sport.subjects[1] || {}).color || "#4781D7"];
}

async function f1Block(parent, sport, opts) {
  const ev = (sport.subjects.find((s) => s.next) || {}).next;
  const top = hstack(parent, 6);
  const left = vstack(top, 2);
  const lbl = hstack(left, 5);
  txt(lbl, "F1", 13, new Color(F1_RED), "race");
  if (sport.next_round) pill(lbl, `ROUND ${sport.next_round}`, new Color("#ffffff", 0.16));
  if (ev && ev.status === "live") pill(lbl, "LIVE", C.live);
  if (ev) {
    const row = hstack(left, 5);
    if (ev.country) txt(row, flag(ev.country), 12);
    txt(row, shortTitle(ev.title).toUpperCase(), opts.compact ? 14 : 16, C.text, "race");
    const p = parts(Date.parse(ev.start) - Date.now());
    const cd = hstack(left, 5);
    txt(cd, ev.subtitle, 11, C.dim, "race");
    txt(cd, ev.status === "live" ? "LIGHTS OUT" : p.d ? `${p.d}D ${p.h}H ${p.m}M` : `${p.h}H ${p.m}M`, opts.compact ? 18 : 21, C.text, "race");
    addImage(cd, lightsImage(ev));
    if (!opts.compact) txt(left, `${relDay(ev, T.en)} · ${clock(ev.start)}`, 10, C.dim);
  } else {
    txt(left, "Season complete", 12, C.dim);
  }
  top.addSpacer();
  if (ev && ev.track && opts.track) {
    const im = trackImage(ev.track, opts.compact ? 78 : 92);
    if (im) addImage(top, im);
  }
  parent.addSpacer(opts.compact ? 3 : 5);
  for (const s of sport.subjects) {
    const r = hstack(parent, 6);
    r.setPadding(opts.compact ? 2 : 3, 4, opts.compact ? 2 : 3, 8);
    r.cornerRadius = 6;
    r.backgroundColor = isHot(s.last) ? new Color("#ffb340", 0.18) : new Color(s.color || "#888888", 0.3);
    addImage(r, plateImage(s.badge, s.color, opts.compact ? 16 : 18));
    txt(r, s.short, opts.compact ? 14 : 15, C.text, "race");
    r.addSpacer();
    const last = s.last;
    txt(r, last && last.result ? last.result.summary : "–", opts.compact ? 14 : 15, C.text, "race");
    txt(r, last ? shortTitle(last.title).replace(" GP", "") : "", 9, C.dim);
    txt(r, "·", 9, C.faint);
    txt(r, s.ranking ? `P${s.ranking.position}` : "–", opts.compact ? 14 : 15, C.text, "race");
    txt(r, s.ranking ? `${Math.round(s.ranking.points)} PTS` : "", 9, C.dim);
    if (!opts.compact) parent.addSpacer(2);
  }
}

// ---------- NHL ----------
// Faint ice markings drawn as the matchup background (same layout as the desktop RinkLines).
function rinkImage() {
  const w = 400, h = 100;
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const line = (x1, y1, x2, y2, color, width) => {
    const p = new Path(); p.move(new Point(x1, y1)); p.addLine(new Point(x2, y2));
    ctx.addPath(p); ctx.setStrokeColor(color); ctx.setLineWidth(width); ctx.strokePath();
  };
  const red = new Color("#ff453a", 0.3), blue = new Color("#0a84ff", 0.32);
  line(20, 8, 20, 92, red, 1.2); line(380, 8, 380, 92, red, 1.2);
  line(118, 0, 118, 100, blue, 2.5); line(282, 0, 282, 100, blue, 2.5);
  line(200, 0, 200, 9, new Color("#ff453a", 0.45), 2.5); line(200, 91, 200, 100, new Color("#ff453a", 0.45), 2.5);
  ctx.setFillColor(new Color("#0a84ff", 0.16));
  ctx.fillEllipse(new Rect(11, 41, 18, 18)); ctx.fillEllipse(new Rect(371, 41, 18, 18));
  return ctx.getImage();
}

function streakOf(c) {
  const m = (c.form || "").match(/·\s*([A-Z]+)(\d+)/);
  return m ? { code: m[1], n: m[2] } : null;
}

async function nhlBlock(parent, sport, opts) {
  const s = sport.subjects[0];
  const r = s.ranking;
  const h = hstack(parent, 5);
  await img(h, s.image, 16);
  txt(h, "NHL", 9, C.dim, "bold");
  h.addSpacer();
  if (r) txt(h, `${r.label} #${r.position} · ${r.points} pts`, 9, C.teal, "bold");
  if (r && r.note && opts.note) txt(parent, r.note, 9, C.dim);
  parent.addSpacer(3);
  const ev = s.next;
  if (ev && ev.competitors) {
    // Matchup on a faint ice sheet.
    const m = hstack(parent, 6);
    m.setPadding(opts.compact ? 3 : 6, 10, opts.compact ? 3 : 6, 10);
    m.cornerRadius = 12;
    m.backgroundColor = isHot(ev) && ev.status !== "live" ? new Color("#ffb340", 0.16) : new Color("#e1f5ff", 0.07);
    m.backgroundImage = rinkImage();
    const team = async (c) => {
      const t = vstack(m, 1);
      await img(t, c.logo, opts.compact ? 20 : 26);
      txt(t, c.short, 11, C.text, "heavy");
      if (!opts.compact) {
        const st = streakOf(c);
        if (c.record) txt(t, c.record, 8, C.dim);
        if (st) pill(t, `${st.code}${st.n}`, new Color(st.code === "W" ? "#30d158" : "#ff453a", 0.35));
      }
    };
    await team(ev.competitors[0]);
    m.addSpacer();
    const mid = vstack(m, 1);
    if (ev.status === "live") {
      const lv = ev.live || {};
      txt(mid, `${ev.competitors[0].score || 0} : ${ev.competitors[1].score || 0}`, opts.compact ? 18 : 22, C.text, "round");
      txt(mid, `● ${lv.intermission ? `${lv.period} INT` : `${lv.period || "LIVE"}${lv.clock ? " · " + lv.clock : ""}`}`, 9, C.live, "bold");
      if (lv.sog && !opts.compact) txt(mid, `SOG ${lv.sog.away}–${lv.sog.home}`, 8, C.dim);
    } else {
      txt(mid, clock(ev.start), opts.compact ? 15 : 18, C.text, "semi");
      txt(mid, `${relDay(ev, T.en)} · ${countdown(ev)}`, 9, C.teal, "semi");
    }
    m.addSpacer();
    await team(ev.competitors[1]);
  } else {
    txt(parent, "No upcoming games", 11, C.dim);
  }
  // Last game as a scoreboard capsule: away · FINAL · home, loser dimmed.
  const last = s.last;
  if (last && last.competitors) {
    parent.addSpacer(opts.compact ? 2 : 5);
    const row = hstack(parent, 5);
    row.setPadding(opts.compact ? 2 : 4, 8, opts.compact ? 2 : 4, 8);
    row.cornerRadius = 9;
    row.backgroundColor = isHot(last) ? new Color("#ffb340", 0.16) : new Color("#000000", 0.3);
    const [a, b] = last.competitors;
    const col = (c) => (c.winner === false ? C.faint : C.text);
    await img(row, a.logo, 16);
    txt(row, a.short, 10, col(a), "bold");
    txt(row, a.score, 15, col(a), "round");
    row.addSpacer();
    const suffix = ((last.result || {}).summary || "").match(/\b(OT|SO)\b/);
    const mid = vstack(row, 0);
    txt(mid, `FINAL${suffix ? "/" + suffix[1] : ""}`, 8, C.dim, "heavy");
    if (!opts.compact) txt(mid, relDay(last, T.en), 8, C.faint);
    row.addSpacer();
    txt(row, b.score, 15, col(b), "round");
    txt(row, b.short, 10, col(b), "bold");
    await img(row, b.logo, 16);
    const o = (last.result || {}).outcome;
    if (o) pill(row, o === "win" ? "W" : "L", o === "win" ? new Color("#30d158", 0.5) : new Color("#ff453a", 0.5));
  }
}

// ---------- Badminton ----------
async function badmintonBlock(parent, sport, opts) {
  const zh = ZH_SPORTS.indexOf(sport.id) >= 0;
  const L = zh ? T.zh : T.en;
  txt(parent, `🏸 ${sport.name}`, 9, new Color("#e1fff0", 0.7), "bold");
  for (const s of sport.subjects) {
    parent.addSpacer(opts.compact ? 2 : 3);
    const h = hstack(parent, 5);
    if (s.country) txt(h, flag(s.country), 11);
    txt(h, s.name, 12, C.text, "bold");
    h.addSpacer();
    const r = s.ranking;
    if (r) {
      txt(h, zh ? ZH_EVENTS[r.label] || r.label : r.label, 10, C.dim, "semi");
      txt(h, `#${r.position}`, 12, GOLD, "round");
      if (r.change) txt(h, r.change > 0 ? `▲${r.change}` : `▼${-r.change}`, 9, r.change > 0 ? C.win : C.loss, "bold");
    }
    const n = s.next;
    const nl = hstack(parent, 4);
    txt(nl, L.next, 9, C.faint, "bold");
    if (n) {
      txt(nl, n.competitors ? `${round(n, zh)} vs ${cname(n.competitors[1], zh)}` : title(n, zh), 10, C.text);
      nl.addSpacer();
      txt(nl, `${relDay(n, L)} · ${countdown(n, zh)}`, 9, isHot(n) ? C.amber : C.dim);
    } else {
      txt(nl, L.none, 10, C.dim);
    }
    const l = s.last;
    if (l && l.result) {
      const ll = hstack(parent, 4);
      txt(ll, L.last, 9, C.faint, "bold");
      const opp = l.competitors ? cname(l.competitors[1], zh) : "";
      txt(ll, `${title(l, zh)} ${round(l, zh)} ${l.result.outcome === "win" ? (zh ? "胜" : "W") : (zh ? "负" : "L")} ${opp}`, 10, C.text);
      ll.addSpacer();
      txt(ll, l.result.summary, 9, isHot(l) ? C.amber : C.dim, "semi");
    }
  }
}

const BLOCKS = { f1: f1Block, nhl: nhlBlock, badminton: badmintonBlock };

const COURT_GREEN = ["#0e7052", "#0a2a20"]; // badminton theme (BWF court mats are green)
const GOLD = new Color("#ffd76a");

function sportBackground(w, sport) {
  if (sport.id === "f1") { const [a, b] = f1Colors(sport); w.backgroundGradient = gradient(a, 0.85, b, 0.85); return; }
  if (sport.id === "badminton") { w.backgroundGradient = gradient(COURT_GREEN[0], 1, COURT_GREEN[1], 1); return; }
  const c = sport.subjects.length === 1 && sport.subjects[0].color;
  w.backgroundGradient = c ? gradient(c, 1, "#0c0e10", 1) : gradient("#2a2d35", 1, "#16181d", 1);
}

// Next thing happening across sports (or within one sport).
function nextUp(data, sportId) {
  let best = null;
  for (const sp of data.sports) {
    if (sportId && sp.id !== sportId) continue;
    for (const s of sp.subjects) {
      const t = eventTime(s.next);
      if (!best || t < best.t) best = { t, sport: sp, subject: s, ev: s.next };
    }
  }
  return best;
}

function staleNote(w, data, sports) {
  const stale = sports.some((sp) => sp.subjects.some((s) => s.stale));
  if (!stale) return;
  w.addSpacer(2);
  const age = Math.round((Date.now() - Date.parse(data.generated_at)) / 60000);
  txt(w, `⚠ partly stale · ${age} min`, 8, C.amber);
}

// ---------- widgets per size ----------
async function smallWidget(data, param) {
  const w = new ListWidget();
  const n = nextUp(data, param);
  if (!n || !n.ev) { txt(w, "Nothing scheduled", 12, C.dim); return w; }
  sportBackground(w, n.sport);
  const zh = ZH_SPORTS.indexOf(n.sport.id) >= 0;
  const L = zh ? T.zh : T.en;
  const ev = n.ev;
  txt(w, n.sport.id === "f1" ? "FORMULA 1" : n.sport.name, 9, C.dim, "bold");
  w.addSpacer(4);
  txt(w, n.sport.id === "f1" ? shortTitle(ev.title) : n.subject.name, 13, C.text, "bold");
  txt(w, ev.competitors ? (zh ? `${round(ev, zh)} vs ${cname(ev.competitors[1], zh)}` : ev.subtitle) : (n.sport.id === "f1" ? ev.subtitle : title(ev, zh)), 11, C.dim);
  w.addSpacer();
  if (ev.status === "live") pill(w, L.live, C.live);
  txt(w, isDateOnly(ev) ? relDay(ev, L) : clock(ev.start), 24, C.text, "round");
  txt(w, isDateOnly(ev) ? countdown(ev, zh) : `${relDay(ev, L)} · ${countdown(ev, zh)}`, 10, isHot(ev) ? C.amber : C.dim, "semi");
  return w;
}

async function mediumWidget(data, param) {
  const sportId = param || (nextUp(data) || {}).sport && nextUp(data).sport.id;
  const sport = data.sports.find((s) => s.id === sportId) || data.sports[0];
  const w = new ListWidget();
  sportBackground(w, sport);
  if (sport.id === "f1") {
    const L = largeSize();
    w.backgroundImage = bandsBackground(new Size(L.width, Math.round(L.width * 0.47)),
      [{ share: 1, colors: f1Colors(sport), alpha: 0.9, checker: true }]);
    w.setPadding(14, 14, 10, 14);
    await f1Block(w, sport, { track: true, note: true });
  } else {
    w.setPadding(12, 14, 12, 14);
    await BLOCKS[sport.id](w, sport, { track: true, note: true });
  }
  staleNote(w, data, [sport]);
  return w;
}

// Large widget size in points, by screen size (Apple's published widget sizes).
function largeSize() {
  const sc = Device.screenSize();
  const w = Math.min(sc.width, sc.height), h = Math.max(sc.width, sc.height);
  const table = [[440, 956, 382, 400], [430, 932, 364, 382], [428, 926, 364, 382], [414, 896, 360, 379],
    [402, 874, 364, 382], [393, 852, 338, 354], [390, 844, 338, 354], [375, 812, 329, 345],
    [360, 780, 329, 345], [414, 736, 348, 357], [375, 667, 321, 324], [320, 568, 292, 311]];
  const hit = table.find(([sw, sh]) => sw === Math.round(w) && sh === Math.round(h));
  return hit ? new Size(hit[2], hit[3]) : new Size(Math.round(w * 0.86), Math.round(w * 0.9));
}

// Large: three full-bleed colour bands (F1 / NHL / badminton). The bands and the F1 chequered
// strip are one background image (stretched by iOS to the real size); content stacks are
// transparent with heights in the same proportions.
async function largeWidget(data) {
  const w = new ListWidget();
  w.setPadding(0, 0, 0, 0);
  const size = largeSize();
  const share = { f1: 0.35, nhl: 0.29, badminton: 0.36 }; // tuned to content height
  const total = data.sports.reduce((a, sp) => a + (share[sp.id] || 0.33), 0);
  const frac = (sp) => (share[sp.id] || 0.33) / total;
  w.backgroundImage = bandsBackground(size, data.sports.map((sp) => ({
    share: frac(sp), colors: BAND_COLORS(sp), alpha: sp.id === "f1" ? 0.9 : 1, checker: sp.id === "f1",
  })));
  for (const sport of data.sports) {
    const box = w.addStack();
    box.layoutVertically();
    // Width 0 = stretch to the widget (rows contain spacers); only the height is fixed.
    box.size = new Size(0, Math.floor(size.height * frac(sport)));
    box.setPadding(sport.id === "f1" ? 10 : 8, 14, 6, 14);
    box.addSpacer(); // centre the content vertically in its band
    await BLOCKS[sport.id](box, sport, { track: sport.id === "f1", note: false, compact: true });
    if (sport.subjects.some((x) => x.stale)) txt(box, "⚠ stale", 8, C.amber);
    box.addSpacer();
  }
  return w;
}

function lockScreenWidget(data, param, family) {
  const w = new ListWidget();
  const n = nextUp(data, param);
  if (!n || !n.ev) { txt(w, "—", 12); return w; }
  const ev = n.ev;
  const zh = ZH_SPORTS.indexOf(n.sport.id) >= 0;
  const L = zh ? T.zh : T.en;
  const what = ev.competitors ? (n.sport.id === "nhl" ? `${ev.competitors[0].short} @ ${ev.competitors[1].short}` : `vs ${cname(ev.competitors[1], zh)}`)
    : n.sport.id === "f1" ? `${shortTitle(ev.title).replace(" GP", "")} ${ev.subtitle}` : title(ev, zh);
  const when = isDateOnly(ev) ? relDay(ev, L) : `${relDay(ev, L)} ${clock(ev.start)}`;
  if (family === "accessoryInline") { txt(w, `${what} · ${when}`, 12); return w; }
  if (family === "accessoryCircular") {
    w.addSpacer();
    const p = parts(Date.parse(ev.start) - Date.now());
    const big = isDateOnly(ev) ? `${Math.max(0, daysFromToday(ev.start))}d` : p.d ? `${p.d}d` : `${p.h}h`;
    const t1 = txt(w, n.sport.id === "f1" ? "F1" : n.sport.id === "nhl" ? n.subject.short : "🏸", 10, C.text, "bold"); t1.centerAlignText();
    const t2 = txt(w, ev.status === "live" ? "LIVE" : big, 16, C.text, "round"); t2.centerAlignText();
    w.addSpacer();
    return w;
  }
  txt(w, n.sport.id === "f1" ? "F1" : n.sport.id === "nhl" ? "NHL" : n.sport.name, 10, C.dim, "bold");
  txt(w, what, 13, C.text, "bold");
  txt(w, ev.status === "live" ? L.live : `${when} · ${countdown(ev, zh)}`, 11, C.text);
  return w;
}

// ---------- detail page (WebView, interactive) ----------
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const hex2rgba = (hex, a) => { const n = parseInt((hex || "#888888").slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

function trackSVG(track) {
  if (!track || !track.points) return "";
  const pts = track.points, cuts = track.sectors || [], pad = 4;
  const seg = (a, b) => pts.slice(a, b + 1).concat(b + 1 > pts.length ? [pts[0]] : []).map((p) => p.join(",")).join(" ");
  const bounds = [0, cuts[0] || pts.length, cuts[1] || pts.length, pts.length];
  const lines = cuts.length === 2
    ? [0, 1, 2].map((i) => `<polyline points="${seg(bounds[i], Math.min(bounds[i + 1], pts.length - 1))}" stroke="${SECTOR[i]}"/>`).join("")
    : `<polyline points="${seg(0, pts.length)}" stroke="#fff"/>`;
  return `<div class="trackbox"><svg class="track" viewBox="${-pad} ${-pad} ${track.w + pad * 2} ${track.h + pad * 2}">
    <polyline points="${seg(0, pts.length)}" stroke="rgba(0,0,0,.45)" stroke-width="7"/>${lines}
    <circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="3.4" fill="#fff" stroke="#000"/></svg>
    ${cuts.length === 2 ? `<div class="legend">${["S1", "S2", "S3"].map((t, i) => `<b style="color:${SECTOR[i]}">${t}</b>`).join(" ")}</div>` : ""}</div>`;
}

function f1HTML(sport) {
  const ev = (sport.subjects.find((s) => s.next) || {}).next;
  const [c1, c2] = f1Colors(sport);
  const carbon = "repeating-linear-gradient(45deg,rgba(255,255,255,.025) 0 2px,transparent 2px 4px),repeating-linear-gradient(-45deg,rgba(0,0,0,.09) 0 2px,transparent 2px 4px)";
  let h = `<section class="card f1" style="background:${carbon},linear-gradient(140deg,${hex2rgba(c1, .6)},rgba(20,20,26,.75) 50%,${hex2rgba(c2, .55)})">
    <h6><span class="f1x logo">F1</span>${sport.next_round ? `<span class="f1x round">ROUND ${sport.next_round}</span>` : ""}</h6>`;
  if (ev) {
    const p = parts(Date.parse(ev.start) - Date.now());
    const days = Math.floor((Date.parse(ev.start) - Date.now()) / DAY);
    const lit = Math.max(0, Math.min(5, 5 - days));
    const lights = ev.status === "live" ? `<span class="f1x lout">LIGHTS OUT</span>`
      : `<span class="lights">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < lit ? "on" : ""}"></i>`).join("")}</span>`;
    h += `<div class="row"><div><div class="gp">${ev.image ? `<img class="flag" src="${esc(ev.image)}">` : ""}<span class="f1x">${esc(shortTitle(ev.title).toUpperCase())}</span></div><div class="dim">${esc(ev.location)}</div></div>${trackSVG(ev.track)}</div>
      <div class="count ${isHot(ev) ? "hot" : ""}"><div><div class="lbl">NEXT · <b>${esc(ev.subtitle)}</b> ${lights}</div>
      <div class="digits">${[["DAYS", p.d], ["HRS", p.h], ["MIN", p.m]].map(([u, n], i) => `${i ? `<span class="f1x sep">:</span>` : ""}<div><b class="f1x">${String(n).padStart(2, "0")}</b><i>${u}</i></div>`).join("")}</div></div>
      <div class="when"><div class="dim">${esc(relDay(ev, T.en))}</div><b class="f1x">${esc(clock(ev.start))}</b></div></div>
      <div class="strip">${(ev.sessions || []).map((s) => `<div class="${s.status === "final" ? "done" : s.start === ev.start ? "next" : ""}" ${s.start === ev.start ? `style="background:linear-gradient(135deg,${hex2rgba(c1, .75)},${hex2rgba(c2, .75)})"` : ""}><div><b class="f1x">${esc({ "Sprint Quali": "SQ", Sprint: "SPR", Qualifying: "QUALI", Race: "RACE" }[s.name] || s.name)}</b><span>${esc(weekday(s.start))} ${esc(clock(s.start).replace(":00", "").replace(" ", "").toLowerCase())}</span>${s.result ? `<em>${sport.subjects.map((d) => { const x = ((d.next || {}).sessions || []).find((y) => y.name === s.name); return x && x.result ? `${d.short} ${x.result.summary}` : ""; }).join(" · ")}</em>` : ""}</div></div>`).join("")}</div>`;
  }
  for (const s of sport.subjects) {
    const l = s.last, r = s.ranking;
    h += `<div class="driver ${isHot(l) ? "hot" : ""}" style="background:linear-gradient(100deg,${hex2rgba(s.color, .4)},${hex2rgba(s.color, .05)} 70%)">
      <div class="plate" style="background:${s.color || "#888"}"><span class="f1x">${esc(s.badge)}</span></div>
      <div class="who"><b class="f1x">${esc(s.short)}</b><div class="dim">${esc(s.team || "")}</div></div>
      <div class="stat tap" onclick="tbl('last_race')"><i>LAST RACE</i><b class="f1x">${esc(l && l.result ? l.result.summary : "–")}</b><span>${esc(l ? shortTitle(l.title).replace(" GP", "") : "")}</span></div>
      <div class="stat tap" onclick="tbl('standings')"><i>STANDINGS</i><b class="f1x">${r ? "P" + r.position : "–"}</b><span>${r ? Math.round(r.points) + " pts" : ""}</span></div></div>`;
  }
  // Timing-tower tables, toggled by the stats above.
  for (const kind of ["last_race", "standings"]) {
    const t = (sport.tables || {})[kind];
    if (!t) continue;
    h += `<div class="f1t" id="t_${kind}"><div class="f1t-h"><b class="f1x">${esc(shortTitle(t.title).toUpperCase())}</b><span>${esc(t.subtitle || "")}${sport.tables_stale ? " · ⚠ stale" : ""}</span></div>
      ${t.rows.map((r) => `<div class="f1t-r ${r.self ? "me" : ""}" ${r.self ? `style="box-shadow:inset 3px 0 0 ${r.color || "#fff"}"` : ""}><span class="p f1x">${r.pos}</span><span class="c" style="background:${r.color || "#888"}"></span><span class="cd f1x">${esc(r.code)}</span><span class="tm">${esc(r.team)}</span><span class="v">${esc(r.value)}</span><span class="x">${esc(r.extra)}</span></div>`).join("")}</div>`;
  }
  return h + "</section>";
}

function pathHTML(path, zh) {
  if (!path) return "";
  const nm = (c) => esc(zh && c.name_zh ? c.name_zh : c.name);
  return `<div class="path">${path.map((p) => {
    const head = `<span class="rd">${esc(zh ? ZH_ROUNDS[p.round] || p.round : p.round)}</span>${p.logo ? `<img src="${esc(p.logo)}">` : ""}<span class="nm">${nm(p)}</span>${p.seed ? `<span class="seed">${esc(p.seed)}</span>` : ""}`;
    if (!p.candidates) return `<div class="pr">${head}</div>`;
    return `<details><summary class="pr maybe">${head}<span class="more">${zh ? `等${p.pool}队` : `+${p.pool - 1}`}</span></summary>
      <div class="cands">${p.candidates.map((c) => `<div><span class="wr">${c.rank ? "#" + c.rank : "—"}</span>${c.logo ? `<img src="${esc(c.logo)}">` : ""}<span class="nm">${nm(c)}</span>${c.seed ? `<span class="seed">${esc(c.seed)}</span>` : ""}</div>`).join("")}</div></details>`;
  }).join("")}</div>`;
}

// NHL detail section, mirroring the desktop card (ice-sheet matchup, scoreboard, game detail).
const RINK_SVG = `<svg class="rink" viewBox="0 0 400 100" preserveAspectRatio="none">
  <line x1="20" y1="8" x2="20" y2="92" stroke="rgba(255,69,58,.28)" stroke-width="1.2"/><line x1="380" y1="8" x2="380" y2="92" stroke="rgba(255,69,58,.28)" stroke-width="1.2"/>
  <path d="M20,41 A9,9 0 0 1 20,59 Z" fill="rgba(10,132,255,.16)"/><path d="M380,41 A9,9 0 0 0 380,59 Z" fill="rgba(10,132,255,.16)"/>
  <line x1="118" y1="0" x2="118" y2="100" stroke="rgba(10,132,255,.3)" stroke-width="2.5"/><line x1="282" y1="0" x2="282" y2="100" stroke="rgba(10,132,255,.3)" stroke-width="2.5"/>
  <line x1="200" y1="0" x2="200" y2="9" stroke="rgba(255,69,58,.4)" stroke-width="2.5"/><line x1="200" y1="91" x2="200" y2="100" stroke="rgba(255,69,58,.4)" stroke-width="2.5"/></svg>`;
const PERIOD_NAMES = { 1: "1st Period", 2: "2nd Period", 3: "3rd Period", OT: "Overtime" };

function gameDetailHTML(ev, id) {
  const d = ev.detail;
  if (!d) return "";
  const [a, b] = ev.competitors;
  const logo = {};
  ev.competitors.forEach((c) => { logo[c.short] = c.logo; });
  const tint = (c) => (c.self ? "#5fd3da" : "rgba(255,255,255,.4)");
  const sog = d.sog || {}, total = (sog.away || 0) + (sog.home || 0) || 1;
  let periods = ["1", "2", "3"].concat(d.goals.some((g) => g.period === "OT") ? ["OT"] : []);
  if (ev.status === "live" && ev.live) periods = periods.slice(0, { "1ST": 1, "2ND": 2, "3RD": 3 }[ev.live.period] || 4);
  let h = `<div class="gd" id="${id}"><div class="gdh">Shots on goal</div><div class="sog"><span><i>${esc(a.short)}</i> ${sog.away}</span><span class="bar"><b style="width:${(100 * (sog.away || 0)) / total}%;background:${tint(a)}"></b><b style="flex:1;background:${tint(b)}"></b></span><span>${sog.home} <i>${esc(b.short)}</i></span></div>`;
  for (const p of periods) {
    const goals = d.goals.filter((g) => g.period === p);
    h += `<div class="gdh">${PERIOD_NAMES[p] || p}${goals.length ? "" : "<em>No scoring</em>"}</div>`;
    h += goals.map((g) => {
      const [x, y] = g.score.split("–"), aw = g.team === a.short;
      return `<div class="goal"><span class="t">${esc(g.time)}</span><img src="${esc(logo[g.team] || "")}"><div class="who"><b>${esc(g.scorer)}</b>${g.scorer_total ? `<i> (${g.scorer_total})</i>` : ""}${g.strength ? `<span class="tag">${g.strength}</span>` : ""}${g.empty_net ? `<span class="tag">EN</span>` : ""}<div class="ast">${esc(g.assists.length ? g.assists.join(", ") : "Unassisted")}</div></div><span class="sc">${aw ? `<b>${x}</b>` : x} – ${aw ? y : `<b>${y}</b>`}</span></div>`;
    }).join("");
  }
  if (d.shootout && d.shootout.length) {
    h += `<div class="gdh">Shootout</div>` + [a, b].map((c) => `<div class="so"><img src="${esc(c.logo || "")}"><b>${esc(c.short)}</b><span class="att">${d.shootout.filter((x) => x.team === c.short).map((x) => `<i class="${x.result === "goal" ? "hit" : ""}"></i>`).join("")}</span></div>`).join("")
      + d.shootout.filter((x) => x.winner).map((x) => `<div class="sow">Winner · ${esc(x.player)}</div>`).join("");
  }
  if (d.stars && d.stars.length) {
    h += `<div class="gdh">Three stars</div><div class="stars">${d.stars.map((st) => `<div><div class="st">${"★".repeat(st.star)}</div><img src="${esc(logo[st.team] || "")}"><div class="nm">${esc(st.name)}</div><div class="ln">${esc(st.pos)} · ${esc(st.line)}</div></div>`).join("")}</div>`;
  }
  return h + "</div>";
}

function nhlHTML(sport) {
  const s = sport.subjects[0];
  const r = s.ranking, n = s.next, l = s.last;
  let h = `<section class="card nhl" style="background:linear-gradient(160deg,${hex2rgba(s.color || "#006d75", .8)},rgba(12,14,16,.8) 75%)"><h6>NHL</h6>`;
  h += `<div class="subj"><div class="sh"><img src="${esc(s.image || "")}"><b>${esc(s.name)}</b>${r ? `<span class="rank">${esc(r.label)} <b>#${r.position}</b></span>` : ""}</div>${r && r.note ? `<div class="note">${esc(r.note)}</div>` : ""}`;
  if (n && n.competitors) {
    const [a, b] = n.competitors, live = n.status === "live", lv = n.live || {};
    const team = (c) => { const st = streakOf(c); return `<div class="team"><img src="${esc(c.logo || "")}"><b>${esc(c.short)}</b>${c.record ? `<span>${esc(c.record)}</span>` : ""}${st ? `<em class="streak ${st.code}">${st.code}${st.n}</em>` : ""}</div>`; };
    const mid = live
      ? `<div class="mid"><b class="ls">${a.score || 0}<i>:</i>${b.score || 0}</b><span class="lst"><u></u>${esc(lv.intermission ? `${lv.period} INT` : `${lv.period || "LIVE"}${lv.clock ? " · " + lv.clock : ""}`)}</span>${lv.sog ? `<em>SOG ${lv.sog.away}–${lv.sog.home}</em>` : ""}</div>`
      : `<div class="mid"><b>${esc(clock(n.start))}</b><span>${esc(relDay(n, T.en) + " · " + countdown(n))}</span><em>${esc(shortTitle(n.title))}</em></div>`;
    h += `<div class="matchup rinkbox ${!live && isHot(n) ? "hot" : ""}" ${live && n.detail ? `onclick="gd('gd_next')"` : ""}>${RINK_SVG}${team(a)}${mid}${team(b)}</div>${live ? gameDetailHTML(n, "gd_next") : ""}`;
  }
  if (l && l.competitors) {
    const [a, b] = l.competitors, o = (l.result || {}).outcome;
    const suffix = ((l.result || {}).summary || "").match(/\b(OT|SO)\b/);
    const lose = (c) => (c.winner === false ? "lose" : "");
    h += `<div class="lh">LAST${isHot(l) ? `<span class="pill">Last 24h</span>` : ""}</div>
      <div class="sbx ${isHot(l) ? "hot" : ""}" onclick="gd('gd_last')"><div class="side ${lose(a)}"><img src="${esc(a.logo || "")}"><b>${esc(a.short)}</b><strong>${a.score}</strong></div>
      <div class="fin"><span>FINAL${suffix ? "/" + suffix[1] : ""}</span><em>${esc(relDay(l, T.en))}</em></div>
      <div class="side home ${lose(b)}"><strong>${b.score}</strong><b>${esc(b.short)}</b><img src="${esc(b.logo || "")}"></div>${o ? `<span class="wl ${o}">${o === "win" ? "W" : "L"}</span>` : ""}${l.detail ? `<span class="tog">▾</span>` : ""}</div>${gameDetailHTML(l, "gd_last")}`;
  }
  if (s.stale) h += `<div class="stale">⚠ Couldn't refresh, showing older data</div>`;
  return h + "</div></section>";
}

// Badminton detail extras (same design as the desktop card).
const SHUTTLE_SVG = `<svg class="shuttle" viewBox="0 0 24 24"><path d="M12 22a3 3 0 0 0 3-3v-1H9v1a3 3 0 0 0 3 3z" fill="#ffd76a"/><path d="M9 18 4 4l5 2 3-4 3 4 5-2-5 14z" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 2v16M9 6l1 12M15 6l-1 12" stroke="rgba(255,255,255,.6)" stroke-width="1"/></svg>`;
const COURT_SVG = `<svg class="court-lines" viewBox="0 0 400 100" preserveAspectRatio="none"><g stroke="rgba(255,255,255,.13)" stroke-width="1.5" fill="none"><rect x="6" y="6" width="388" height="88"/><line x1="6" y1="16" x2="394" y2="16"/><line x1="6" y1="84" x2="394" y2="84"/><line x1="30" y1="6" x2="30" y2="94"/><line x1="370" y1="6" x2="370" y2="94"/><line x1="142" y1="6" x2="142" y2="94"/><line x1="258" y1="6" x2="258" y2="94"/><line x1="30" y1="50" x2="142" y2="50"/><line x1="258" y1="50" x2="370" y2="50"/></g><line x1="200" y1="0" x2="200" y2="100" stroke="rgba(255,255,255,.32)" stroke-width="2" stroke-dasharray="3 2"/></svg>`;

function scoreChartSVG(games) {
  const W = 300, H = 96, top = 14, bottom = 6, gap = 8;
  const total = games.reduce((a, g) => a + g.points.length, 0);
  const maxPts = Math.max(21, ...games.map((g) => Math.max(g.self, g.opp)));
  const usable = W - gap * (games.length - 1);
  const y = (v) => (H - bottom - ((H - top - bottom) * v) / maxPts).toFixed(1);
  let x0 = 0, out = "";
  games.forEach((g, gi) => {
    const w = (usable * g.points.length) / total;
    const x = (i) => (x0 + (w * (i + 1)) / g.points.length).toFixed(1);
    const line = (k) => `M${x0},${y(0)} ` + g.points.map((p, i) => `L${x(i)},${y(p[k])}`).join(" ");
    out += `<rect x="${x0}" y="${top - 2}" width="${w}" height="${H - top - bottom + 2}" rx="3" fill="rgba(255,255,255,.035)"/>
      <line x1="${x0}" y1="${y(11)}" x2="${x0 + w}" y2="${y(11)}" stroke="rgba(255,255,255,.08)" stroke-dasharray="2 2"/>
      <path d="${line(1)}" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="${line(0)}" fill="none" stroke="#ffd76a" stroke-width="1.8" stroke-linejoin="round"/>
      <text x="${x0 + 2}" y="9" font-size="8" fill="rgba(255,255,255,.5)">G${gi + 1}</text>
      <text x="${x0 + w - 2}" y="9" font-size="8.5" text-anchor="end" font-weight="700" fill="${g.self > g.opp ? "#ffd76a" : "rgba(255,255,255,.75)"}">${g.self}-${g.opp}</text>`;
    x0 += w + gap;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${out}</svg>`;
}

function badmintonDetailHTML(ev, selfName, id) {
  const d = ev.detail;
  if (!d) return "";
  const op = ev.competitors[1], st = d.stats || {};
  const hasPts = d.games.some((g) => g.points && g.points.length);
  const stat = (label, p) => (p && p[0] != null ? `<div class="stat2"><span class="lbl">${label}</span><span class="v gold">${p[0]}</span><span class="bar"><b style="width:${(100 * p[0]) / ((p[0] + p[1]) || 1)}%;background:#ffd76a"></b><b style="flex:1;background:rgba(255,255,255,.4)"></b></span><span class="v">${p[1]}</span></div>` : "");
  return `<div class="bd" id="${id}"><div class="bd-meta">${d.duration ? `<span>用时 ${d.duration} 分钟</span>` : ""}${d.venue ? `<span>${esc(d.venue)}</span>` : ""}</div>
    <div class="gdh">得分走势</div>${hasPts ? `${scoreChartSVG(d.games)}<div class="legend2"><span><i style="background:#ffd76a"></i>${esc(selfName)}</span><span><i style="background:rgba(255,255,255,.65)"></i>${esc(op.name_zh || op.name)}</span></div>` : `<div class="nopts">暂无逐分数据</div>`}
    ${st.rallies_won && st.rallies_won[0] != null ? `<div class="gdh">技术统计</div>${stat("总得分", st.rallies_won)}${stat("最长连续得分", st.max_streak)}${stat("局点", st.game_points)}` : ""}</div>`;
}

function h2hHTML(sport) {
  const zh = ZH_SPORTS.indexOf(sport.id) >= 0;
  const L = zh ? T.zh : T.en;
  const one = sport.subjects.length === 1 ? sport.subjects[0] : null;
  const bg = sport.id === "badminton" ? "background:linear-gradient(165deg,rgba(14,112,82,.85),rgba(8,44,34,.88) 60%,rgba(10,18,16,.9))"
    : one && one.color ? `background:linear-gradient(160deg,${hex2rgba(one.color, .8)},rgba(12,14,16,.8) 75%)` : "";
  let h = `<section class="card ${sport.id}" style="${bg}"><h6>${sport.id === "badminton" ? SHUTTLE_SVG : ""}${esc(sport.name)}</h6>`;
  for (const s of sport.subjects) {
    const r = s.ranking, n = s.next, l = s.last;
    const flag = s.country ? `https://img.bwfbadminton.com/image/upload/v2/assets/flag-circle-svg-custom/${s.country}.png` : s.image;
    h += `<div class="subj"><div class="sh">${flag ? `<img src="${esc(flag)}">` : ""}<b>${esc(s.name)}</b>${r ? `<span class="rank">${esc(zh ? ZH_EVENTS[r.label] || r.label : r.label)} <b>#${r.position}</b>${r.change ? `<i class="${r.change > 0 ? "up" : "down"}">${r.change > 0 ? "▲" + r.change : "▼" + -r.change}</i>` : ""}</span>` : ""}</div>`;
    if (r && r.note) h += `<div class="note">${esc(r.note)}</div>`;
    if (n && n.competitors) {
      const [a, b] = n.competitors;
      const team = (c) => `<div class="team"><img src="${esc(c.logo || "")}"><b>${esc(cname(c, zh))}</b>${c.record ? `<span>${esc(c.record)}</span>` : ""}${c.form ? `<em>${esc(c.form)}</em>` : ""}</div>`;
      h += `<div class="matchup ${isHot(n) ? "hot" : ""}">${team(a)}<div class="mid"><b>${esc(isDateOnly(n) ? relDay(n, L) : clock(n.start))}</b><span>${esc((isDateOnly(n) ? "" : relDay(n, L) + " · ") + countdown(n, zh))}</span><em>${esc(title(n, zh))}</em></div>${team(b)}</div>${pathHTML(n.path, zh)}`;
    } else if (n) {
      h += `<div class="lh">${L.next}</div><div class="line ${isHot(n) ? "hot" : ""}">${n.image ? `<img src="${esc(n.image)}">` : ""}<span>${esc(title(n, zh))}</span><em>${esc(relDay(n, L))} · ${esc(countdown(n, zh))}</em></div>${pathHTML(n.path, zh)}`;
    } else {
      h += `<div class="lh">${L.next} <span class="faint">${L.none}</span></div>`;
    }
    if (l && l.competitors) {
      const games = l.competitors.some((c) => c.games);
      h += `<div class="lh">${L.last}${games ? ` · ${esc(title(l, zh))} · ${esc(round(l, zh))}` : ""}${isHot(l) ? `<span class="pill">${L.recent}</span>` : ""}</div>`;
      if (games) {
        const nG = Math.max(...l.competitors.map((c) => (c.games || []).length));
        const bid = `bd_${s.id}`;
        h += `<div class="board court ${isHot(l) ? "hot" : ""}" ${l.detail ? `onclick="gd('${bid}')"` : ""}>${COURT_SVG}${l.competitors.map((c, i) => {
          const o = l.competitors[1 - i].games || [];
          return `<div class="${c.winner === false ? "lose" : ""}">${c.logo ? `<img src="${esc(c.logo)}">` : ""}<span class="nm">${esc(c.self && zh ? s.short : cname(c, zh))}</span>${Array.from({ length: nG }, (_, k) => `<b class="${(c.games || [])[k] > (o[k] || 0) ? "w" : ""}">${(c.games || [])[k] != null ? c.games[k] : ""}</b>`).join("")}<i>${c.winner ? "◀" : ""}</i></div>`;
        }).join("")}${l.detail ? `<span class="tog bt">▾</span>` : ""}</div>${badmintonDetailHTML(l, zh ? s.short : s.name, bid)}`;
      } else {
        const [a, b] = l.competitors;
        const o = (l.result || {}).outcome;
        h += `<div class="score ${isHot(l) ? "hot" : ""}"><img src="${esc(a.logo || "")}"><b class="${a.winner === false ? "lose" : ""}">${esc(a.short)} ${a.score}</b> – <b class="${b.winner === false ? "lose" : ""}">${b.score} ${esc(b.short)}</b><img src="${esc(b.logo || "")}"><span class="faint">${esc(relDay(l, L))}</span>${o ? `<span class="wl ${o}">${o === "win" ? "W" : "L"}</span>` : ""}</div>`;
      }
    }
    if (s.stale) h += `<div class="stale">⚠ ${zh ? "更新失败，显示的是旧数据" : "Couldn't refresh, showing older data"}</div>`;
    h += "</div>";
  }
  return h + "</section>";
}

function detailHTML(data, focus) {
  const css = `
  :root{color-scheme:dark}body{margin:0;padding:14px 14px 40px;background:#0d0f13;color:#fff;font:14px -apple-system,"PingFang SC",sans-serif;font-variant-numeric:tabular-nums}
  img{display:block}.dim{color:rgba(255,255,255,.55);font-size:12px}.faint{color:rgba(255,255,255,.38)}
  .card{border-radius:22px;padding:14px;margin-bottom:12px;background:#1d2027}h6{margin:0 0 10px;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.55)}
  .hot{background:rgba(255,179,64,.12)!important;box-shadow:inset 0 0 0 .5px rgba(255,179,64,.45)}
  .row{display:flex;justify-content:space-between;align-items:center}.gp{display:flex;gap:8px;align-items:center;font-size:18px;font-weight:700}.flag{width:30px;height:20px;border-radius:4px;object-fit:cover}
  .trackbox{flex:none;width:130px}.track{width:130px;stroke-width:3.6;fill:none;stroke-linejoin:round;stroke-linecap:round;overflow:visible}.legend{text-align:right;font-size:9px;white-space:nowrap}
  .count{display:flex;justify-content:space-between;align-items:flex-end;margin:12px 0;padding:10px 12px;border-radius:14px;background:rgba(0,0,0,.22)}.lbl{font-size:11px;color:rgba(255,255,255,.55)}
  .digits{display:flex;gap:12px}.digits div{text-align:center}.digits b{display:block;font-size:30px}.digits i{font-style:normal;font-size:9px;color:rgba(255,255,255,.45)}.when{text-align:right}.when b{font-size:17px}
  .f1x{font-family:"HelveticaNeue-CondensedBlack","Helvetica Neue",sans-serif;font-weight:900;font-style:italic;letter-spacing:.01em}
  .card.f1{position:relative;overflow:hidden;padding-top:18px}.card.f1::before{content:"";position:absolute;left:0;right:0;top:0;height:6px;opacity:.55;background:repeating-conic-gradient(#fff 0 25%,#111 0 50%) 0 0/6px 6px}
  .card.f1 h6{display:flex;align-items:center;gap:8px}.logo{color:#ff2a1f;font-size:16px;letter-spacing:0}.round{font-size:11px;padding:1px 7px;border-radius:3px;background:rgba(255,255,255,.15);color:#fff}
  .card.f1 .gp span{font-size:21px;line-height:1}.card.f1 .count{background:rgba(0,0,0,.32);box-shadow:inset 3px 0 0 #ff2a1f;border-radius:12px}
  .lbl{display:flex;align-items:center;gap:8px}.lights{display:inline-flex;gap:3px;padding:3px 5px;border-radius:4px;background:#0b0b0d;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
  .lights i{width:8px;height:8px;border-radius:50%;background:#5a1c1c}.lights i.on{background:#ff2a1f;box-shadow:0 0 6px #ff2a1f}.lout{color:#30d158;font-size:12px}
  .card.f1 .digits{align-items:flex-start;gap:5px}.card.f1 .digits b{font-size:38px;line-height:.95}.sep{font-size:28px;color:rgba(255,255,255,.3)}.card.f1 .when b{font-size:20px}
  .strip{display:flex;gap:5px;margin:0 3px 10px}.strip>div{flex:1;text-align:center;padding:6px 0;border-radius:3px;transform:skewX(-12deg);background:rgba(255,255,255,.07)}.strip>div>div{transform:skewX(12deg)}
  .strip b{display:block;font-size:12px}.strip span{font-size:10px;color:rgba(255,255,255,.6)}.strip em{display:block;font-size:9px;font-style:normal;color:rgba(255,255,255,.75)}
  .strip .done{opacity:.55}.strip .next{background:rgba(255,255,255,.18)}
  .driver{display:flex;align-items:center;gap:10px;padding:7px 8px 7px 6px;border-radius:10px;margin-top:6px}
  .plate{width:40px;height:32px;display:flex;align-items:center;justify-content:center;transform:skewX(-12deg);border-radius:3px;box-shadow:inset 0 -3px 0 rgba(0,0,0,.25)}.plate span{transform:skewX(12deg);font-size:22px}
  .who{flex:1}.driver .who b{font-size:21px}.stat{width:68px;text-align:right}.stat i{display:block;font-size:8px;font-style:normal;color:rgba(255,255,255,.45)}.stat b{font-size:24px}.stat span{display:block;font-size:10px;color:rgba(255,255,255,.5)}
  .stat.tap i{border-bottom:1px dotted rgba(255,255,255,.4);display:inline-block}
  .f1t{display:none;margin-top:8px;border-radius:10px;overflow:hidden;background:rgba(0,0,0,.42)}.f1t.open{display:block}
  .f1t-h{display:flex;justify-content:space-between;align-items:baseline;padding:7px 10px 6px 16px;position:relative;background:rgba(255,255,255,.06)}
  .f1t-h::before{content:"";position:absolute;left:0;top:0;bottom:0;width:7px;background:repeating-conic-gradient(#fff 0 25%,#111 0 50%) 0 0/7px 7px;opacity:.6}
  .f1t-h b{font-size:15px}.f1t-h span{font-size:10px;color:rgba(255,255,255,.45)}
  .f1t-r{display:flex;align-items:center;gap:7px;height:22px;padding:0 10px;font-size:12px;color:rgba(255,255,255,.8)}.f1t-r:nth-child(odd){background:rgba(255,255,255,.035)}.f1t-r.me{color:#fff;background:rgba(255,255,255,.13)}
  .f1t-r .p{width:20px;text-align:right;font-size:13px;color:rgba(255,255,255,.55)}.f1t-r .c{width:4px;height:13px;border-radius:1px;transform:skewX(-12deg)}.f1t-r .cd{width:34px;font-size:14px}
  .f1t-r .tm{flex:1;min-width:0;color:rgba(255,255,255,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.f1t-r .v{font-family:"SF Mono",Menlo,monospace;font-size:11px}.f1t-r .x{width:30px;text-align:right;font-family:"SF Mono",Menlo,monospace;font-size:10px;color:rgba(255,255,255,.45)}
  .subj+.subj{margin-top:14px;padding-top:12px;border-top:.5px solid rgba(255,255,255,.12)}.sh{display:flex;align-items:center;gap:8px}.sh img{width:22px;height:22px;object-fit:contain}.sh>b{flex:1;font-size:15px}
  .rank{font-size:11px;color:rgba(255,255,255,.6)}.rank b{color:#fff;font-size:13px}.up{color:#30d158;font-style:normal}.down{color:#ff6961;font-style:normal}.note{font-size:11px;color:#5fd3da;margin:3px 0 0 30px}
  .matchup{display:flex;align-items:center;margin-top:8px;padding:10px;border-radius:14px;background:rgba(0,0,0,.22)}.team{width:84px;text-align:center}.team img{width:40px;height:40px;margin:0 auto 3px;object-fit:contain}.team b{display:block}.team span{display:block;font-size:10px;color:rgba(255,255,255,.6)}.team em{display:block;font-size:9px;font-style:normal;color:rgba(255,255,255,.4)}
  .mid{flex:1;text-align:center}.mid b{display:block;font-size:22px}.mid span{display:block;font-size:11px;color:#5fd3da}.mid em{display:block;font-size:10px;font-style:normal;color:rgba(255,255,255,.4)}
  .lh{display:flex;gap:8px;align-items:center;font-size:10px;font-weight:700;letter-spacing:.06em;color:rgba(255,255,255,.45);margin:10px 0 4px}.pill{background:rgba(255,179,64,.2);color:#ffb340;padding:1px 6px;border-radius:6px}
  .line{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:10px}.line img{width:18px;height:18px;border-radius:50%}.line span{flex:1}.line em{font-style:normal;font-size:12px;color:rgba(255,255,255,.6)}
  .path{padding:4px 8px}.pr{display:flex;align-items:center;gap:7px;height:22px;font-size:13px;list-style:none}.pr::-webkit-details-marker{display:none}.pr img,.cands img{width:15px;height:15px;border-radius:50%}
  .rd{width:52px;font-size:10px;font-weight:700;color:rgba(255,255,255,.45)}.nm{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.maybe .nm{color:rgba(255,255,255,.65)}
  .more{font-size:11px;color:rgba(255,255,255,.5);border-bottom:1px dotted rgba(255,255,255,.4)}details[open] .more{color:#fff}
  .seed{font-size:10px;font-weight:700;padding:0 5px;border-radius:4px;background:rgba(255,255,255,.12)}
  .cands{margin:2px 0 6px 59px;padding:4px 8px;border-radius:9px;background:rgba(0,0,0,.25)}.cands div{display:flex;gap:7px;align-items:center;height:20px;font-size:12px}.wr{width:34px;font-size:10px;font-weight:700;color:rgba(255,255,255,.5)}
  .board{padding:5px 8px;border-radius:10px}.board div{display:flex;align-items:center;gap:8px;height:26px}.board img{width:18px;height:18px;border-radius:50%}.board b{width:26px;text-align:right;color:rgba(255,255,255,.4)}.board b.w{color:#fff}.board i{width:10px;font-size:9px}.board .lose{color:rgba(255,255,255,.45)}
  .score{display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:10px}.score img{width:20px;height:20px}.score .lose{color:rgba(255,255,255,.4)}.score .faint{margin-left:auto;font-size:11px}
  .wl{font-size:10px;font-weight:800;padding:2px 6px;border-radius:5px}.wl.win{background:rgba(48,209,88,.2);color:#30d158}.wl.loss{background:rgba(255,69,58,.2);color:#ff6961}
  .rinkbox{position:relative;overflow:hidden;border-radius:16px;background:linear-gradient(180deg,rgba(225,245,255,.09),rgba(225,245,255,.02))!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.13)}
  .rinkbox>*{position:relative;z-index:1}.rinkbox .rink{position:absolute;inset:0;width:100%;height:100%;z-index:0}
  .team em.streak,.streak{display:inline-block;margin-top:3px;padding:0 6px;border-radius:4px;font-size:10px;font-weight:800;font-style:normal}.streak.W{background:rgba(48,209,88,.18);color:#30d158}.streak.L,.streak.OT{background:rgba(255,69,58,.18);color:#ff6961}
  .ls{font-size:32px!important}.ls i{font-style:normal;color:rgba(255,255,255,.35);margin:0 6px}.lst{display:inline-flex!important;align-items:center;gap:6px;color:#ff6961!important;font-weight:700}.lst u{width:7px;height:7px;border-radius:50%;background:#ff453a;box-shadow:0 0 0 3px rgba(255,69,58,.25)}
  .sbx{display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:13px;background:rgba(0,0,0,.3)}.sbx .side{display:flex;align-items:center;gap:7px;flex:1}.sbx .side.home{justify-content:flex-end}
  .sbx img{width:26px;height:26px;object-fit:contain}.sbx b{font-size:13px}.sbx strong{font-size:26px;min-width:18px;text-align:center}.sbx .lose{opacity:.42}
  .fin{text-align:center;min-width:64px}.fin span{display:inline-block;padding:1px 7px;border-radius:5px;font-size:10px;font-weight:800;background:rgba(255,255,255,.12)}.fin em{display:block;font-style:normal;font-size:10px;color:rgba(255,255,255,.45);margin-top:2px}.tog{font-size:10px;color:rgba(255,255,255,.4)}
  .gd{display:none;margin-top:7px;padding:10px 11px;border-radius:13px;background:rgba(0,0,0,.26)}.gd.open{display:block}
  .gdh{display:flex;align-items:center;gap:8px;margin:11px 0 5px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.5)}.gdh:after{content:"";flex:1;height:.5px;background:rgba(255,255,255,.12)}.gdh:first-child{margin-top:0}.gdh em{font-style:normal;font-weight:400;letter-spacing:0;text-transform:none;color:rgba(255,255,255,.32)}
  .sog{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700}.sog i{font-style:normal;color:rgba(255,255,255,.4);font-weight:400}.sog .bar{flex:1;height:7px;display:flex;gap:2px}.sog .bar b{display:block;height:100%;border-radius:4px}
  .goal{display:flex;align-items:flex-start;gap:8px;padding:5px 0}.goal .t{flex:none;width:42px;text-align:center;border-radius:6px;font-size:11px;line-height:17px;background:rgba(255,255,255,.07);color:rgba(255,255,255,.7)}
  .goal img{width:18px;height:18px;object-fit:contain}.goal .who{flex:1;min-width:0;font-size:14px;line-height:18px}.goal .who b{font-size:14px;font-weight:600}.goal .who i{font-style:normal;color:rgba(255,255,255,.4)}.goal .ast{font-size:11px;line-height:14px;color:rgba(255,255,255,.42)}
  .goal .tag{font-size:9px;font-weight:800;padding:1px 4px;border-radius:3px;margin-left:5px;background:rgba(255,179,64,.18);color:#ffb340}.goal .sc{font-size:14px;color:rgba(255,255,255,.45)}.goal .sc b{color:#fff}
  .so{display:flex;align-items:center;gap:8px;height:24px;font-size:13px}.so img{width:18px;height:18px}.so .att{display:flex;gap:6px}.so .att i{width:10px;height:10px;border-radius:50%;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.3)}.so .att i.hit{background:#30d158;box-shadow:none}.sow{font-size:11px;color:rgba(255,255,255,.45)}
  .stars{display:flex;gap:7px}.stars>div{flex:1;min-width:0;text-align:center;padding:8px 4px;border-radius:10px;background:rgba(255,255,255,.05)}.stars .st{color:#ffd23f;font-size:10px;letter-spacing:1px}.stars img{width:22px;height:22px;margin:4px auto 3px}.stars .nm{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.stars .ln{font-size:10px;color:rgba(255,255,255,.5)}
  .shuttle{width:15px;height:15px;margin-right:6px;vertical-align:-3px}.card.badminton h6{color:rgba(225,255,240,.75)}.card.badminton .rank b{color:#ffd76a;font-size:15px}
  .card.badminton .path{position:relative;padding:2px 8px 2px 22px}.card.badminton .path:before{content:"";position:absolute;left:13px;top:11px;bottom:11px;width:1.5px;background:rgba(255,255,255,.18)}
  .card.badminton .pr{position:relative}.card.badminton .pr:before{content:"";position:absolute;left:-12px;top:8px;width:7px;height:7px;border-radius:50%;background:#ffd76a;box-shadow:0 0 0 2px rgba(10,40,30,.9)}
  .card.badminton .pr.maybe:before{background:transparent;box-shadow:inset 0 0 0 1.5px rgba(255,215,106,.7),0 0 0 2px rgba(10,40,30,.9)}
  .board.court{position:relative;overflow:hidden;background:rgba(4,60,44,.55);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}.board.court>*:not(svg):not(.tog){position:relative;z-index:1}
  .court-lines{position:absolute;inset:0;width:100%;height:100%;z-index:0}.board.court b.w{color:#ffd76a}.tog.bt{position:absolute;right:7px;bottom:3px;font-size:9px;z-index:1}
  .bd{display:none;margin-top:7px;padding:10px 11px;border-radius:13px;background:rgba(0,0,0,.28)}.bd.open{display:block}
  .bd-meta{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.bd-meta span{font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.75)}
  .chart{display:block;width:100%;height:110px}.legend2{display:flex;gap:14px;font-size:11px;color:rgba(255,255,255,.6);margin:4px 0 6px}.legend2 i{display:inline-block;width:12px;height:2px;margin-right:5px;vertical-align:4px}
  .stat2{display:flex;align-items:center;gap:8px;height:24px;font-size:13px}.stat2 .lbl{width:92px;font-size:12px;color:rgba(255,255,255,.55)}.stat2 .v{width:26px;text-align:center;font-weight:700}.stat2 .gold{color:#ffd76a}
  .stat2 .bar{flex:1;height:6px;display:flex;gap:2px}.stat2 .bar b{display:block;height:100%;border-radius:3px}.nopts{font-size:12px;color:rgba(255,255,255,.4)}
  .stale{margin-top:6px;font-size:11px;color:#ffb340}.foot{text-align:center;font-size:11px;color:rgba(255,255,255,.35)}`;
  const order = data.sports.slice().sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : 0));
  const body = order.map((sp) => (sp.id === "f1" ? f1HTML(sp) : sp.id === "nhl" ? nhlHTML(sp) : h2hHTML(sp))).join("");
  const age = Math.round((Date.now() - Date.parse(data.generated_at)) / 60000);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>
    <body>${body}<script>function gd(id){var e=document.getElementById(id);if(e)e.classList.toggle('open')}function tbl(k){document.querySelectorAll('.f1t').forEach(function(t){t.classList.toggle('open',t.id==='t_'+k&&!t.classList.contains('open'))})}</script><div class="foot">Updated ${age < 1 ? "just now" : age + " min ago"}</div></body></html>`;
}

// ---------- main ----------
async function buildWidget(data, family, param) {
  if (family === "small") return smallWidget(data, param);
  if (family === "large" || family === "extraLarge") return largeWidget(data);
  if (family && family.startsWith("accessory")) return lockScreenWidget(data, param, family);
  return mediumWidget(data, param);
}

const param = ((args.widgetParameter || (args.queryParameters || {}).sport || "") + "").trim().toLowerCase() || null;

if (config.runsInWidget) {
  let w;
  try {
    const data = await DATA.load(CONFIG, { maxAgeMin: REFRESH_MIN, lite: true });
    TZ = data.timezone || TZ;
    w = await buildWidget(data, config.widgetFamily, param);
  } catch (e) {
    // Show the reason instead of a blank widget.
    w = new ListWidget();
    w.backgroundColor = new Color("#1c1f26");
    txt(w, "Sports Tracker", 11, C.dim, "bold");
    const t = w.addText(String(e).slice(0, 200));
    t.font = Font.systemFont(10);
    t.textColor = C.amber;
  }
  w.url = `scriptable:///run/${encodeURIComponent(Script.name())}?view=detail${param ? "&sport=" + param : ""}`;
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MIN * 60000);
  Script.setWidget(w);
} else {
  let data;
  try { data = await DATA.load(CONFIG, { force: true }); } catch (e) { data = DATA.readCached(); }
  TZ = data.timezone || TZ;
  let choice = (args.queryParameters || {}).view === "detail" ? 0 : null;
  if (choice === null) {
    const a = new Alert();
    a.title = "Sports Tracker";
    ["详情页 Detail", "预览 小号", "预览 中号 · F1", "预览 中号 · NHL", "预览 中号 · 羽毛球", "预览 大号"].forEach((t) => a.addAction(t));
    a.addCancelAction("取消");
    choice = await a.presentSheet();
  }
  if (choice === 0) {
    const wv = new WebView();
    await wv.loadHTML(detailHTML(data, param));
    await wv.present(true);
  } else if (choice === 1) (await smallWidget(data, null)).presentSmall();
  else if (choice >= 2 && choice <= 4) (await mediumWidget(data, ["f1", "nhl", "badminton"][choice - 2])).presentMedium();
  else if (choice === 5) (await largeWidget(data)).presentLarge();
}
Script.complete();
