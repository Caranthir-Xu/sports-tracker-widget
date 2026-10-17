// Übersicht widget: renders data.json written by fetch.py.
// Display-only: local times, countdowns and highlights are computed here from UTC.
// Style: macOS-widget cards; F1 in Box Box style, head-to-head in Apple Sports style.
// Drag any card header to move the widget; double-click a header to reset.
// Cards with nothing within 48 h collapse to one line; the chevron toggles them.

// Written by the launchd runtime copy (see launchd/install.sh).
// $HOME is expanded by the shell that runs `command`.
const DATA = "$HOME/Library/Application Support/sports-tracker/data.json";

export const command = `cat "${DATA}"`;
export const refreshFrequency = 60 * 1000; // re-read every minute for countdowns

const DAY = 24 * 3600 * 1000;
const AMBER = "#ffb340";
const LIVE_RED = "#ff453a";
const TEAL = "#5fd3da"; // light Sharks teal for accents on the teal card
const SECTOR_COLORS = ["#ff3b4f", "#3aa0ff", "#ffd23f"]; // S1 / S2 / S3, F1 TV style
const ACTIVE_WINDOW = 48 * 3600 * 1000; // card expands when an event is this close
const ZH_SPORTS = ["badminton"]; // sports rendered in Chinese

export const className = `
  top: 10px;
  right: 14px;
  width: 344px;
  font-family: -apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif;
  font-variant-numeric: tabular-nums;
  color: #fff;
  -webkit-font-smoothing: antialiased;
  user-select: none;

  * { box-sizing: border-box; }
  img { display: block; -webkit-user-drag: none; }

  .card {
    margin-bottom: 10px;
    padding: 13px 14px 12px;
    border-radius: 22px;
    background: rgba(30, 30, 34, 0.58);
    -webkit-backdrop-filter: blur(30px) saturate(170%);
    box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.14), 0 8px 24px rgba(0, 0, 0, 0.18);
  }
  .card-h {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 10px; font-weight: 700; letter-spacing: 0.09em;
    color: rgba(255, 255, 255, 0.55); text-transform: uppercase;
    margin: -4px -4px 5px; padding: 4px 4px; border-radius: 8px;
    cursor: grab;
  }
  .card-h:active { cursor: grabbing; }
  .dim { color: rgba(255, 255, 255, 0.55); }
  .faint { color: rgba(255, 255, 255, 0.36); }
  .pill {
    display: inline-block; padding: 1px 6px; border-radius: 6px;
    font-size: 9px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
  }
  .pill.live { background: ${LIVE_RED}; color: #fff; }
  .pill.recent { background: rgba(255, 179, 64, 0.2); color: ${AMBER}; }
  .stale { margin-top: 6px; font-size: 10px; color: ${AMBER}; }
  .ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hot { background: rgba(255, 179, 64, 0.1); box-shadow: inset 0 0 0 0.5px rgba(255, 179, 64, 0.4); }

  /* ---- F1 ---- */
  .gp { display: flex; align-items: center; gap: 9px; }
  .gp .flag { width: 30px; height: 20px; border-radius: 4px; object-fit: cover; }
  .gp-name { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
  .gp-loc { font-size: 11px; }
  .count {
    display: flex; align-items: flex-end; justify-content: space-between;
    margin: 11px 0 10px; padding: 9px 11px; border-radius: 14px;
    background: rgba(0, 0, 0, 0.22);
  }
  .count-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  .count-label b { color: #fff; }
  .digits { display: flex; gap: 10px; margin-top: 3px; }
  .digit { text-align: center; }
  .digit .n { font-size: 26px; font-weight: 700; line-height: 1; letter-spacing: -0.02em; }
  .digit .u { font-size: 8px; font-weight: 700; letter-spacing: 0.1em; color: rgba(255, 255, 255, 0.45); margin-top: 3px; }
  .count-when { text-align: right; font-size: 11px; line-height: 1.35; }
  .count-when .t { font-size: 15px; font-weight: 600; color: #fff; }
  .strip { display: flex; margin-bottom: 10px; gap: 2px; }
  .sess { flex: 1; text-align: center; padding: 5px 0 4px; border-radius: 8px; }
  .sess .nm { font-size: 9px; font-weight: 800; letter-spacing: 0.06em; }
  .sess .dt { font-size: 10px; color: rgba(255, 255, 255, 0.6); margin-top: 1px; }
  .sess.done { opacity: 0.38; }
  .sess.next .dt { color: #fff; }
  .sess.live { background: ${LIVE_RED}; }
  .driver {
    display: flex; align-items: center; gap: 10px;
    padding: 7px 8px 7px 0; border-radius: 12px;
  }
  .driver + .driver { margin-top: 4px; }
  .driver .bar { width: 3px; align-self: stretch; border-radius: 2px; }
  .driver .num { width: 26px; font-size: 20px; font-weight: 800; text-align: center; letter-spacing: -0.03em; color: rgba(255, 255, 255, 0.9); }
  .driver .who { flex: 1; min-width: 0; }
  .driver .code { font-size: 14px; font-weight: 800; letter-spacing: 0.02em; }
  .driver .meta { font-size: 10px; margin-top: 1px; }
  .driver .wk { font-size: 9px; margin-top: 2px; color: rgba(255, 255, 255, 0.75); }
  .driver .stat { width: 60px; text-align: right; }
  .driver .stat .k { font-size: 8px; font-weight: 700; letter-spacing: 0.08em; color: rgba(255, 255, 255, 0.45); }
  .driver .stat .v { font-size: 18px; font-weight: 800; line-height: 1.1; letter-spacing: -0.02em; }
  .driver .stat .s { font-size: 9px; color: rgba(255, 255, 255, 0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ---- head-to-head (NHL, badminton) ---- */
  .subj + .subj { margin-top: 12px; padding-top: 11px; border-top: 0.5px solid rgba(255, 255, 255, 0.12); }
  .subj-h { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .subj-h .logo { width: 22px; height: 22px; object-fit: contain; }
  .subj-h .logo.flag { width: 20px; height: 14px; border-radius: 3px; object-fit: cover; }
  .subj-h .nm { flex: 1; min-width: 0; font-size: 13px; font-weight: 700; }
  .rank { font-size: 10px; font-weight: 700; letter-spacing: 0.04em; color: rgba(255, 255, 255, 0.6); white-space: nowrap; }
  .rank b { color: #fff; font-size: 12px; }
  .matchup {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 10px; border-radius: 14px; background: rgba(0, 0, 0, 0.2);
  }
  .team { width: 70px; text-align: center; }
  .team img { width: 36px; height: 36px; margin: 0 auto 3px; object-fit: contain; }
  .team img.flag { width: 30px; height: 20px; border-radius: 4px; object-fit: cover; margin: 8px auto 6px; }
  .team .ab { font-size: 12px; font-weight: 800; letter-spacing: 0.03em; }
  .mid { flex: 1; text-align: center; min-width: 0; }
  .mid .big { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
  .mid .sm { font-size: 10px; margin-top: 2px; }
  .row-h {
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
    font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: rgba(255, 255, 255, 0.45); margin: 9px 0 4px;
  }
  .score-row { display: flex; align-items: center; gap: 7px; font-size: 12px; padding: 5px 8px; border-radius: 10px; }
  .score-row img { width: 18px; height: 18px; object-fit: contain; }
  .score-row .s { font-size: 15px; font-weight: 700; min-width: 12px; text-align: center; }
  .score-row .lose { color: rgba(255, 255, 255, 0.4); }
  .score-row .gap { flex: 1; }
  .wl { font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 5px; }
  .wl.win { background: rgba(48, 209, 88, 0.2); color: #30d158; }
  .wl.loss { background: rgba(255, 69, 58, 0.2); color: #ff6961; }
  .board { padding: 4px 8px; border-radius: 10px; }
  .board-r { display: flex; align-items: center; gap: 7px; height: 21px; font-size: 12px; }
  .board-r img { width: 17px; height: 12px; border-radius: 2px; object-fit: cover; }
  .board-r .nm { flex: 1; min-width: 0; }
  .board-r .g { width: 22px; text-align: right; font-size: 13px; font-weight: 600; }
  .board-r .tri { width: 8px; font-size: 8px; color: #fff; }
  .board-r.lose { color: rgba(255, 255, 255, 0.45); }
  .board-r .g.w { color: #fff; font-weight: 800; }
  .board-r .g.l { color: rgba(255, 255, 255, 0.4); }
  .line { display: flex; align-items: center; gap: 7px; font-size: 12px; padding: 4px 8px; border-radius: 10px; }
  .line img { width: 17px; height: 12px; border-radius: 2px; object-fit: cover; }
  .line .t { flex: 1; min-width: 0; }
  .err { padding: 12px; font-size: 12px; color: ${LIVE_RED}; }

  /* ---- San Jose Sharks theme: teal card, light-teal accents ---- */
  .card.nhl .mid .sm.dim, .card.nhl .rank b, .card.nhl .card-h .accent, .card.nhl .note { color: ${TEAL}; }
  .card.nhl .matchup { box-shadow: inset 0 -2px 0 ${TEAL}; }

  /* ---- extras ---- */
  .note { font-size: 10px; margin: -4px 0 7px 30px; color: rgba(255, 255, 255, 0.6); }
  .chg { font-size: 10px; font-weight: 700; margin-left: 4px; }
  .chg.up { color: #30d158; }
  .chg.down { color: #ff6961; }
  .chg.same { color: rgba(255, 255, 255, 0.35); }
  .team .rec { font-size: 9px; color: rgba(255, 255, 255, 0.6); margin-top: 1px; }
  .team .frm { font-size: 8px; color: rgba(255, 255, 255, 0.4); white-space: nowrap; }
  .gp-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .track { flex: none; }
  .track svg { display: block; overflow: visible; }
  .legend { display: flex; justify-content: flex-end; gap: 6px; font-size: 8px; font-weight: 800; margin-top: 3px; }
  .path { margin-top: 4px; padding: 3px 8px; }
  .path-r { display: flex; align-items: center; gap: 6px; height: 17px; font-size: 11px; }
  .path-r .rd { width: 42px; font-size: 9px; font-weight: 700; color: rgba(255, 255, 255, 0.45); }
  .path-r img { width: 14px; height: 14px; border-radius: 50%; object-fit: cover; }
  .path-r .nm { flex: 1; min-width: 0; }
  .path-r.maybe .nm { color: rgba(255, 255, 255, 0.6); }
  .more { cursor: pointer; border-bottom: 1px dotted rgba(255, 255, 255, 0.35); }
  .more:hover { color: #fff; }
  .cands { display: none; margin: 1px 0 4px 48px; padding: 3px 6px; border-radius: 8px; background: rgba(0, 0, 0, 0.18); }
  .cands.open { display: block; }
  .cand { display: flex; align-items: center; gap: 6px; height: 16px; font-size: 10px; color: rgba(255, 255, 255, 0.8); }
  .cand .wr { width: 30px; font-size: 9px; font-weight: 700; color: rgba(255, 255, 255, 0.5); }
  .cand img { width: 12px; height: 12px; border-radius: 50%; object-fit: cover; }
  .cand .nm { flex: 1; min-width: 0; }
  .seed { font-size: 9px; font-weight: 700; padding: 0 4px; border-radius: 4px; background: rgba(255, 255, 255, 0.12); }
  .chev {
    cursor: pointer; padding: 0 4px; margin-left: 6px; font-size: 10px;
    color: rgba(255, 255, 255, 0.55); letter-spacing: 0;
  }
  .card-h .right { display: flex; align-items: center; gap: 6px; }
  .summary { display: none; font-size: 12px; align-items: center; gap: 7px; }
  .summary .t { flex: 1; min-width: 0; }
  .summary img { width: 18px; height: 18px; object-fit: contain; }
  .summary img.flag { width: 20px; height: 14px; border-radius: 3px; object-fit: cover; }
  .card.collapsed .body { display: none; }
  .card.collapsed .summary { display: flex; }
  .card.collapsed .card-h { margin-bottom: 4px; }
  .card.collapsed { padding-bottom: 10px; }
`;

// ---------- drag to move (position saved in the widget's localStorage) ----------

const POS_KEY = "sports-tracker-pos";

function loadPos() {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY)) || { x: 0, y: 0 };
  } catch (e) {
    return { x: 0, y: 0 };
  }
}

function savePos(p) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch (e) { /* not persisted */ }
}

function startDrag(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  const root = e.currentTarget.closest("[data-root]");
  const start = loadPos();
  const sx = e.clientX, sy = e.clientY;
  let pos = start;
  const move = (ev) => {
    pos = { x: start.x + ev.clientX - sx, y: start.y + ev.clientY - sy };
    root.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  };
  const up = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    savePos(pos);
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}

function resetPos(e) {
  savePos({ x: 0, y: 0 });
  e.currentTarget.closest("[data-root]").style.transform = "translate(0px, 0px)";
}

const Header = ({ children, style }) => (
  <div className="card-h" onMouseDown={startDrag} onDoubleClick={resetPos} style={style}>{children}</div>
);

// ---------- auto-collapse (manual toggle remembered until the auto state flips) ----------

const FOLD_KEY = "sports-tracker-fold";

function loadFold() {
  try { return JSON.parse(localStorage.getItem(FOLD_KEY)) || {}; } catch (e) { return {}; }
}

// Something live, within the next 48 h, or finished in the last 24 h?
function isActive(sport, tz) {
  return sport.subjects.some((s) => {
    const n = s.next, l = s.last;
    if (isHot(n, tz) || isHot(l, tz)) return true;
    if (!n) return false;
    if (isDateOnly(n)) return daysFromToday(n.start, tz) <= 1;
    return Date.parse(n.start) - Date.now() < ACTIVE_WINDOW;
  });
}

function isCollapsed(sport, tz) {
  const auto = !isActive(sport, tz);
  const saved = loadFold()[sport.id];
  return saved && saved.auto === auto ? saved.collapsed : auto;
}

function toggleFold(e, sportId, auto) {
  e.stopPropagation();
  const card = e.currentTarget.closest(".card");
  const collapsed = !card.classList.contains("collapsed");
  card.classList.toggle("collapsed", collapsed);
  e.currentTarget.textContent = collapsed ? "▸" : "▾";
  const all = loadFold();
  all[sportId] = { collapsed, auto };
  try { localStorage.setItem(FOLD_KEY, JSON.stringify(all)); } catch (err) { /* not persisted */ }
}

const Chevron = ({ sport, tz, collapsed }) => (
  <span className="chev" onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => toggleFold(e, sport.id, !isActive(sport, tz))}>{collapsed ? "▸" : "▾"}</span>
);

// One-line summary shown when a card is collapsed.
function Summary({ sport, tz, L, zh }) {
  const s = sport.subjects.find((x) => x.next) || sport.subjects[0];
  const ev = s && (s.next || s.last);
  if (!ev) return <div className="summary faint">—</div>;
  const title = zh ? zhTournament(ev.title) : shortTitle(ev.title);
  return (
    <div className="summary">
      <Img src={ev.image || s.image} cls={isFlag(ev.image || s.image) ? "flag" : ""} />
      <span className="t ellipsis">{title}{ev.subtitle ? ` · ${ev.subtitle}` : ""}</span>
      <span className="dim" style={{ fontSize: 11 }}>{s.next ? countdown(ev, tz, L) : relDay(ev, tz, L)}</span>
    </div>
  );
}

// ---------- strings (en / zh) ----------

const T = {
  en: {
    today: "Today", tomorrow: "Tomorrow", yesterday: "Yesterday", locale: "en-US",
    live: "Live", liveNow: "Live now", recent: "Last 24h", started: "started", underway: "underway",
    next: "Next", last: "Last", noEntries: "No upcoming entries",
    inDays: (d) => `in ${d} days`, inDH: (d, h) => `in ${d}d ${h}h`, inHM: (h, m) => `in ${h}h ${m}m`, inM: (m) => `in ${m}m`,
    stale: (a) => `⚠ Couldn't refresh · data from ${a}`,
    ago: (h) => (h < 1 ? "<1h ago" : h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`),
  },
  zh: {
    today: "今天", tomorrow: "明天", yesterday: "昨天", locale: "zh-CN",
    live: "进行中", liveNow: "进行中", recent: "24小时内", started: "已开始", underway: "进行中",
    next: "下一场", last: "最近一场", noEntries: "暂无报名赛事",
    inDays: (d) => `${d} 天后`, inDH: (d, h) => `${d}天${h}小时后`, inHM: (h, m) => `${h}小时${m}分后`, inM: (m) => `${m}分钟后`,
    stale: (a) => `⚠ 更新失败 · 数据来自${a}`,
    ago: (h) => (h < 1 ? "1小时内" : h < 48 ? `${h}小时前` : `${Math.floor(h / 24)}天前`),
  },
};

// Badminton terms. Tournament names match by substring of the English title.
const ZH_EVENTS = { MS: "男单", WS: "女单", MD: "男双", WD: "女双", XD: "混双" };
const ZH_ROUNDS = { F: "决赛", Final: "决赛", SF: "半决赛", QF: "1/4决赛", R16: "16强", R32: "32强", R64: "64强" };
const ZH_TOURNAMENTS = [
  ["World Tour Finals", "世界巡回赛总决赛"], ["All England", "全英公开赛"], ["Asian Games", "亚运会"],
  ["World Championships", "世锦赛"], ["Olympic", "奥运会"], ["Sudirman Cup", "苏迪曼杯"],
  ["Thomas", "汤姆斯杯"], ["Uber", "尤伯杯"], ["Asia Championships", "亚锦赛"],
  ["Malaysia Open", "马来西亚公开赛"], ["Malaysia Masters", "马来西亚大师赛"], ["India Open", "印度公开赛"],
  ["Indonesia Masters", "印尼大师赛"], ["Indonesia Open", "印尼公开赛"], ["Thailand Masters", "泰国大师赛"],
  ["Thailand Open", "泰国公开赛"], ["German Open", "德国公开赛"], ["Orleans Masters", "奥尔良大师赛"],
  ["Swiss Open", "瑞士公开赛"], ["Spain Masters", "西班牙大师赛"], ["Singapore Open", "新加坡公开赛"],
  ["Australian Open", "澳大利亚公开赛"], ["Japan Open", "日本公开赛"], ["Masters Japan", "日本大师赛"],
  ["China Open", "中国公开赛"], ["China Masters", "中国大师赛"], ["Macau Open", "澳门公开赛"],
  ["Hong Kong Open", "香港公开赛"], ["Taipei Open", "台北公开赛"], ["Korea Open", "韩国公开赛"],
  ["Korea Masters", "韩国大师赛"], ["Arctic Open", "北极公开赛"], ["Denmark Open", "丹麦公开赛"],
  ["French Open", "法国公开赛"], ["Hylo Open", "许洛公开赛"], ["HYLO Open", "许洛公开赛"],
  ["Syed Modi", "赛义德·莫迪国际赛"], ["Canada Open", "加拿大公开赛"], ["US Open", "美国公开赛"],
  ["Vietnam Open", "越南公开赛"],
];

const zhTournament = (t) => {
  const hit = ZH_TOURNAMENTS.find(([en]) => (t || "").indexOf(en) >= 0);
  return hit ? hit[1] : shortTitle(t);
};

// ---------- time helpers (all in data.timezone) ----------

const dayKey = (d, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d); // YYYY-MM-DD
const isDateOnly = (ev) => ev.time_precision === "date";
const daysFromToday = (key, tz) => Math.round((Date.parse(key) - Date.parse(dayKey(new Date(), tz))) / DAY);

// "Today" / "Tomorrow" / "Sat 10/17" (or 今天 / 明天 / 周六 10/17)
function relDay(ev, tz, L) {
  const key = isDateOnly(ev) ? ev.start : dayKey(new Date(ev.start), tz);
  const diff = daysFromToday(key, tz);
  if (diff === 0) return L.today;
  if (diff === 1) return L.tomorrow;
  if (diff === -1) return L.yesterday;
  const [y, m, d] = key.split("-").map(Number);
  const wd = new Date(y, m - 1, d).toLocaleDateString(L.locale, { weekday: "short" });
  return `${wd} ${m}/${d}`;
}

const clock = (iso, tz) =>
  new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });

const weekday = (iso, tz) => new Date(iso).toLocaleDateString("en-US", { timeZone: tz, weekday: "short" });

function parts(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), m: m % 60 };
}

function countdown(ev, tz, L) {
  if (ev.status === "live") return L.liveNow;
  if (isDateOnly(ev)) {
    const days = daysFromToday(ev.start, tz);
    return days > 1 ? L.inDays(days) : days === 1 ? L.tomorrow : days === 0 ? L.today : L.underway;
  }
  const ms = Date.parse(ev.start) - Date.now();
  if (ms <= 0) return L.started;
  const p = parts(ms);
  return p.d ? L.inDH(p.d, p.h) : p.h ? L.inHM(p.h, p.m) : L.inM(p.m);
}

// Live, or started within the last 24 hours.
function isHot(ev, tz) {
  if (!ev) return false;
  if (ev.status === "live") return true;
  if (isDateOnly(ev)) return ev.start === dayKey(new Date(), tz);
  const age = Date.now() - Date.parse(ev.start);
  return age >= 0 && age < DAY;
}

const hoursAgo = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 3600000);

// ---------- text helpers ----------

// "YONEX French Open 2026" -> "French Open"; "United States Grand Prix" -> "United States GP"
function shortTitle(t) {
  const s = (t || "").replace("Grand Prix", "GP").replace(/\s*\(.*?\)/g, "").replace(/\s20\d\d\b/, "").trim();
  const words = s.split(" ");
  let i = 0;
  while (i < words.length - 2 && /^[A-Z0-9-]{2,}$/.test(words[i])) i++; // sponsor prefixes
  return words.slice(i).join(" ");
}

// Hex colour + alpha (0-1) -> rgba(); falls back to grey.
function rgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  const n = m ? parseInt(m[1], 16) : 0x888888;
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const SESSION_ABBR = { "Sprint Quali": "SQ", Sprint: "SPR", Qualifying: "QUALI", Race: "RACE" };
const WEEKEND_ABBR = { "Sprint Quali": "SQ", Sprint: "SPR", Qualifying: "Q", Race: "R" };
const hideBroken = (e) => { e.target.style.visibility = "hidden"; };
const Img = ({ src, cls }) => (src ? <img src={src} className={cls || ""} onError={hideBroken} /> : null);

const Badge = ({ ev, tz, L }) =>
  ev && ev.status === "live" ? <span className="pill live">{L.live}</span>
  : isHot(ev, tz) ? <span className="pill recent">{ev.status === "final" ? L.recent : L.today}</span>
  : null;

const Stale = ({ s, L }) =>
  s.stale ? <div className="stale">{L.stale(s.updated_at ? L.ago(hoursAgo(s.updated_at)) : "—")}</div> : null;

// ---------- F1 card (Box Box style, team-colour theme) ----------

function Countdown({ ev, tz, L }) {
  const live = ev.status === "live";
  const p = parts(Date.parse(ev.start) - Date.now());
  return (
    <div className={`count ${isHot(ev, tz) ? "hot" : ""}`}>
      <div>
        <div className="count-label dim">{live ? <span className="pill live">Live</span> : "Next"} · <b>{ev.subtitle}</b></div>
        {live ? (
          <div className="digits"><div className="digit"><div className="n">On track</div></div></div>
        ) : (
          <div className="digits">
            {[["DAYS", p.d], ["HRS", p.h], ["MIN", p.m]].map(([u, n]) => (
              <div className="digit" key={u}>
                <div className="n">{String(n).padStart(2, "0")}</div>
                <div className="u">{u}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="count-when dim">
        <div>{relDay(ev, tz, L)}</div>
        <div className="t">{clock(ev.start, tz)}</div>
      </div>
    </div>
  );
}

function Strip({ sessions, nextStart, tz, accent }) {
  if (!sessions || !sessions.length) return null;
  return (
    <div className="strip">
      {sessions.map((s) => {
        const cls = s.status === "live" ? "live" : s.status === "final" ? "done" : s.start === nextStart ? "next" : "";
        return (
          <div className={`sess ${cls}`} key={s.name} style={cls === "next" ? { background: accent } : null}>
            <div className="nm">{SESSION_ABBR[s.name] || s.name}</div>
            <div className="dt">{weekday(s.start, tz)} {clock(s.start, tz).replace(":00", "").replace(" ", "").toLowerCase()}</div>
          </div>
        );
      })}
    </div>
  );
}

// Driver row: number, code/team, this weekend's session results, last race, standings.
function Driver({ s, tz }) {
  const color = s.color || "#888888";
  const last = s.last;
  const r = s.ranking;
  const hot = isHot(last, tz);
  const weekend = ((s.next && s.next.sessions) || []).filter((x) => x.result);
  return (
    <div className={`driver ${hot ? "hot" : ""}`}
         style={hot ? null : { background: `linear-gradient(90deg, ${rgba(color, 0.32)}, ${rgba(color, 0.04)} 75%)` }}>
      <div className="bar" style={{ background: color }} />
      <div className="num">{s.badge}</div>
      <div className="who">
        <div className="code">{s.short}</div>
        <div className="meta dim ellipsis">{s.team}</div>
        {weekend.length > 0 && (
          // Newest first, at most 3, so qualifying is never cut off.
          <div className="wk ellipsis">
            {weekend.slice(-3).reverse().map((x) => `${WEEKEND_ABBR[x.name] || x.name} ${x.result.summary}`).join(" · ")}
          </div>
        )}
      </div>
      <div className="stat">
        <div className="k">LAST RACE</div>
        <div className="v">{last && last.result ? last.result.summary : "–"}</div>
        <div className="s">{last ? shortTitle(last.title).replace(" GP", "") : ""}</div>
      </div>
      <div className="stat">
        <div className="k">STANDINGS</div>
        <div className="v">{r ? `P${r.position}` : "–"}</div>
        <div className="s">{r ? `${Math.round(r.points)} pts` : ""}</div>
      </div>
    </div>
  );
}

// Circuit outline split into S1/S2/S3 colours; white dot = start/finish line.
function Track({ track, width }) {
  if (!track || !track.points || track.points.length < 2) return null;
  const pts = track.points;
  const cuts = track.sectors || [];
  const bounds = [0, cuts[0] || pts.length, cuts[1] || pts.length, pts.length];
  const line = (a, b) => pts.slice(a, b + 1).concat(b + 1 > pts.length ? [pts[0]] : []).map((p) => p.join(",")).join(" ");
  const pad = 4;
  const height = width * (track.h + pad * 2) / (track.w + pad * 2);
  return (
    <div className="track">
      <svg width={width} height={height} viewBox={`${-pad} ${-pad} ${track.w + pad * 2} ${track.h + pad * 2}`}>
        <polyline points={line(0, pts.length)} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="7"
                  strokeLinejoin="round" strokeLinecap="round" />
        {cuts.length === 2 ? [0, 1, 2].map((i) => (
          <polyline key={i} points={line(bounds[i], Math.min(bounds[i + 1], pts.length - 1))} fill="none"
                    stroke={SECTOR_COLORS[i]} strokeWidth="3.6" strokeLinejoin="round" strokeLinecap="round" />
        )) : (
          <polyline points={line(0, pts.length)} fill="none" stroke="#fff" strokeWidth="3.6"
                    strokeLinejoin="round" strokeLinecap="round" />
        )}
        <circle cx={pts[0][0]} cy={pts[0][1]} r="3.4" fill="#fff" stroke="#000" strokeWidth="1" />
      </svg>
      {cuts.length === 2 && (
        <div className="legend">
          {["S1", "S2", "S3"].map((t, i) => <span key={t} style={{ color: SECTOR_COLORS[i] }}>{t}</span>)}
        </div>
      )}
    </div>
  );
}

function F1Card({ sport, tz }) {
  const L = T.en;
  const ev = (sport.subjects.find((s) => s.next) || {}).next;
  // Theme from the followed drivers' team colours (Ferrari red -> Red Bull blue).
  const c1 = (sport.subjects[0] || {}).color || "#ed1131";
  const c2 = (sport.subjects[1] || {}).color || "#1e3a8a";
  const bg = `linear-gradient(140deg, ${rgba(c1, 0.55)} 0%, rgba(26, 26, 34, 0.6) 50%, ${rgba(c2, 0.5)} 100%)`;
  const accent = `linear-gradient(135deg, ${rgba(c1, 0.75)}, ${rgba(c2, 0.75)})`;
  const collapsed = isCollapsed(sport, tz);
  return (
    <div className={`card f1 ${collapsed ? "collapsed" : ""}`} style={{ background: bg }}>
      <Header>
        <span>Formula 1</span>
        <span className="right"><Badge ev={ev} tz={tz} L={L} /><Chevron sport={sport} tz={tz} collapsed={collapsed} /></span>
      </Header>
      <Summary sport={sport} tz={tz} L={L} />
      <div className="body">
        {ev ? (
          <div>
            <div className="gp-row">
              <div className="gp">
                <Img src={ev.image} cls="flag" />
                <div>
                  <div className="gp-name">{shortTitle(ev.title)}</div>
                  <div className="gp-loc dim">{ev.location}</div>
                </div>
              </div>
              <Track track={ev.track} width={112} />
            </div>
            <Countdown ev={ev} tz={tz} L={L} />
            <Strip sessions={ev.sessions} nextStart={ev.start} tz={tz} accent={accent} />
          </div>
        ) : (
          <div className="dim" style={{ marginBottom: 8 }}>Season complete</div>
        )}
        {sport.subjects.map((s) => (
          <div key={s.id}><Driver s={s} tz={tz} /><Stale s={s} L={L} /></div>
        ))}
      </div>
    </div>
  );
}

// ---------- head-to-head card (Apple Sports style) ----------

const isFlag = (url) => /flag/i.test(url || "");

function Matchup({ ev, tz, L, zh }) {
  const [a, b] = ev.competitors;
  const live = ev.status === "live";
  const Team = ({ c }) => (
    <div className="team">
      <Img src={c.logo} cls={isFlag(c.logo) ? "flag" : ""} />
      <div className="ab ellipsis">{zh && c.name_zh ? c.name_zh : c.short}</div>
      {c.record && <div className="rec">{c.record}</div>}
      {c.form && <div className="frm">{c.form}</div>}
    </div>
  );
  const title = zh ? zhTournament(ev.title) : shortTitle(ev.title);
  return (
    <div className={`matchup ${isHot(ev, tz) ? "hot" : ""}`}>
      <Team c={a} />
      <div className="mid">
        <div className="big">
          {live ? `${a.score || 0} – ${b.score || 0}` : isDateOnly(ev) ? relDay(ev, tz, L) : clock(ev.start, tz)}
        </div>
        <div className="sm dim">
          {live ? <span className="pill live">{L.live}</span>
            : `${isDateOnly(ev) ? "" : relDay(ev, tz, L) + " · "}${countdown(ev, tz, L)}`}
        </div>
        <div className="sm faint ellipsis">{title}</div>
      </div>
      <Team c={b} />
    </div>
  );
}

// Compact final score: SJS 3 – 2 NSH   SO  W
function ScoreRow({ ev, tz, L }) {
  const [a, b] = ev.competitors;
  const suffix = ((ev.result && ev.result.summary) || "").match(/\b(OT|SO)\b/);
  const outcome = ev.result && ev.result.outcome;
  const dimIf = (c) => (c.winner === false ? "lose" : "");
  return (
    <div className={`score-row ${isHot(ev, tz) ? "hot" : ""}`}>
      <Img src={a.logo} />
      <span className={dimIf(a)}>{a.short}</span>
      <span className={`s ${dimIf(a)}`}>{a.score}</span>
      <span className="faint">–</span>
      <span className={`s ${dimIf(b)}`}>{b.score}</span>
      <span className={dimIf(b)}>{b.short}</span>
      <Img src={b.logo} />
      <span className="gap" />
      <span className="faint" style={{ fontSize: 10 }}>{relDay(ev, tz, L)}{suffix ? ` · ${suffix[1]}` : ""}</span>
      {outcome && <span className={`wl ${outcome}`}>{outcome === "win" ? "W" : "L"}</span>}
    </div>
  );
}

// Tennis-style board with per-game scores. selfName replaces our side's name.
function Board({ ev, tz, selfName, zh }) {
  const n = Math.max(...ev.competitors.map((c) => (c.games || []).length));
  const other = (i) => ev.competitors[1 - i].games || [];
  return (
    <div className={`board ${isHot(ev, tz) ? "hot" : ""}`}>
      {ev.competitors.map((c, i) => {
        const games = c.games || [];
        return (
          <div className={`board-r ${c.winner === false ? "lose" : ""}`} key={i}>
            <Img src={c.logo} />
            <span className="nm ellipsis" style={c.self ? { fontWeight: 700 } : null}>
              {c.self && selfName ? selfName : zh && c.name_zh ? c.name_zh : c.name}
            </span>
            {Array.from({ length: n }, (_, k) => (
              <span key={k} className={`g ${games[k] > (other(i)[k] || 0) ? "w" : "l"}`}>
                {games[k] != null ? games[k] : ""}
              </span>
            ))}
            <span className="tri">{c.winner ? "◀" : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

function NextLine({ ev, tz, L, zh }) {
  const title = zh ? zhTournament(ev.title) : shortTitle(ev.title);
  return (
    <div className={`line ${isHot(ev, tz) ? "hot" : ""}`}>
      <Img src={ev.image} />
      <span className="t ellipsis">{title}{ev.subtitle ? ` · ${ev.subtitle}` : ""}</span>
      <span className="dim" style={{ fontSize: 11 }}>{relDay(ev, tz, L)} · {countdown(ev, tz, L)}</span>
    </div>
  );
}

// Knockout path: actual or most likely opponent for each remaining round.
// Clicking "等N队" opens every possible opponent with their world ranking.
function toggleCands(e) {
  e.stopPropagation();
  const list = e.currentTarget.closest(".path-wrap").querySelector(".cands");
  if (list) list.classList.toggle("open");
}

function Path({ path, zh }) {
  if (!path || !path.length) return null;
  const name = (c) => (zh && c.name_zh ? c.name_zh : c.name);
  return (
    <div className="path">
      {path.map((p) => (
        <div className="path-wrap" key={p.round}>
          <div className={`path-r ${p.confirmed ? "" : "maybe"}`}>
            <span className="rd">{zh ? ZH_ROUNDS[p.round] || p.round : p.round}</span>
            <Img src={p.logo} />
            <span className="nm ellipsis">
              {name(p)}
              {!p.confirmed && p.pool > 1 ? (
                <span className="faint"> <span className="more" onClick={toggleCands}>{zh ? `等${p.pool}队` : `+${p.pool - 1}`}</span></span>
              ) : null}
            </span>
            {p.seed && <span className="seed">{p.seed}</span>}
          </div>
          {p.candidates && (
            <div className="cands">
              {p.candidates.map((c, i) => (
                <div className="cand" key={i}>
                  <span className="wr">{c.rank ? `#${c.rank}` : "—"}</span>
                  <Img src={c.logo} />
                  <span className="nm ellipsis">{name(c)}</span>
                  {c.seed && <span className="seed">{c.seed}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const Change = ({ n }) =>
  n == null ? null
  : n > 0 ? <span className="chg up">▲{n}</span>
  : n < 0 ? <span className="chg down">▼{-n}</span>
  : <span className="chg same">–</span>;

function Subject({ s, tz, L, zh }) {
  const r = s.ranking;
  const { next, last } = s;
  const hasGames = last && last.competitors && last.competitors.some((c) => c.games);
  const round = last && last.subtitle ? last.subtitle.split(" vs ")[0] : "";
  const lastLabel = hasGames
    ? `${L.last} · ${zh ? zhTournament(last.title) : shortTitle(last.title)} · ${zh ? ZH_ROUNDS[round] || round : round}`
    : L.last;
  return (
    <div className="subj">
      <div className="subj-h">
        <Img src={s.image} cls={`logo ${isFlag(s.image) ? "flag" : ""}`} />
        <span className="nm ellipsis">{s.name}</span>
        {r && <span className="rank">{zh ? ZH_EVENTS[r.label] || r.label : r.label} <b>#{r.position}</b><Change n={r.change} /></span>}
      </div>
      {r && r.note && <div className="note">{r.note}</div>}

      {next && next.competitors ? <div><Matchup ev={next} tz={tz} L={L} zh={zh} /><Path path={next.path} zh={zh} /></div>
        : next ? (
          <div>
            <div className="row-h"><span>{L.next}</span><Badge ev={next} tz={tz} L={L} /></div>
            <NextLine ev={next} tz={tz} L={L} zh={zh} />
            <Path path={next.path} zh={zh} />
          </div>
        ) : (
          <div className="row-h">
            <span>{L.next}</span>
            <span className="faint" style={{ letterSpacing: 0, textTransform: "none" }}>{L.noEntries}</span>
          </div>
        )}

      {last && (
        <div>
          <div className="row-h"><span className="ellipsis">{lastLabel}</span><Badge ev={last} tz={tz} L={L} /></div>
          {hasGames ? <Board ev={last} tz={tz} selfName={zh ? s.short : null} zh={zh} />
            : last.competitors ? <ScoreRow ev={last} tz={tz} L={L} />
            : <NextLine ev={last} tz={tz} L={L} zh={zh} />}
        </div>
      )}
      <Stale s={s} L={L} />
    </div>
  );
}

function H2HCard({ sport, tz }) {
  const zh = ZH_SPORTS.indexOf(sport.id) >= 0;
  const L = zh ? T.zh : T.en;
  const only = sport.subjects.length === 1 ? sport.subjects[0] : null;
  const r = only && only.ranking;
  // Single-team sports take their colour as the card theme (e.g. Sharks teal).
  const style = only && only.color
    ? { background: `linear-gradient(160deg, ${rgba(only.color, 0.7)} 0%, rgba(12, 14, 16, 0.66) 75%)` }
    : null;
  const collapsed = isCollapsed(sport, tz);
  return (
    <div className={`card ${sport.id} ${collapsed ? "collapsed" : ""}`} style={style}>
      <Header>
        <span>{sport.name}</span>
        <span className="right">
          {r && r.detail && <span className="accent">{r.detail} · {r.points} pts</span>}
          <Chevron sport={sport} tz={tz} collapsed={collapsed} />
        </span>
      </Header>
      <Summary sport={sport} tz={tz} L={L} zh={zh} />
      <div className="body">
        {sport.subjects.map((s) => <Subject s={s} tz={tz} L={L} zh={zh} key={s.id} />)}
      </div>
    </div>
  );
}

// ---------- root ----------

export const render = ({ output, error }) => {
  let data;
  try {
    data = JSON.parse(output);
  } catch (e) {
    return <div className="card err">No data yet{error ? ` (${error})` : ""}</div>;
  }
  const tz = data.timezone || "UTC";
  const pos = loadPos();
  return (
    <div data-root="" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
      {data.sports.map((sp) =>
        sp.id === "f1" ? <F1Card sport={sp} tz={tz} key={sp.id} /> : <H2HCard sport={sp} tz={tz} key={sp.id} />
      )}
    </div>
  );
};
