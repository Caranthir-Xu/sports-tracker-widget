// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: database;

// Sports Data — Scriptable module: the data layer of the desktop project, ported to JS.
// Builds the same data.json schema as fetch.py (see CLAUDE.md) directly on the phone.
// Usage: const data = await importModule("Sports Data").load(CONFIG, { maxAgeMin: 15 });

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const DAY = 24 * 3600 * 1000;
const NAMES_ZH_URL = "https://raw.githubusercontent.com/Caranthir-Xu/sports-tracker-widget/main/providers/badminton_names_zh.yaml";

// ---------- storage + http ----------

const fm = FileManager.local();
const DIR = fm.joinPath(fm.documentsDirectory(), "sports-tracker");
if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true);
const file = (name) => fm.joinPath(DIR, name);

function readJSON(name) {
  try { return JSON.parse(fm.readString(file(name))); } catch (e) { return null; }
}
function writeJSON(name, obj) { fm.writeString(file(name), JSON.stringify(obj)); }

const memo = {}; // per-run cache, so shared calls (standings, calendar) run once
// Widget runs fetch "lite": skip data only the detail page shows (goal/rally detail, draw paths,
// F1 tables). Widgets have tight memory/time limits; a killed run leaves iOS showing an old snapshot.
let LITE = false;
function getJSON(url, headers) {
  if (!memo[url]) {
    memo[url] = (async () => {
      const req = new Request(url);
      req.headers = Object.assign({ "User-Agent": UA }, headers || {});
      req.timeoutInterval = 20;
      const body = await req.loadString();
      const code = req.response && req.response.statusCode;
      if (code && code >= 400) throw new Error(`HTTP ${code} ${url.slice(0, 80)}`);
      return JSON.parse(body);
    })();
  }
  return memo[url];
}

async function getText(url) {
  const req = new Request(url);
  req.headers = { "User-Agent": UA };
  return req.loadString();
}

const qs = (o) => Object.entries(o).map(([k, v]) =>
  Array.isArray(v) ? v.map((x) => `${encodeURIComponent(k)}=${encodeURIComponent(x)}`).join("&")
    : `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");

// ---------- schema helpers (same shapes as providers/common.py) ----------

const now = () => new Date();
const iso = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, "Z");
const parseDt = (s) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s.replace(" ", "T") : s.replace(" ", "T") + "Z");

function event(o) {
  return {
    title: o.title, subtitle: o.subtitle || null, start: o.start,
    time_precision: o.precision || "exact", status: o.status, result: o.result || null,
    live: null, url: o.url || null, location: o.location || null, image: o.image || null,
    competitors: o.competitors || null, sessions: o.sessions || null,
    track: o.track || null, path: o.path || null, detail: o.detail || null, id: o.id || null,
    country: o.country || null, // ISO3/IOC code (iOS uses it for emoji flags)
  };
}
const result = (summary, outcome) => ({ outcome: outcome || null, summary });
function competitor(o) {
  return {
    name: o.name, short: o.short, name_zh: o.name_zh || null, logo: o.logo || null,
    score: o.score == null ? null : o.score, games: o.games || null,
    winner: o.winner == null ? null : o.winner, self: !!o.self,
    record: o.record || null, form: o.form || null, country: o.country || null,
  };
}

// =====================================================================
// F1 — OpenF1 (schedule, results), Jolpica (standings), MultiViewer (track)
// =====================================================================

const OPENF1 = "https://api.openf1.org/v1";
const JOLPICA = "https://api.jolpi.ca/ergast/f1";
const MULTIVIEWER = "https://api.multiviewer.app/api/v1/circuits";
const SHORT_NAMES = { "Practice 1": "FP1", "Practice 2": "FP2", "Practice 3": "FP3", "Sprint Qualifying": "Sprint Quali", "Sprint Shootout": "Sprint Quali" };
const ESPN_F1 = "https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard";

// OpenF1 with a last-good copy on disk (= Python _openf1): while any F1 session is live OpenF1
// answers 401 for everything, which left F1 stale for hours on race weekends.
async function openf1(path) {
  const file = `openf1_${path.replace(/[^a-z0-9]+/gi, "_")}.json`;
  try {
    const data = await getJSON(`${OPENF1}/${path}`);
    writeJSON(file, data);
    return data;
  } catch (e) {
    const cached = readJSON(file);
    if (cached) return cached;
    throw e;
  }
}

const ESPN_NAMES = { FP1: "FP1", FP2: "FP2", FP3: "FP3", QUAL: "Qualifying", RACE: "Race", SPRINT: "Sprint", SR: "Sprint", SS: "Sprint Quali", SQ: "Sprint Quali" };
const fold = (name) => String((name || "").split(/\s+/).pop() || "").normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase();
// ESPN's current F1 event: {short session name: {state, order: [surname...], date}} (= Python _espn_weekend).
let espnWk = null;
async function f1Espn() {
  if (espnWk) return espnWk;
  espnWk = {};
  try {
    const e = ((await getJSON(ESPN_F1)).events || [])[0];
    ((e && e.competitions) || []).forEach((c) => {
      const name = ESPN_NAMES[String((c.type || {}).abbreviation || "").toUpperCase()];
      if (!name) return;
      const st = (c.status || {}).type || {};
      const order = (c.competitors || []).slice().sort((a, b) => (a.order || 99) - (b.order || 99)).map((x) => fold((x.athlete || {}).fullName));
      const done = st.completed || ["STATUS_FINAL", "STATUS_SESSION_COMPLETE"].includes(st.name);
      espnWk[name] = { state: done && order.length ? "final" : st.state === "in" ? "live" : "scheduled", order, date: c.date };
    });
  } catch (e) { /* optional */ }
  return espnWk;
}
function espnFor(s) {
  const e = (espnWk || {})[SHORT_NAMES[s.session_name] || s.session_name];
  return e && e.date && Math.abs(parseDt(e.date) - parseDt(s.date_start)) < 6 * 3600000 ? e : null;
}

// Season schedule from Jolpica in OpenF1's shape (= Python _jolpica_sessions), when OpenF1 is locked
// and nothing is cached. No circuit/flag: fetchAll carries them over from the previous snapshot.
const JOLPICA_SESSIONS = [["FirstPractice", "Practice 1", 60], ["SecondPractice", "Practice 2", 60], ["ThirdPractice", "Practice 3", 60],
  ["SprintQualifying", "Sprint Qualifying", 45], ["Sprint", "Sprint", 60], ["Qualifying", "Qualifying", 60], [null, "Race", 120]];
async function f1JolpicaSessions() {
  const out = [];
  (await getJSON(`${JOLPICA}/current.json`)).MRData.RaceTable.Races.forEach((r) => {
    JOLPICA_SESSIONS.forEach(([key, name, min]) => {
      const slot = key ? r[key] : r;
      if (!slot || !slot.time) return;
      const start = Date.parse(`${slot.date}T${slot.time}`);
      out.push({ session_name: name, date_start: iso(start), date_end: iso(start + min * 60000), meeting_key: `jolpica-${r.season}-${r.round}`,
        meeting_name: r.raceName, location: r.Circuit.Location.locality, flag: null, session_key: null, circuit_key: null, year: +r.season });
    });
  });
  return out.sort((a, b) => a.date_start.localeCompare(b.date_start));
}

async function f1Sessions() {
  try { return await f1OpenF1Sessions(); } catch (e) { return f1JolpicaSessions(); }
}

async function f1OpenF1Sessions() {
  const year = now().getUTCFullYear();
  let out = [];
  for (const y of [year, year + 1]) {
    const [meetings, sessions] = await Promise.all([openf1(`meetings?year=${y}`), openf1(`sessions?year=${y}`)]);
    const byKey = {};
    meetings.forEach((m) => { byKey[m.meeting_key] = m; });
    sessions.forEach((s) => {
      const m = byKey[s.meeting_key] || {};
      out.push(Object.assign({}, s, { meeting_name: m.meeting_name || s.location, flag: m.country_flag, country_code: m.country_code }));
    });
    if (out.some((s) => parseDt(s.date_end) > now())) break;
  }
  return out.filter((s) => !s.is_cancelled).sort((a, b) => a.date_start.localeCompare(b.date_start));
}

function f1Status(s) {
  if (s.is_cancelled) return "cancelled";
  const e = espnFor(s);
  if (e && e.state !== "scheduled") return e.state; // ESPN knows when results are in
  if (now() < parseDt(s.date_start)) return "scheduled";
  return now() < parseDt(s.date_end) ? "live" : "final";
}

async function f1Result(s, number, surname) {
  if (f1Status(s) !== "final") return null;
  let rows = [];
  try { if (s.session_key) rows = await openf1(`session_result?session_key=${s.session_key}`); } catch (e) { /* ESPN below */ }
  const row = rows.find((r) => r.driver_number === number);
  if (!row) {
    const e = espnFor(s), i = e && surname ? e.order.indexOf(fold(surname)) : -1;
    return i >= 0 ? result(`P${i + 1}`) : null;
  }
  for (const f of ["dsq", "dns", "dnf"]) if (row[f]) return result(f.toUpperCase());
  return result(row.position ? `P${row.position}` : "NC");
}

async function f1Event(s, number, extra, surname) {
  const name = s.session_name;
  return event(Object.assign({
    title: s.meeting_name, subtitle: SHORT_NAMES[name] || name, start: iso(parseDt(s.date_start)),
    status: f1Status(s), result: await f1Result(s, number, surname), location: s.location, image: s.flag,
    country: s.country_code,
  }, extra || {}));
}

async function f1Profile(number) {
  const drivers = await openf1("drivers?session_key=latest").catch(() => []); // optional; fetchAll keeps old values
  const d = drivers.find((x) => x.driver_number === number);
  if (!d) return { badge: String(number) };
  return { team: d.team_name, color: d.team_colour ? `#${d.team_colour}` : null, image: d.headshot_url, badge: String(number) };
}

// {driverId: position} after the previous round (= Python _prev_positions), cached on disk:
// a finished round's standings never change. {} when unknown.
async function f1PrevPositions() {
  try {
    const lists = (await getJSON(`${JOLPICA}/current/driverStandings.json`)).MRData.StandingsTable.StandingsLists;
    const rnd = lists.length ? +lists[0].round : 0;
    if (rnd < 2) return {};
    const file = `f1_standings_${lists[0].season}_${rnd - 1}.json`;
    let map = readJSON(file);
    if (!map) {
      const prev = (await getJSON(`${JOLPICA}/current/${rnd - 1}/driverStandings.json`)).MRData.StandingsTable.StandingsLists;
      map = {};
      (prev.length ? prev[0].DriverStandings : []).forEach((d) => { map[d.Driver.driverId] = +d.position; });
      writeJSON(file, map);
    }
    return map;
  } catch (e) { return {}; } // change is optional
}
// Places moved since the previous round (+ = up); null when unknown.
const f1Change = (prev, id, pos) => (prev[id] ? prev[id] - pos : null);

async function f1Ranking(jolpicaId) {
  const t = await getJSON(`${JOLPICA}/current/driverStandings.json`);
  const lists = t.MRData.StandingsTable.StandingsLists;
  const rows = lists.length ? lists[0].DriverStandings : [];
  const d = rows.find((x) => x.Driver.driverId === jolpicaId);
  if (!d) return null;
  const wins = +d.wins;
  const gap = +rows[0].points - +d.points;
  return {
    label: "Drivers", position: +d.position, points: +d.points,
    detail: `${wins} win${wins !== 1 ? "s" : ""}`,
    note: d === rows[0] ? "Championship leader" : `${Math.round(gap)} pts behind leader`,
    change: f1Change(await f1PrevPositions(), jolpicaId, +d.position),
  };
}

// Track outline + sector split, cached per circuit on the phone.
async function f1Track(circuitKey, year) {
  const name = `track_${circuitKey}_${year}.json`;
  const cached = readJSON(name);
  if (cached) return cached;
  let mv = null;
  for (const y of [year, year - 1, year - 2]) {
    try { mv = await getJSON(`${MULTIVIEWER}/${circuitKey}/${y}`); break; } catch (e) { /* try older */ }
  }
  if (!mv) return null;
  const raw = mv.x.map((x, i) => [x, mv.y[i]]);

  // Reference lap (lap 5) from the most recent past session at this circuit.
  let lap = null;
  const past = (await getJSON(`${OPENF1}/sessions?circuit_key=${circuitKey}`))
    .filter((s) => parseDt(s.date_end) < now()).sort((a, b) => b.date_start.localeCompare(a.date_start)).slice(0, 4);
  for (const s of past) {
    let laps;
    try { laps = await getJSON(`${OPENF1}/laps?session_key=${s.session_key}&lap_number=5`); } catch (e) { continue; }
    lap = laps.find((l) => l.segments_sector_1 && l.duration_sector_2 && l.date_start);
    if (lap) break;
  }

  let sectors = null;
  if (lap) {
    const idx = mv.miniSectorsIndexes || [];
    const n1 = lap.segments_sector_1.length, n2 = (lap.segments_sector_2 || []).length;
    if (n2 && idx.length >= n1 + n2) {
      sectors = [idx[n1 - 1], idx[n1 + n2 - 1]]; // S2/S3 start after S1/S2 mini-sectors
    } else {
      // No mini-sector data: snap the car's position at S1/S2 end to the outline.
      const start = parseDt(lap.date_start).getTime();
      sectors = [];
      for (const secs of [lap.duration_sector_1, lap.duration_sector_1 + lap.duration_sector_2]) {
        const t = start + secs * 1000;
        const f = (ms) => new Date(ms).toISOString().replace("Z", "");
        let loc = [];
        try { loc = await getJSON(`${OPENF1}/location?session_key=${lap.session_key}&driver_number=${lap.driver_number}&date>${f(t - 600)}&date<${f(t + 600)}`); } catch (e) { /* none */ }
        if (!loc.length) { sectors = null; break; }
        const p = loc[Math.floor(loc.length / 2)];
        let best = 0, bd = Infinity;
        raw.forEach(([x, y], i) => { const d = (x - p.x) ** 2 + (y - p.y) ** 2; if (d < bd) { bd = d; best = i; } });
        sectors.push(best);
      }
    }
  }

  const rot = ((mv.rotation || 0) * Math.PI) / 180;
  const pts = raw.map(([x, y]) => [x * Math.cos(rot) - y * Math.sin(rot), -(x * Math.sin(rot) + y * Math.cos(rot))]);
  const step = Math.max(1, Math.floor(pts.length / 160));
  const keep = pts.filter((_, i) => i % step === 0);
  const xs = keep.map((p) => p[0]), ys = keep.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const scale = 100 / Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
  const track = {
    points: keep.map(([x, y]) => [Math.round((x - minX) * scale * 10) / 10, Math.round((y - minY) * scale * 10) / 10]),
    sectors: sectors ? sectors.map((i) => Math.floor(i / step)) : null,
    w: Math.round((Math.max(...xs) - minX) * scale * 10) / 10,
    h: Math.round((Math.max(...ys) - minY) * scale * 10) / 10,
  };
  if (track.sectors) writeJSON(name, track);
  return track;
}

// Driver's result in Jolpica's latest race (fallback when OpenF1 has none or is locked).
async function f1JolpicaRaceResult(jolpicaId, raceName) {
  try {
    const race = (await getJSON(`${JOLPICA}/current/last/results.json`)).MRData.RaceTable.Races[0];
    if (!race || race.raceName !== raceName) return null;
    const r = race.Results.find((x) => x.Driver.driverId === jolpicaId);
    if (!r) return null;
    return result(/^\d+$/.test(r.positionText) ? `P${r.positionText}` : ({ R: "DNF", D: "DSQ", W: "DNS", N: "NC" }[r.positionText] || r.positionText));
  } catch (e) { return null; }
}

async function f1Subject(subj) {
  const number = subj.number, surname = subj.name;
  await f1Espn();
  const sessions = await f1Sessions();
  const upcoming = sessions.filter((s) => parseDt(s.date_end) > now());
  const done = sessions.filter((s) => parseDt(s.date_end) <= now());

  let next = null;
  if (upcoming.length) {
    const first = upcoming[0];
    const weekend = sessions.filter((s) => s.meeting_key === first.meeting_key);
    const listing = await Promise.all(weekend.map(async (s) => ({
      name: SHORT_NAMES[s.session_name] || s.session_name, start: iso(parseDt(s.date_start)),
      status: f1Status(s), result: await f1Result(s, number, surname),
    })));
    let track = null;
    try { if (first.circuit_key) track = await f1Track(first.circuit_key, first.year); } catch (e) { /* optional */ }
    next = await f1Event(first, number, { sessions: listing, track }, surname);
  }
  // 'last' = latest Grand Prix race; weekend session results live in next.sessions.
  const races = done.filter((s) => s.session_name === "Race");
  const last = races.length ? await f1Event(races[races.length - 1], number, null, surname) : null;
  if (last && !last.result) last.result = await f1JolpicaRaceResult(subj.jolpica_id, last.title);
  const [ranking, profile] = await Promise.all([f1Ranking(subj.jolpica_id), f1Profile(number)]);
  return { ranking, next, last, profile };
}

// Sport-level tables shared by all drivers: last race classification, driver standings.
// Fallback team colours (OpenF1 team_colour, 2026) when OpenF1 is locked and not cached (= Python _team_colour).
const TEAM_COLOURS = { alpine: "#00A1E8", astonmartin: "#229971", audi: "#F50537", cadillac: "#909090", ferrari: "#ED1131", haas: "#9C9FA2",
  mclaren: "#F47600", mercedes: "#00D7B6", racingbulls: "#6C98FF", rb: "#6C98FF", redbull: "#4781D7", williams: "#1868DB" };
function teamColour(team) {
  let key = String(team || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const suf of ["f1team", "racing"]) if (key.endsWith(suf) && key !== suf) key = key.slice(0, -suf.length);
  return TEAM_COLOURS[key] || null;
}

const lapTime = (sec) => { const m = Math.floor(sec / 60), r = sec - m * 60; return m ? `${m}:${r.toFixed(3).padStart(6, "0")}` : r.toFixed(3); };
const lastOf = (v) => { if (Array.isArray(v)) { const a = v.filter((x) => x != null); return a.length ? a[a.length - 1] : null; } return v; };

// Timing-tower rows for one finished session (= Python _openf1_session_table): best lap, gap to P1,
// and the compound of that best lap (laps + stints). Throws when OpenF1 has no result.
async function f1SessionRows(s, followed) {
  const key = s.session_key;
  const res = (await openf1(`session_result?session_key=${key}`)).slice().sort((a, b) => (a.position || 99) - (b.position || 99));
  if (!res.length) throw new Error("no result");
  const drivers = {};
  (await openf1(`drivers?session_key=${key}`)).forEach((d) => { drivers[d.driver_number] = d; });
  let laps = [], stints = [];
  try { [laps, stints] = await Promise.all([openf1(`laps?session_key=${key}`), openf1(`stints?session_key=${key}`)]); } catch (e) { /* tyres optional */ }
  const tyre = (num, best) => {
    const lap = laps.find((l) => l.driver_number === num && l.lap_duration && Math.abs(l.lap_duration - best) < 0.0015);
    const st = lap && stints.find((x) => x.driver_number === num && x.lap_start <= lap.lap_number && lap.lap_number <= (x.lap_end || 999));
    return st ? st.compound : null;
  };
  return res.map((r) => {
    const d = drivers[r.driver_number] || {}, best = lastOf(r.duration), gap = lastOf(r.gap_to_leader);
    const flag = ["dsq", "dns", "dnf"].find((f) => r[f]);
    return { pos: r.position || "–", code: d.name_acronym || String(r.driver_number), name: d.full_name || null, team: d.team_name || null,
      color: d.team_colour ? `#${d.team_colour}` : teamColour(d.team_name), value: best ? lapTime(best) : flag ? flag.toUpperCase() : "No time",
      extra: gap ? `+${gap.toFixed(3)}` : "", tyre: best ? tyre(r.driver_number, best) : null, self: followed.has(r.driver_number) };
  });
}

// ---------- F1 live timing (= Python _live_snapshot / _live_rows / refresh_live_sport) ----------
// F1's signalrcore feed needs no key. One Subscribe returns the full current state, read over HTTP
// long polling. The AWS load balancer is sticky: send its AWSALB cookies back on every request,
// or later calls land on another server ("No Connection with that ID").
const LIVE_FEED = "https://livetiming.formula1.com/signalrcore";
const LIVE_TOPICS = ["SessionInfo", "SessionStatus", "ExtrapolatedClock", "TimingData", "TimingAppData", "DriverList", "LapCount", "TrackStatus"];
const TRACK_FLAGS = { 2: "YELLOW", 4: "SC", 5: "RED FLAG", 6: "VSC", 7: "VSC ENDING" }; // TrackStatus codes; 1 = green

async function f1LiveSnapshot() {
  let cookie = "";
  const call = async (url, method, body) => {
    const r = new Request(url);
    r.method = method;
    if (body != null) r.body = body;
    r.headers = cookie ? { Cookie: cookie } : {};
    r.timeoutInterval = 15;
    const text = await r.loadString();
    if (!cookie) {
      const resp = r.response || {}, list = (resp.cookies || []).filter((c) => /^AWSALB/.test(c.name));
      cookie = list.length ? list.map((c) => `${c.name}=${c.value}`).join("; ")
        : (String((resp.headers || {})["Set-Cookie"] || "").match(/AWSALB(?:CORS)?=[^;,]+/g) || []).join("; ");
    }
    return text;
  };
  const tok = JSON.parse(await call(`${LIVE_FEED}/negotiate?negotiateVersion=1`, "POST", "")).connectionToken;
  const url = `${LIVE_FEED}?id=${encodeURIComponent(tok)}`;
  await call(url, "POST", '{"protocol":"json","version":1}\x1e');
  await call(url, "GET");
  await call(url, "POST", JSON.stringify({ type: 1, target: "Subscribe", arguments: [LIVE_TOPICS], invocationId: "0" }) + "\x1e");
  for (let i = 0; i < 4; i++) {
    for (const part of (await call(url, "GET")).split("\x1e")) {
      if (!part.trim()) continue;
      const m = JSON.parse(part);
      if (m.type === 3 && m.invocationId === "0") return m.result || {};
    }
  }
  return {};
}

const secsOf = (t) => { if (!t) return null; const i = t.lastIndexOf(":"); const v = (i >= 0 ? +t.slice(0, i) * 60 : 0) + +t.slice(i + 1); return isNaN(v) ? null : v; };

function f1LiveRows(res, followed) {
  const td = res.TimingData || {}, app = (res.TimingAppData || {}).Lines || {}, drivers = res.DriverList || {}, lines = td.Lines || {};
  const part = td.SessionPart, racing = ["Race", "Sprint"].includes((res.SessionInfo || {}).Type);
  const best = (l) => (part && Array.isArray(l.BestLapTimes) && l.BestLapTimes.length >= part ? (l.BestLapTimes[part - 1] || {}).Value : (l.BestLapTime || {}).Value);
  const order = Object.keys(lines).sort((a, b) => (+lines[a].Position || 99) - (+lines[b].Position || 99));
  const lead = order.length ? secsOf(best(lines[order[0]])) : null;
  const rows = order.map((n) => {
    const l = lines[n], d = drivers[n] || {}, st = (app[n] || {}).Stints || [], b = best(l);
    let gap = "";
    if (racing) { const g = l.Position !== "1" ? l.GapToLeader : ""; gap = (g && typeof g === "object" ? g.Value : g) || ""; }
    else if (b && lead && secsOf(b) > lead) gap = `+${(secsOf(b) - lead).toFixed(3)}`;
    return { pos: +l.Position || null, number: n, code: d.Tla || n, team: d.TeamName || null,
      color: d.TeamColour ? `#${d.TeamColour}` : teamColour(d.TeamName), value: racing ? (l.LastLapTime || {}).Value : b, best: b,
      extra: gap, tyre: st.length ? st[st.length - 1].Compound : null, laps: l.NumberOfLaps, pit: !!l.InPit,
      out: !!(l.KnockedOut || l.Retired || l.Stopped), self: followed.has(+n) };
  });
  return [rows, part];
}

// Live tower while a session is within -5 min ... +15 min of its schedule; null otherwise.
async function f1Live(sportCfg) {
  const t = now();
  const s = (await f1Sessions()).find((x) => parseDt(x.date_start) - 5 * 60000 <= t && t <= parseDt(x.date_end) + 15 * 60000);
  if (!s) return null;
  const res = await f1LiveSnapshot();
  const info = res.SessionInfo || {};
  if (!info.Name || !Object.keys((res.TimingData || {}).Lines || {}).length) return null;
  const [rows, part] = f1LiveRows(res, new Set(sportCfg.subjects.map((x) => x.number)));
  const clock = res.ExtrapolatedClock || {}, laps = res.LapCount || {};
  return { session: SHORT_NAMES[info.Name] || info.Name, part: part ? `Q${part}` : null, status: (res.SessionStatus || {}).Status || null,
    remaining: clock.Remaining || null, clock_utc: clock.Utc || null, running: !!clock.Extrapolating,
    laps: laps.CurrentLap || null, total_laps: laps.TotalLaps || null, flag: TRACK_FLAGS[(res.TrackStatus || {}).Status] || null, rows, as_of: iso(now()) };
}

async function f1Sport(sportCfg) {
  if (LITE) {
    const nextRace = (await getJSON(`${JOLPICA}/current/next.json`)).MRData.RaceTable.Races[0];
    return { next_round: nextRace ? +nextRace.round : null };
  }
  const followed = new Set(sportCfg.subjects.map((s) => s.jolpica_id));
  const [drivers, raceData, standData, nextData] = await Promise.all([
    openf1("drivers?session_key=latest").catch(() => []), getJSON(`${JOLPICA}/current/last/results.json`),
    getJSON(`${JOLPICA}/current/driverStandings.json`), getJSON(`${JOLPICA}/current/next.json`),
  ]);
  await f1Espn();
  const prev = await f1PrevPositions();
  const colours = {};
  drivers.forEach((d) => { if (d.team_colour) colours[d.name_acronym] = `#${d.team_colour}`; });
  const row = (pos, d, team, value, extra) => ({
    pos, code: d.code, name: `${d.givenName} ${d.familyName}`, team, color: colours[d.code] || teamColour(team),
    value, extra, self: followed.has(d.driverId),
  });
  const race = raceData.MRData.RaceTable.Races[0];
  const leadLaps = +race.Results[0].laps;
  // Lapped cars' times are measured a lap down, so show laps like the official classification.
  const gap = (r) => {
    if (r.status === "Finished") return r.Time.time;
    const down = leadLaps - +r.laps;
    if (r.status === "Lapped" || r.status.startsWith("+")) return `+${down} Lap${down > 1 ? "s" : ""}`;
    return r.status === "Retired" ? "DNF" : r.status;
  };
  const lists = standData.MRData.StandingsTable.StandingsLists;
  const nextRace = nextData.MRData.RaceTable.Races[0];
  // Latest finished non-race session of the weekend (= Python _last_session_table): OpenF1 best laps,
  // gaps and tyres when reachable, else ESPN's order (names only, code/team from Jolpica standings).
  let lastSession = null;
  try {
    const sessions = await f1Sessions();
    const up = sessions.filter((x) => parseDt(x.date_end) > now());
    const meeting = (up[0] || sessions[sessions.length - 1] || {}).meeting_key;
    const fin = sessions.filter((x) => x.meeting_key === meeting && x.session_name !== "Race" && f1Status(x) === "final");
    const sx = fin[fin.length - 1];
    if (sx && sx.session_key) {
      const name = SHORT_NAMES[sx.session_name] || sx.session_name;
      lastSession = { title: name, subtitle: `Best laps · ${sx.date_start.slice(0, 10)}`,
        rows: await f1SessionRows(sx, new Set(sportCfg.subjects.map((x) => x.number))) };
    }
  } catch (e) { lastSession = null; }
  const done = lastSession ? [] : Object.entries(espnWk || {}).filter(([, e]) => e.state === "final" && e.date);
  if (done.length) {
    const [name, e] = done.reduce((a, b) => (a[1].date > b[1].date ? a : b));
    if (!(name === "Race" && race.date === e.date.slice(0, 10))) {
      const byName = {};
      (lists.length ? lists[0].DriverStandings : []).forEach((d) => { byName[fold(d.Driver.familyName)] = d; });
      const mine = new Set(sportCfg.subjects.map((x) => fold(x.name)));
      lastSession = { title: name, subtitle: `Latest session · ${e.date.slice(0, 10)}`, rows: e.order.map((sn, i) => {
        const d = byName[sn], code = d ? d.Driver.code : sn.slice(0, 3).toUpperCase();
        return { pos: i + 1, code, name: d ? `${d.Driver.givenName} ${d.Driver.familyName}` : sn, team: d ? d.Constructors[d.Constructors.length - 1].name : null,
          color: colours[code] || teamColour(d && d.Constructors[d.Constructors.length - 1].name), value: "", extra: "", self: mine.has(sn) };
      }) };
    }
  }
  let live = null;
  try { live = await f1Live(sportCfg); } catch (e) { /* live timing is optional */ }
  return {
    next_round: nextRace ? +nextRace.round : null,
    live,
    tables: {
      last_session: lastSession, // null -> clients fall back to last_race
      last_race: { title: race.raceName, subtitle: `Round ${race.round} · ${race.date}`,
        rows: race.Results.map((r) => row(+r.position, r.Driver, r.Constructor.name, gap(r), +r.points ? `+${r.points}` : "")) },
      standings: { title: "Driver standings", subtitle: lists.length ? `After round ${lists[0].round}` : null,
        rows: (lists.length ? lists[0].DriverStandings : []).map((d) => Object.assign(
          row(+d.position, d.Driver, d.Constructors[d.Constructors.length - 1].name, String(+d.points), +d.wins ? `${d.wins}W` : ""),
          { change: f1Change(prev, d.Driver.driverId, +d.position) })) },
    },
  };
}

// =====================================================================
// NHL — api-web.nhle.com (unofficial)
// =====================================================================

const NHL = "https://api-web.nhle.com/v1";
const GAME_TYPES = { 1: "NHL Preseason", 2: "NHL Regular Season", 3: "NHL Playoffs" };
const UPCOMING = ["FUT", "PRE", "LIVE", "CRIT"];
const FINISHED = ["OFF", "FINAL"];

const nhlStandings = async () => (await getJSON(`${NHL}/standings/now`)).standings;
const nhlTeam = async (abbrev) => (await nhlStandings()).find((t) => t.teamAbbrev.default === abbrev);

// {abbrev: [divisionSequence, wildcardSequence]} at the end of the day before `team`'s last
// regular-season game (= Python _before_last_game), so changes show what that game did.
// A past day's standings never change, so they are cached on disk by date.
async function nhlBeforeLastGame(team) {
  const games = (await getJSON(`${NHL}/club-schedule-season/${team}/now`)).games;
  const done = games.filter((g) => FINISHED.includes(g.gameState) && g.gameType === 2 && g.gameDate)
    .sort((a, b) => a.startTimeUTC.localeCompare(b.startTimeUTC));
  if (!done.length) return null;
  const day = iso(Date.parse(done[done.length - 1].gameDate + "T12:00:00Z") - DAY).slice(0, 10);
  const file = `nhl_standings_${day}.json`;
  let map = readJSON(file);
  if (!map) {
    try {
      map = {};
      (await getJSON(`${NHL}/standings/${day}`)).standings.forEach((t) => { map[t.teamAbbrev.default] = [t.divisionSequence, t.wildcardSequence || null]; });
      writeJSON(file, map);
    } catch (e) { return null; } // change is optional
  }
  return map;
}
// Places moved since before the last game (+ = up); null when unknown.
const nhlChange = (before, abbrev, i, now) => { const o = (before || {})[abbrev]; return o && o[i] && now ? o[i] - now : null; };

async function nhlForm(abbrev) {
  const t = await nhlTeam(abbrev);
  if (!t) return [null, null];
  const streak = `${t.streakCode || ""}${t.streakCount || ""}`;
  const l10 = `${t.l10Wins}-${t.l10Losses}-${t.l10OtLosses}`;
  return [`${t.wins}-${t.losses}-${t.otLosses}`, streak ? `L10 ${l10} · ${streak}` : `L10 ${l10}`];
}

// Goals, shootout, shots and three stars from a gamecenter landing (= Python _detail_from_landing).
const PERIOD_LABELS = { OT: "OT", SO: "SO" };
const ORDINALS = { 1: "1ST", 2: "2ND", 3: "3RD" };
function nhlDetail(d) {
  const summary = d.summary || {};
  const goals = [];
  (summary.scoring || []).forEach((period) => {
    const pd = period.periodDescriptor;
    if (pd.periodType === "SO") return; // shootout listed separately
    const label = PERIOD_LABELS[pd.periodType] || String(pd.number);
    period.goals.forEach((g) => {
      const strength = (g.strength || "ev").toUpperCase();
      goals.push({
        period: label, time: g.timeInPeriod, team: g.teamAbbrev.default, scorer: g.name.default,
        scorer_total: g.goalsToDate, assists: (g.assists || []).map((a) => a.name.default),
        strength: strength === "EV" ? null : strength, empty_net: g.goalModifier === "empty-net",
        score: `${g.awayScore}–${g.homeScore}`,
      });
    });
  });
  // Some attempts come without a player.
  const soName = (e) => {
    const first = (e.firstName || {}).default || "", last = (e.lastName || {}).default;
    return first && last ? `${first[0]}. ${last}` : last || "—";
  };
  const so = summary.shootout && !Array.isArray(summary.shootout) ? summary.shootout.events || [] : [];
  const shootout = so.map((e) => ({ team: e.teamAbbrev.default, player: soName(e), result: e.result, winner: !!e.gameWinner }));
  const stars = (summary.threeStars || []).map((st) => ({
    star: st.star, team: st.teamAbbrev, name: st.name.default, pos: st.position,
    line: st.position === "G" ? `${(st.savePctg || 0).toFixed(3).replace(/^0/, "")} SV%` : `${st.goals || 0}G ${st.assists || 0}A`,
  }));
  return { goals, shootout, stars, sog: { away: d.awayTeam.sog, home: d.homeTeam.sog } };
}

// Team game stats as two-sided bars (= Python _team_stats): display strings + numbers for the bar.
const STAT_ROWS = [["powerPlay", "Power play"], ["pim", "Penalty min"], ["faceoffWinningPctg", "Faceoffs"],
  ["hits", "Hits"], ["blockedShots", "Blocked shots"], ["giveaways", "Giveaways"], ["takeaways", "Takeaways"]];
async function nhlTeamStats(id) {
  try {
    const rows = {};
    ((await getJSON(`${NHL}/gamecenter/${id}/right-rail`)).teamGameStats || []).forEach((r) => { rows[r.category] = r; });
    const out = STAT_ROWS.filter(([k]) => rows[k]).map(([key, label]) => {
      const a = rows[key].awayValue, h = rows[key].homeValue;
      if (key === "faceoffWinningPctg") return { key, label, away: `${Math.round(a * 100)}%`, home: `${Math.round(h * 100)}%`, a, h };
      if (key === "powerPlay") return { key, label, away: a, home: h, a: +String(a).split("/")[0] || 0, h: +String(h).split("/")[0] || 0 };
      return { key, label, away: String(a), home: String(h), a, h };
    });
    return out.length ? out : null;
  } catch (e) { return null; } // optional extra
}

// Live clock: `seconds` remaining, true at `as_of`; clients count down while `running` (= Python _live_state).
function nhlLive(d, asOf) {
  const pd = d.periodDescriptor || {}, clock = d.clock || {};
  const ptype = pd.periodType || "REG";
  return {
    period: ptype === "REG" ? ORDINALS[pd.number] || ptype : ptype, clock: clock.timeRemaining || null,
    seconds: clock.secondsRemaining == null ? null : clock.secondsRemaining, as_of: iso(asOf || now()),
    intermission: !!clock.inIntermission, running: !!clock.running,
    sog: { away: d.awayTeam.sog, home: d.homeTeam.sog }, situation: nhlSituation(d), updated_at: iso(now()),
  };
}

// Power play / empty net (= Python _situation): {team, label, strength "5v4", seconds} or null.
function nhlSituation(d) {
  const sit = d.situation || {};
  for (const [side, other] of [["homeTeam", "awayTeam"], ["awayTeam", "homeTeam"]]) {
    const t = sit[side] || {};
    if (t.situationDescriptions && t.situationDescriptions.length) {
      return { team: t.abbrev, label: t.situationDescriptions.join(" "), strength: `${t.strength}v${(sit[other] || {}).strength}`,
        seconds: sit.secondsRemaining == null ? null : sit.secondsRemaining };
    }
  }
  return null;
}

// Uncached landing fetch + when it was generated (NHL CDN caches ~19 s; subtract the Age header).
async function nhlLanding(id) {
  const req = new Request(`${NHL}/gamecenter/${id}/landing`);
  req.headers = { "User-Agent": UA };
  req.timeoutInterval = 20;
  const d = JSON.parse(await req.loadString());
  const h = (req.response && req.response.headers) || {};
  const age = +(h.Age || h.age || 0) || 0;
  return [d, new Date(Date.now() - age * 1000)];
}

async function nhlEvent(g, team) {
  const home = g.homeTeam.abbrev === team;
  const us = home ? g.homeTeam : g.awayTeam, them = home ? g.awayTeam : g.homeTeam;
  const state = g.gameState;
  const status = ["CNCL", "PPD"].includes(g.gameScheduleState) ? "cancelled"
    : FINISHED.includes(state) ? "final" : ["LIVE", "CRIT"].includes(state) ? "live" : "scheduled";
  let res = null;
  if (status === "final") {
    const a = us.score || 0, b = them.score || 0;
    const period = (g.gameOutcome || {}).lastPeriodType || "REG";
    res = result(`${a}–${b}${period === "REG" ? "" : " " + period}`, a > b ? "win" : "loss");
  }
  const side = async (t) => {
    const score = ["final", "live"].includes(status) ? t.score : null;
    const c = competitor({
      name: t.commonName.default, short: t.abbrev, logo: t.darkLogo || t.logo, score,
      winner: status !== "final" ? null : score === Math.max(us.score || 0, them.score || 0), self: t === us,
    });
    if (status !== "final") [c.record, c.form] = await nhlForm(t.abbrev);
    return c;
  };
  const competitors = await Promise.all([side(g.awayTeam), side(g.homeTeam)]);
  // Finished or live: goal detail (and live clock) from the gamecenter landing.
  // Live games always get the landing (score/clock, also in lite widget runs); finished games
  // only in full runs (goal detail is shown on the detail page only).
  let detail = null, live = null;
  if (status === "live" || (!LITE && status === "final")) {
    try {
      const [d, asOf] = await nhlLanding(g.id);
      if (!LITE) detail = Object.assign(nhlDetail(d), { stats: await nhlTeamStats(g.id) });
      if (status === "live") {
        live = nhlLive(d, asOf);
        competitors[0].score = d.awayTeam.score; competitors[1].score = d.homeTeam.score;
      }
    } catch (e) { /* optional extra */ }
  }
  const ev = event({
    title: GAME_TYPES[g.gameType] || "NHL", subtitle: `${home ? "vs" : "@"} ${them.abbrev}`,
    start: g.startTimeUTC, status, result: res,
    url: g.gameCenterLink ? `https://www.nhl.com${g.gameCenterLink}` : null,
    location: (g.venue || {}).default, competitors, detail, id: g.id,
  });
  ev.live = live;
  return ev;
}

async function nhlPlayoffNote(t) {
  if (t.divisionSequence <= 3) return `${t.divisionName} top 3 · in playoff spot`;
  const conf = (await nhlStandings()).filter((x) => x.conferenceName === t.conferenceName);
  const wc = {};
  conf.forEach((x) => { if (x.wildcardSequence) wc[x.wildcardSequence] = x; });
  const n = t.wildcardSequence;
  if (n <= 2) return `WC${n} · +${wc[3] ? t.points - wc[3].points : 0} pts over cut line`;
  const cut = wc[2];
  return `WC${n} · ${cut ? cut.points - t.points : 0} pts back of WC2${cut ? ` (${t.gamesPlayed} GP vs ${cut.gamesPlayed})` : ""}`;
}

async function nhlSubject(subj) {
  const team = subj.abbrev;
  const games = (await getJSON(`${NHL}/club-schedule-season/${team}/now`)).games
    .sort((a, b) => a.startTimeUTC.localeCompare(b.startTimeUTC));
  const next = games.find((g) => UPCOMING.includes(g.gameState));
  const done = games.filter((g) => FINISHED.includes(g.gameState));
  const t = await nhlTeam(team);
  const me = games.length ? (games[0].homeTeam.abbrev === team ? games[0].homeTeam : games[0].awayTeam) : {};
  return {
    ranking: t ? {
      label: t.divisionName, position: t.divisionSequence, points: t.points,
      detail: `${t.wins}-${t.losses}-${t.otLosses}`, note: await nhlPlayoffNote(t),
      change: nhlChange(await nhlBeforeLastGame(team).catch(() => null), team, 0, t.divisionSequence),
    } : null,
    next: next ? await nhlEvent(next, team) : null,
    last: done.length ? await nhlEvent(done[done.length - 1], team) : null,
    profile: { image: me.darkLogo || me.logo },
  };
}

// Division standings + conference wild-card race (= Python nhl.fetch_sport). Detail page only.
async function nhlSport(sportCfg) {
  if (LITE) return {};
  const team = sportCfg.subjects[0].abbrev;
  const me = await nhlTeam(team);
  if (!me) return {};
  const rows = await nhlStandings();
  const before = await nhlBeforeLastGame(team).catch(() => null);
  const row = (t, pos, cut, i) => ({
    pos, code: t.teamAbbrev.default, name: t.teamCommonName.default,
    logo: (t.teamLogo || "").replace("_light.svg", "_dark.svg") || null, team: null, color: null,
    value: String(t.points), extra: `${t.wins}-${t.losses}-${t.otLosses}`, gp: t.gamesPlayed,
    self: t.teamAbbrev.default === team, cut, change: nhlChange(before, t.teamAbbrev.default, i, pos),
  });
  const div = rows.filter((t) => t.divisionName === me.divisionName).sort((a, b) => a.divisionSequence - b.divisionSequence);
  const wc = rows.filter((t) => t.conferenceName === me.conferenceName && t.wildcardSequence).sort((a, b) => a.wildcardSequence - b.wildcardSequence);
  return { tables: {
    division: { title: `${me.divisionName} Division`, subtitle: "Top 3 make the playoffs", rows: div.map((t) => row(t, t.divisionSequence, t.divisionSequence === 3, 0)) },
    wildcard: { title: `${me.conferenceName} Wild Card`, subtitle: "Top 2 make the playoffs", rows: wc.map((t) => row(t, t.wildcardSequence, t.wildcardSequence === 2, 1)) },
  } };
}

// =====================================================================
// Badminton — BWF internal API (no Cloudflare block for Apple's URL stack)
// =====================================================================

const BWF = "https://extranet-lv.bwfbadminton.com/api/";
const RANK_CAT = { MS: 6, WS: 7, MD: 8, WD: 9, XD: 10 };
const ENTRY_EVENT = { MS: 1, WS: 2, MD: 3, WD: 4, XD: 5 };
const WORLD_TOUR_CATS = [22, 23, 24, 25, 26];
// BWF's flag CDN is keyed by IOC code (TPE, INA, DEN...; but SGP), while player models give
// ISO3 for some countries (TWN, IDN, ...): TWN.png is a 404 → broken image.
const IOC = { TWN: "TPE", IDN: "INA", DNK: "DEN", MYS: "MAS", DEU: "GER", NLD: "NED", CHE: "SUI", PRT: "POR",
  VNM: "VIE", PHL: "PHI", ARE: "UAE", SAU: "KSA", ZAF: "RSA", BHR: "BRN", MCO: "MON", SIN: "SGP" };
const FLAG_PNG = (code) => `https://img.bwfbadminton.com/image/upload/v2/assets/flag-circle-svg-custom/${IOC[code] || code}.png`;
const bwf = (path, params) => getJSON(`${BWF}${path}?${qs(params)}`, { Origin: "https://bwfbadminton.com", Referer: "https://bwfbadminton.com/" });

const nameKey = (n) => n.replace(/[\s.\-]+/g, " ").trim().toLowerCase();
let zhTable = null;
async function loadZh() {
  if (zhTable) return zhTable;
  let text = null;
  const cached = readJSON("names_zh.json");
  if (cached && Date.now() - cached.at < DAY) text = cached.text;
  if (!text) {
    try { text = await getText(NAMES_ZH_URL); writeJSON("names_zh.json", { at: Date.now(), text }); }
    catch (e) { text = cached ? cached.text : ""; }
  }
  zhTable = {};
  text.split("\n").forEach((line) => {
    const m = line.match(/^([^#:][^:]*):\s*(\S.*)$/);
    if (m) zhTable[nameKey(m[1])] = m[2].trim();
  });
  return zhTable;
}

function surname(display) {
  const upper = display.split(/\s+/).filter((w) => w && w === w.toUpperCase() && /[A-Z]/.test(w));
  const s = upper.length ? upper.join(" ") : display.split(/\s+/).slice(-1)[0];
  return s.toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());
}

function names(displays) {
  displays = displays.filter(Boolean);
  const zh = displays.map((d) => zhTable[nameKey(d)]);
  const en = displays.map(surname).join(" / ");
  if (!zh.some(Boolean)) return [en, null];
  return [en, zh.map((z, i) => z || surname(displays[i])).join(" / ")];
}

const scores = (html) => (String(html || "").match(/<span>(\d+)<\/span>/g) || []).map((s) => +s.replace(/\D/g, ""));

async function bwfCalendar(year) {
  const d = await bwf("vue-grouped-year-tournaments", { year, "category[]": WORLD_TOUR_CATS, state: "all" });
  return d.results.flatMap((m) => m.tournaments);
}

async function bwfRanking(subj) {
  const d = await bwf("vue-rankingtable", { rankId: 2, catId: RANK_CAT[subj.event], publicationId: 0, doubles: String(subj.event.endsWith("D")), searchKey: subj.search, pageKey: 10, page: 1, drawCount: 1 });
  const row = d.results.data.find((r) => [r.player1_id, r.player2_id].includes(subj.player_id));
  if (!row) return null;
  return { label: subj.event, position: row.rank, points: +row.points, detail: null, note: null, change: row.rank_previous ? row.rank_previous - row.rank : null };
}

// The match's row in its tournament day schedule (matchTimeUtc + in-tournament code); works for
// any tournament via its GUID from vue-tournament-detail (= Python _day_row).
async function dayRow(m) {
  const t = await bwf("vue-tournament-detail", { tmtId: m.tournament_model.id });
  const code = (t.results || {}).code;
  if (!code) return null;
  const rows = await bwf("tournaments/day-matches", { tournamentCode: code, date: m.match_time.slice(0, 10), order: 2, court: 0 });
  return rows.find((r) => r.id === m.id) || null;
}

// Rally-by-rally score per game plus stats, from our side (= Python _match_detail).
async function matchDetail(m, side, row) {
  const d = await bwf("h2h/match", { tmt_id: m.tournament_model.id, match_code: row.code });
  const me = `team${side}`, op = `team${3 - side}`;
  const st = d.stats || {};
  const pair = (k) => [st[`${me}_${k}`] == null ? null : st[`${me}_${k}`], st[`${op}_${k}`] == null ? null : st[`${op}_${k}`]];
  return {
    duration: (d.progress || {}).duration || null, venue: (d.location || {}).locationName || null,
    games: (d.games || []).slice().sort((a, b) => a.ordering - b.ordering).map((g) => ({
      self: g[me], opp: g[op],
      points: (g.match_set_details_model || []).slice().sort((a, b) => a.ordering - b.ordering).map((p) => [p[me], p[op]]),
    })),
    stats: { rallies_won: pair("rallies_won"), max_streak: pair("consecutive_points"), game_points: pair("game_points") },
  };
}

const playersOf = (m, t) => [m[`t${t}p1_player_model`], m[`t${t}p2_player_model`]].filter(Boolean);
const countryOf = (m, t) => (m[`t${t}p1country_model`] || {}).code_iso3 || null;

async function matchEvent(m, pid, eventName) {
  const side = playersOf(m, 1).some((p) => p.id === pid) ? 1 : 2, opp = 3 - side;
  const final = m.match_state === "F";
  const mk = (t) => {
    const [en, zh] = names(playersOf(m, t).map((p) => p.name_display));
    const games = final ? scores(m[`team${t}Score`]) : null;
    const other = final ? scores(m[`team${3 - t}Score`]) : null;
    const iso3 = countryOf(m, t);
    return competitor({
      name: en, short: en, name_zh: zh, logo: iso3 ? FLAG_PNG(iso3) : null, country: iso3,
      score: final ? games.filter((g, i) => g > other[i]).length : null, games,
      winner: final ? m.winner === t : null, self: t === side,
    });
  };
  let res = null;
  if (final) {
    const ours = scores(m[`team${side}Score`]), theirs = scores(m[`team${opp}Score`]);
    let summary = ours.map((a, i) => `${a}-${theirs[i]}`).join(" ");
    if (m.status_name) summary = `${summary} (${m.status_name})`.trim();
    res = result(summary, m.winner === side ? "win" : "loss");
  }
  const row = await dayRow(m).catch(() => null);
  const exact = row && row.matchTimeUtc ? iso(parseDt(row.matchTimeUtc)) : null;
  const detail = final && row && !LITE ? await matchDetail(m, side, row).catch(() => null) : null;
  const oppName = names(playersOf(m, opp).map((p) => p.name_display))[0];
  return event({
    title: m.tournament_model.name, subtitle: oppName ? `${m.round_name} vs ${oppName}` : m.round_name,
    start: exact || m.match_time.slice(0, 10), precision: exact ? "exact" : "date",
    status: final ? "final" : "scheduled", result: res, url: m.tmt_url,
    competitors: [mk(side), mk(opp)],
    path: final || LITE ? null : await drawPath(m.tournament_model.id, m.draw_model.name.slice(0, 2), pid),
    detail,
  });
}

const rankMaps = {};
async function rankMap(eventName) {
  if (!rankMaps[eventName]) {
    const cached = readJSON(`rank_${eventName}.json`);
    if (cached && Date.now() - cached.at < DAY) return (rankMaps[eventName] = cached.map);
    const d = await bwf("vue-rankingtable", { rankId: 2, catId: RANK_CAT[eventName], publicationId: 0, doubles: String(eventName.endsWith("D")), searchKey: "", pageKey: 500, page: 1, drawCount: 1 });
    const map = {};
    d.results.data.forEach((r) => { map[[r.player1_id, r.player2_id].filter(Boolean).map(String).sort().join(",")] = r.rank; });
    writeJSON(`rank_${eventName}.json`, { at: Date.now(), map });
    rankMaps[eventName] = map;
  }
  return rankMaps[eventName];
}

const seedNum = (s) => { const m = String(s || "").match(/\d+/); return m ? +m[0] : 99; };

// Remaining knockout rounds with the actual / most likely opponent and all candidates.
async function drawPath(tmtId, eventName, pid) {
  let data;
  try {
    const draws = (await bwf("vue-tournament-draws", { tmtTab: "draw", tmtId })).results;
    const draw = draws.find((d) => d.text === eventName && !d.qualification);
    data = (await bwf("vue-tournament-draw-data", { tmtTab: "draw", tmtId, drawId: draw.value })).results;
  } catch (e) { return null; }
  if (!data || Array.isArray(data)) return null;
  pid = String(pid);
  const team = (t) => {
    const ps = (t || {}).players || [];
    return { ids: ps.map((p) => p.id), names: ps.map((p) => p.nameDisplay), flag: (t || {}).countryFlagUrl || null };
  };
  const first = {};
  let pos0 = null;
  Object.entries(data).forEach(([k, v]) => {
    const [r, p] = k.split("-").map(Number);
    if (r !== 0) return;
    const mt = v.match || {};
    first[p] = [1, 2].map((i) => Object.assign(team(mt[`team${i}`]), { seed: mt[`team${i}seed`] }));
    if (first[p].some((e) => e.ids.includes(pid))) pos0 = p;
  });
  if (pos0 === null) return null;
  const out = new Set();
  Object.values(data).forEach((v) => {
    const mt = v.match || {};
    if (mt.winner === 1 || mt.winner === 2) team(mt[`team${3 - mt.winner}`]).ids.forEach((i) => out.add(i));
  });
  const ranks = await rankMap(eventName);
  const rounds = Math.max(...Object.keys(data).map((k) => +k.split("-")[0])) + 1;
  const path = [];
  for (let r = 0; r < rounds; r++) {
    const mt = (data[`${r}-${pos0 >> r}`] || {}).match || {};
    if (mt.winner === 1 || mt.winner === 2) continue; // already played
    let block = [pos0];
    if (r > 0) { const sib = (pos0 >> (r - 1)) ^ 1; block = []; for (let p = sib << (r - 1); p < (sib + 1) << (r - 1); p++) block.push(p); }
    const alive = block.flatMap((p) => first[p] || []).filter((e) => e.ids.length && !e.ids.includes(pid) && !e.ids.some((i) => out.has(i)));
    if (!alive.length) continue;
    const cands = alive.map((e) => {
      const [en, zh] = names(e.names);
      return { name: en, name_zh: zh, logo: e.flag, seed: e.seed || null, rank: ranks[e.ids.slice().sort().join(",")] || null };
    }).sort((a, b) => seedNum(a.seed) - seedNum(b.seed) || (a.rank || 9999) - (b.rank || 9999));
    path.push(Object.assign({ round: mt.roundName || `R${r + 1}` }, cands[0], {
      confirmed: cands.length === 1, pool: cands.length,
      candidates: cands.length > 1 ? cands.slice().sort((a, b) => (a.rank || 9999) - (b.rank || 9999)) : null,
    }));
  }
  return path.length ? path : null;
}

async function entered(t, subj) {
  const ev = ENTRY_EVENT[subj.event];
  const [stages, data] = await Promise.all([
    bwf("entries/vue-tournament-event-stages", { tmtId: t.id, eventName: ev }),
    bwf("entries/vue-tournament-players-staged", { searchKey: subj.search, tmtId: t.id, tmtType: 0, eventName: ev, stageName: 0, isPara: 0 }),
  ]);
  const skip = new Set(stages.results.filter((s) => ["Withdrawn", "Reserve"].includes(s.text)).map((s) => String(s.value)));
  return Object.entries(data.results || {}).some(([id, st]) => !skip.has(id) &&
    (st.entries || []).some((e) => [(e.player1 || {}).id, (e.player2 || {}).id].includes(subj.player_id)));
}

// The player's next match from the tournament's published order of play, with its exact time
// (= Python _scheduled_match): player-match-next often stays empty until the match is close,
// while day schedules come out the evening before. null until the player's day is published.
async function scheduledMatch(t, subj) {
  const start = t.start_date.slice(0, 10), end = t.end_date.slice(0, 10);
  if (Date.now() < Date.parse(start + "T00:00:00Z") - DAY) return null;
  const code = ((await bwf("vue-tournament-detail", { tmtId: t.id })).results || {}).code;
  if (!code) return null;
  const pid = String(subj.player_id);
  for (let d = Date.parse(start + "T00:00:00Z"); iso(new Date(d)).slice(0, 10) <= end; d += DAY) {
    const rows = await bwf("tournaments/day-matches", { tournamentCode: code, date: iso(new Date(d)).slice(0, 10), order: 2, court: 0 });
    if (!rows || !rows.length) return null; // later days are not published yet
    for (const r of rows) {
      const sides = [r.team1 || {}, r.team2 || {}];
      const ids = sides.map((sd) => (sd.players || []).map((p) => p.id));
      if (!ids[0].concat(ids[1]).includes(pid) || r.winner || !r.matchTimeUtc) continue;
      const me = ids[0].includes(pid) ? 0 : 1;
      const comps = [me, 1 - me].map((i) => { // self first, like matchEvent
        const [en, zh] = names((sides[i].players || []).map((p) => p.nameDisplay));
        return competitor({ name: en, short: en, name_zh: zh, logo: sides[i].countryFlagUrl, country: sides[i].countryCode, self: i === me });
      });
      return event({
        title: t.name, subtitle: `${r.roundName} vs ${comps[1].name}`,
        start: iso(new Date(Date.parse(r.matchTimeUtc.replace(" ", "T") + "Z"))), precision: "exact", status: "scheduled",
        url: t.url, location: [r.courtName, r.locationName].filter(Boolean).join(", ") || t.location, image: t.flag_url,
        country: (String(t.flag_url || "").match(/\/([A-Z]{3})\.png/) || [])[1],
        competitors: comps, path: LITE ? null : await drawPath(t.id, subj.event, subj.player_id),
      });
    }
  }
  return null;
}

async function nextTournament(subj, excludeId) {
  const today = iso(now()).slice(0, 10), year = +today.slice(0, 4);
  const tours = (await Promise.all([bwfCalendar(year), bwfCalendar(year + 1).catch(() => [])])).flat()
    .filter((t) => t.end_date.slice(0, 10) >= today && t.id !== excludeId)
    .sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(0, 3);
  const flags = await Promise.all(tours.map((t) => entered(t, subj).catch(() => false)));
  const t = tours[flags.indexOf(true)];
  if (!t) return null;
  const scheduled = await scheduledMatch(t, subj).catch(() => null);
  if (scheduled) return scheduled;
  return event({
    title: t.name, start: t.start_date.slice(0, 10), precision: "date", status: "scheduled",
    url: t.url, location: t.location, image: t.flag_url,
    country: (String(t.flag_url || "").match(/\/([A-Z]{3})\.png/) || [])[1], // calendar 'country' is a name
    path: LITE ? null : await drawPath(t.id, subj.event, subj.player_id),
  });
}

async function badmintonSubject(subj) {
  await loadZh();
  const pid = subj.player_id;
  const common = { drawCount: 1, activeTab: 1, playerId: pid, isPara: "false" };
  const [prev, nxt] = await Promise.all([
    bwf("vue-player-match-previous", Object.assign({ previousOffset: 0 }, common)),
    bwf("vue-player-match-next", common),
  ]);
  const matches = [prev.results, nxt.results].filter((m) => m && m.id);
  // 'next' endpoint can return a finished match, so sort by state.
  const done = matches.filter((m) => m.match_state === "F").sort((a, b) => (a.match_time + a.id).localeCompare(b.match_time + b.id));
  const pending = matches.filter((m) => m.match_state !== "F");
  const lastM = done[done.length - 1] || null;
  const [ranking, next, last] = await Promise.all([
    bwfRanking(subj),
    pending.length ? matchEvent(pending[0], pid, subj.event) : nextTournament(subj, lastM ? lastM.tournament_model.id : null),
    lastM ? matchEvent(lastM, pid, subj.event) : null,
  ]);
  const me = lastM ? (playersOf(lastM, 1).some((p) => p.id === pid) ? 1 : 2) : null;
  const iso3 = lastM ? countryOf(lastM, me) : null;
  return { ranking, next, last, profile: { image: iso3 ? FLAG_PNG(iso3) : null, country: iso3 } };
}

// =====================================================================
// fetch all + stale fallback + cache
// =====================================================================

// World top 10 per followed event, keyed by event code (= Python badminton.fetch_sport).
// Detail-page only: a lite (widget) run keeps the previous tables.
const RANK_TOP = 10;
const FLAG_SVG = "https://extranet.bwf.sport/docs/flags-svg/";
async function bwfSport(sportCfg) {
  if (LITE) return {};
  await loadZh();
  const plain = (html) => String(html || "").replace(/<[^>]+>/g, "").trim();
  const events = [...new Set(sportCfg.subjects.map((s) => s.event))];
  const tables = {};
  await Promise.all(events.map(async (ev) => {
    const mine = new Set(sportCfg.subjects.filter((s) => s.event === ev).map((s) => String(s.player_id)));
    const d = await bwf("vue-rankingtable", { rankId: 2, catId: RANK_CAT[ev], publicationId: 0, doubles: String(ev.endsWith("D")), searchKey: "", pageKey: RANK_TOP, page: 1, drawCount: 1 });
    tables[ev] = { title: `World Ranking · ${ev}`, subtitle: `Top ${RANK_TOP}`, rows: d.results.data.slice(0, RANK_TOP).map((r) => {
      const [en, zh] = names([r.player1_model, r.player2_model].filter(Boolean).map((m) => plain(m.name_display_bold)));
      const c = r.p1_country_model || {};
      return { pos: r.rank, code: null, name: en, name_zh: zh, logo: c.flag_name_svg ? FLAG_SVG + c.flag_name_svg : null,
        team: c.name || null, color: null, value: Math.round(+r.points).toLocaleString("en-US"),
        extra: r.rank_previous ? r.rank_previous - r.rank : null,
        self: mine.has(String(r.player1_id)) || mine.has(String(r.player2_id)) };
    }) };
  }));
  return { tables };
}

const PROVIDERS = { f1: f1Subject, nhl: nhlSubject, badminton: badmintonSubject };
const SPORT_PROVIDERS = { f1: f1Sport, nhl: nhlSport, badminton: bwfSport }; // optional sport-level data, like fetch_sport() in Python
const PROFILE_KEYS = ["team", "color", "image", "badge", "country"];

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => Timer.schedule(ms, false, () => rej(new Error(`timeout ${ms} ms`))))]);
}

// Sport-level data with last-good fallback (marked tables_stale).
async function sportExtras(sport, old, config) {
  const fn = SPORT_PROVIDERS[sport.provider];
  if (!fn) return {};
  try {
    // A lite run keeps the previous tables (the detail page refetches them in full anyway).
    const keep = LITE && old && old.tables ? { tables: old.tables } : {};
    return Object.assign(keep, await withTimeout(fn(sport), config.timeoutMs || 25000), { tables_stale: false });
  } catch (e) {
    return old && old.tables ? { tables: old.tables, next_round: old.next_round, tables_stale: true } : {};
  }
}

// Keep display extras a degraded run couldn't provide (F1 during an OpenF1 lockout: team/colour,
// circuit outline, flag) from the previous snapshot (= Python carry_missing).
function carryMissing(subj, old) {
  PROFILE_KEYS.forEach((k) => { if (subj[k] == null && old[k] != null) subj[k] = old[k]; });
  ["next", "last"].forEach((key) => {
    const n = subj[key], o = old[key];
    if (n && o && n.title === o.title && String(n.start).slice(0, 10) === String(o.start).slice(0, 10)) {
      ["track", "image", "location", "country"].forEach((f) => { if (n[f] == null && o[f] != null) n[f] = o[f]; });
    }
  });
}

async function fetchAll(config, previous) {
  const prev = {}, prevSports = {};
  ((previous || {}).sports || []).forEach((sp) => { prevSports[sp.id] = sp; sp.subjects.forEach((s) => { prev[s.id] = s; }); });
  const sports = await Promise.all(config.sports.map(async (sport) => Object.assign({
    id: sport.id, name: sport.name,
    subjects: await Promise.all(sport.subjects.map(async (cfg) => {
      const base = { id: cfg.id, name: cfg.name, short: cfg.short || null };
      const prof = (src) => { const o = {}; PROFILE_KEYS.forEach((k) => { o[k] = cfg[k] != null ? cfg[k] : (src[k] != null ? src[k] : null); }); return o; };
      try {
        const data = await withTimeout(PROVIDERS[sport.provider](cfg), config.timeoutMs || 25000);
        const profile = data.profile || {};
        delete data.profile;
        const subj = Object.assign(base, prof(profile), { updated_at: iso(now()), stale: false, error: null }, data);
        carryMissing(subj, prev[cfg.id] || {});
        return subj;
      } catch (e) {
        const old = prev[cfg.id] || {};
        return Object.assign(base, prof(old), {
          updated_at: old.updated_at || null, stale: true, error: String(e).slice(0, 200),
          ranking: old.ranking || null, next: old.next || null, last: old.last || null,
        });
      }
    })),
  }, await sportExtras(sport, prevSports[sport.id], config))));
  return { schema_version: 1, generated_at: iso(now()), timezone: config.timezone || "UTC", sports };
}

// Cached data if fresh enough, otherwise fetch (falling back per subject to the cache).
async function load(config, opts) {
  opts = opts || {};
  LITE = !!opts.lite;
  const cached = readJSON("data.json");
  const fresh = cached && Date.now() - Date.parse(cached.generated_at) < (opts.maxAgeMin || 15) * 60000;
  if (fresh && !opts.force) return cached;
  // Several widgets refresh at once; let only one fetch (widgets have tight memory limits).
  const lock = readJSON("fetching.json");
  if (!opts.force && cached && lock && Date.now() - lock.at < 90000) return cached;
  writeJSON("fetching.json", { at: Date.now() });
  try {
    const data = await fetchAll(config, cached);
    writeJSON("data.json", data);
    return data;
  } finally {
    writeJSON("fetching.json", { at: 0 });
  }
}

module.exports = { load, fetchAll, readCached: () => readJSON("data.json") };
