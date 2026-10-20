// Übersicht widget: renders data.json written by fetch.py.
// Display-only: local times, countdowns and highlights are computed here from UTC.
// Style: macOS-widget cards; F1 in Box Box style, head-to-head in Apple Sports style.
// Drag any card header to move the widget; double-click a header to reset.
// Cards with nothing within 48 h collapse to one line; the chevron toggles them.

// Written by the launchd runtime copy (see launchd/install.sh).
// $HOME is expanded by the shell that runs `command`.
const DATA = "$HOME/Library/Application Support/sports-tracker/data.json";

export const command = `cat "${DATA}"`;
export const refreshFrequency = 15 * 1000; // re-read often: cheap local cat, keeps live scores fresh

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

  /* ---- F1: racing style (condensed italic type, start lights, livery slants) ---- */
  .f1x {
    font-family: "HelveticaNeue-CondensedBlack", "Helvetica Neue Condensed Black", "Helvetica Neue", sans-serif;
    font-weight: 900; font-style: italic; letter-spacing: 0.01em;
  }
  .card.f1 { position: relative; overflow: hidden; padding-top: 16px; }
  .card.f1::before { /* chequered strip */
    content: ""; position: absolute; left: 0; right: 0; top: 0; height: 5px; opacity: 0.55;
    background: repeating-conic-gradient(#fff 0 25%, #111 0 50%) 0 0 / 6px 6px;
  }
  .f1-logo { color: #ff2a1f; font-size: 14px; letter-spacing: 0; margin-right: 6px; text-transform: none; }
  .f1-round { font-size: 10px; padding: 1px 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.14); color: #fff; letter-spacing: 0.04em; }
  .gp { display: flex; align-items: center; gap: 9px; }
  .gp .flag { width: 30px; height: 20px; border-radius: 3px; object-fit: cover; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25); }
  .gp-name { font-size: 19px; line-height: 1; text-transform: uppercase; }
  .gp-loc { font-size: 11px; margin-top: 3px; }
  .count {
    display: flex; align-items: flex-end; justify-content: space-between;
    margin: 11px 0 10px; padding: 9px 12px; border-radius: 12px;
    background: rgba(0, 0, 0, 0.32); box-shadow: inset 3px 0 0 #ff2a1f;
  }
  .count-label { display: flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  .count-label b { color: #fff; }
  .lights { display: flex; gap: 3px; padding: 3px 5px; border-radius: 4px; background: #0b0b0d; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12); }
  .lights i { width: 7px; height: 7px; border-radius: 50%; background: #5a1c1c; box-shadow: inset 0 0 0 1px rgba(255, 120, 120, 0.25); }
  .lights i.on { background: #ff2a1f; box-shadow: 0 0 6px #ff2a1f; }
  .lights-out { color: #30d158; font-size: 10px; }
  .digits { display: flex; align-items: flex-start; gap: 4px; margin-top: 4px; }
  .digit { text-align: center; }
  .digit .n { font-size: 34px; line-height: 0.95; }
  .digit .u { font-size: 8px; font-weight: 700; letter-spacing: 0.12em; color: rgba(255, 255, 255, 0.45); margin-top: 3px; }
  .digits .sep { font-size: 26px; line-height: 1; color: rgba(255, 255, 255, 0.3); }
  .count-when { text-align: right; font-size: 11px; line-height: 1.35; }
  .count-when .t { font-size: 18px; color: #fff; }
  .strip { display: flex; margin: 0 2px 10px; gap: 4px; }
  .sess { flex: 1; text-align: center; padding: 5px 0 4px; border-radius: 3px; transform: skewX(-12deg); background: rgba(255, 255, 255, 0.07); }
  .sess > * { transform: skewX(12deg); }
  .sess .nm { font-size: 11px; }
  .sess .dt { font-size: 9px; color: rgba(255, 255, 255, 0.6); margin-top: 1px; }
  .sess.done { opacity: 0.4; }
  .sess.next .dt { color: #fff; }
  .sess.live { background: ${LIVE_RED}; }
  .driver {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 8px 6px 6px; border-radius: 10px;
  }
  .driver + .driver { margin-top: 5px; }
  .driver .plate { /* car number on a slanted team-colour plate */
    width: 36px; height: 30px; display: flex; align-items: center; justify-content: center;
    transform: skewX(-12deg); border-radius: 3px; box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.25);
  }
  .driver .plate span { transform: skewX(12deg); font-size: 20px; color: #fff; }
  .driver .who { flex: 1; min-width: 0; }
  .driver .code { font-size: 19px; line-height: 1; }
  .driver .meta { font-size: 10px; margin-top: 2px; }
  .driver .wk { font-size: 9px; margin-top: 2px; color: rgba(255, 255, 255, 0.75); }
  .driver .stat { width: 62px; text-align: right; }
  .driver .stat .k { font-size: 8px; font-weight: 700; letter-spacing: 0.08em; color: rgba(255, 255, 255, 0.45); }
  .driver .stat .v { font-size: 22px; line-height: 1.05; }
  .driver .stat .s { font-size: 9px; color: rgba(255, 255, 255, 0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .driver .stat.click { cursor: pointer; border-radius: 6px; padding: 1px 3px; margin: -1px -3px; }
  .driver .stat.click:hover { background: rgba(255, 255, 255, 0.1); }
  .driver .stat.click .k { border-bottom: 1px dotted rgba(255, 255, 255, 0.35); }
  /* timing-tower tables */
  .f1t { display: none; margin-top: 7px; border-radius: 10px; overflow: hidden; background: rgba(0, 0, 0, 0.42); }
  .f1t.open { display: block; }
  .f1t-h {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 6px 8px 5px 14px; position: relative; background: rgba(255, 255, 255, 0.06);
  }
  .f1t-h::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 6px;
    background: repeating-conic-gradient(#fff 0 25%, #111 0 50%) 0 0 / 6px 6px; opacity: 0.6; }
  .f1t-h b { font-size: 13px; text-transform: uppercase; }
  .f1t-h span { font-size: 9px; color: rgba(255, 255, 255, 0.45); }
  .f1t-body { padding: 3px 0 4px; }
  .f1t-r { display: flex; align-items: center; gap: 6px; height: 16px; padding: 0 8px; font-size: 10px; color: rgba(255, 255, 255, 0.8); }
  .f1t-r:nth-child(even) { background: rgba(255, 255, 255, 0.035); }
  .f1t-r.me { color: #fff; background: rgba(255, 255, 255, 0.13); }
  .f1t-r .p { width: 18px; text-align: right; font-size: 11px; color: rgba(255, 255, 255, 0.55); }
  .f1t-r.me .p { color: #fff; }
  .f1t-r .c { width: 4px; height: 11px; border-radius: 1px; transform: skewX(-12deg); }
  .f1t-r .cd { width: 30px; font-size: 12px; }
  .f1t-r .tm { flex: 1; min-width: 0; color: rgba(255, 255, 255, 0.45); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .f1t-r .v { text-align: right; white-space: nowrap; font-family: "SF Mono", Menlo, monospace; font-size: 9.5px; }
  .f1t-r .cg { width: 22px; text-align: right; }
  .f1t-r .cg .chg { margin-left: 0; font-size: 8px; font-style: normal; }
  .f1t-r .cg .chg.same { color: rgba(255, 255, 255, 0.25); }
  .stat .v .chg { font-size: 9px; font-style: normal; vertical-align: 3px; }
  .f1t-r .x { width: 26px; text-align: right; color: rgba(255, 255, 255, 0.45); font-family: "SF Mono", Menlo, monospace; font-size: 9px; }

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

  /* ---- NHL: ice-sheet matchup, scoreboard capsule, game detail ---- */
  .matchup.rink {
    position: relative; overflow: hidden; border-radius: 16px; padding: 10px 10px 9px;
    background: linear-gradient(180deg, rgba(225, 245, 255, 0.09), rgba(225, 245, 255, 0.02));
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.13);
  }
  .matchup.rink > * { position: relative; z-index: 1; }
  .matchup.rink .rink-lines { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; }
  .matchup.rink .team img { width: 38px; height: 38px; }
  .matchup.rink .team .ab { font-size: 13px; }
  .matchup.rink .team .rec { font-size: 10px; margin-top: 1px; }
  .streak { display: inline-block; margin-top: 3px; padding: 0 5px; border-radius: 4px; font-size: 9px; font-weight: 800; }
  .streak.W { background: rgba(48, 209, 88, 0.18); color: #30d158; }
  .streak.L, .streak.OT { background: rgba(255, 69, 58, 0.18); color: #ff6961; }
  .matchup.rink .mid .big { font-size: 22px; font-weight: 600; }
  .matchup.live { cursor: pointer; }
  .live-score { font-size: 28px; font-weight: 700; letter-spacing: 0.02em; }
  .live-score i { font-style: normal; color: rgba(255, 255, 255, 0.35); margin: 0 6px; }
  .live-state { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 700; color: #ff6961; }
  .live-state .dot { width: 6px; height: 6px; border-radius: 50%; background: #ff453a; box-shadow: 0 0 0 3px rgba(255, 69, 58, 0.25); }
  .live-sog { font-size: 9px; color: rgba(255, 255, 255, 0.45); margin-top: 2px; }
  .pp {
    display: inline-flex; align-items: center; gap: 4px; margin-top: 3px; padding: 1px 6px; border-radius: 5px;
    font-size: 9px; font-weight: 800; background: rgba(255, 179, 64, 0.22); color: #ffb340;
    box-shadow: inset 0 0 0 0.5px rgba(255, 179, 64, 0.5);
  }
  .pp span { font-weight: 700; font-variant-numeric: tabular-nums; }
  .sb {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 12px; cursor: pointer;
    background: rgba(0, 0, 0, 0.3); box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.1);
  }
  .sb:hover { background: rgba(0, 0, 0, 0.38); }
  .sb img { width: 22px; height: 22px; object-fit: contain; }
  .sb .side { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
  .sb .side.home { justify-content: flex-end; }
  .sb .ab { font-size: 12px; font-weight: 700; letter-spacing: 0.03em; }
  .sb .pts { font-size: 22px; font-weight: 700; min-width: 16px; text-align: center; }
  .sb .lose { opacity: 0.42; }
  .sb .mid { flex: none; text-align: center; min-width: 58px; }
  .sb .fin { display: inline-block; padding: 1px 6px; border-radius: 5px; font-size: 9px; font-weight: 800; letter-spacing: 0.06em; background: rgba(255, 255, 255, 0.12); }
  .sb .when { font-size: 9px; color: rgba(255, 255, 255, 0.45); margin-top: 2px; }
  .sb .tog { font-size: 9px; color: rgba(255, 255, 255, 0.4); transition: transform 0.2s; }
  .gd { display: none; margin-top: 6px; padding: 9px 10px 8px; border-radius: 12px; background: rgba(0, 0, 0, 0.26); }
  .gd.open { display: block; }
  .gd-h { display: flex; align-items: center; gap: 8px; margin: 9px 0 4px; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255, 255, 255, 0.5); }
  .gd-h::after { content: ""; flex: 1; height: 0.5px; background: rgba(255, 255, 255, 0.12); }
  .gd-h:first-child { margin-top: 0; }
  .gd-h em { font-style: normal; font-weight: 400; letter-spacing: 0; text-transform: none; color: rgba(255, 255, 255, 0.32); }
  .sog { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; }
  .sog .bar { flex: 1; height: 6px; border-radius: 3px; overflow: hidden; display: flex; gap: 2px; }
  .sog .bar i { display: block; height: 100%; border-radius: 3px; }
  .goal { display: flex; align-items: flex-start; gap: 7px; padding: 4px 0; }
  .goal .t { flex: none; width: 36px; text-align: center; padding: 1px 0; border-radius: 5px; font-size: 10px; line-height: 14px; background: rgba(255, 255, 255, 0.07); color: rgba(255, 255, 255, 0.7); }
  .goal img { width: 16px; height: 16px; margin-top: 0; object-fit: contain; }
  .goal .who { flex: 1; min-width: 0; font-size: 12px; line-height: 16px; }
  .goal .who b { font-weight: 600; }
  .goal .who i { font-style: normal; color: rgba(255, 255, 255, 0.4); }
  .goal .ast { font-size: 10px; line-height: 13px; color: rgba(255, 255, 255, 0.42); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .goal .tag { font-size: 8px; font-weight: 800; padding: 1px 4px; border-radius: 3px; margin-left: 5px; vertical-align: 1px; background: rgba(255, 179, 64, 0.18); color: #ffb340; }
  .goal .sc { font-size: 12px; line-height: 16px; color: rgba(255, 255, 255, 0.45); }
  .goal .sc b { color: #fff; }
  .tst { display: flex; align-items: center; gap: 8px; margin: 3px 0; font-size: 11px; font-weight: 700; }
  .tst .v { width: 34px; }
  .tst .v:last-child { text-align: right; }
  .tst .mid { flex: 1; min-width: 0; }
  .tst .lb { text-align: center; font-size: 9px; font-weight: 600; color: rgba(255, 255, 255, 0.45); margin-bottom: 2px; }
  .tst .bar { display: flex; gap: 2px; height: 4px; border-radius: 2px; overflow: hidden; }
  .tst .bar i { display: block; height: 100%; border-radius: 2px; }
  .so { display: flex; align-items: center; gap: 7px; height: 20px; font-size: 11px; font-weight: 700; }
  .so img { width: 16px; height: 16px; object-fit: contain; }
  .so .att { display: flex; gap: 5px; margin-left: 4px; }
  .so .att i { width: 9px; height: 9px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.3); }
  .so .att i.goal-hit { background: #30d158; box-shadow: none; }
  .so-win { font-size: 10px; color: rgba(255, 255, 255, 0.45); margin-top: 2px; }
  .stars { display: flex; gap: 6px; }
  .stars > div { flex: 1; min-width: 0; text-align: center; padding: 6px 4px 5px; border-radius: 9px; background: rgba(255, 255, 255, 0.05); }
  .stars .st { color: #ffd23f; font-size: 9px; letter-spacing: 1px; }
  .stars img { width: 18px; height: 18px; margin: 3px auto 2px; object-fit: contain; }
  .stars .nm { font-size: 10px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stars .ln { font-size: 9px; color: rgba(255, 255, 255, 0.5); margin-top: 1px; }

  /* ---- Badminton: court-green card, bracket timeline, court board, score chart ---- */
  .card.badminton {
    background: linear-gradient(165deg, rgba(14, 112, 82, 0.72) 0%, rgba(8, 44, 34, 0.74) 60%, rgba(10, 18, 16, 0.74) 100%);
  }
  .card.badminton .card-h { color: rgba(225, 255, 240, 0.7); }
  .shuttle { width: 13px; height: 13px; margin-right: 5px; vertical-align: -2px; }
  .card.badminton .rank b { color: #ffd76a; font-size: 14px; }
  .evt { display: inline-block; margin-right: 4px; padding: 0 5px; border-radius: 4px; font-size: 9px; font-weight: 700; background: rgba(255, 255, 255, 0.12); color: #fff; letter-spacing: 0; }
  .card.badminton .path { position: relative; padding: 2px 8px 2px 18px; }
  .card.badminton .path::before { content: ""; position: absolute; left: 11px; top: 9px; bottom: 9px; width: 1.5px; background: rgba(255, 255, 255, 0.18); }
  .card.badminton .path-r { position: relative; }
  .card.badminton .path-r::before {
    content: ""; position: absolute; left: -10px; top: 6px; width: 6px; height: 6px; border-radius: 50%;
    background: #ffd76a; box-shadow: 0 0 0 2px rgba(10, 40, 30, 0.9);
  }
  .card.badminton .path-r.maybe::before { background: transparent; box-shadow: inset 0 0 0 1.5px rgba(255, 215, 106, 0.7), 0 0 0 2px rgba(10, 40, 30, 0.9); }
  .card.badminton .cands { margin-left: 40px; }
  .court {
    position: relative; overflow: hidden; cursor: pointer; padding: 6px 9px; border-radius: 10px;
    background: rgba(4, 60, 44, 0.55); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  }
  .court:hover { box-shadow: inset 0 0 0 1px rgba(255, 215, 106, 0.55); }
  .court > *:not(svg) { position: relative; z-index: 1; }
  .court .court-lines { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; }
  .court .board-r .g.w { color: #ffd76a; }
  .court .tog { position: absolute; right: 6px; bottom: 3px; font-size: 8px; color: rgba(255, 255, 255, 0.4); }
  .bd { display: none; margin-top: 6px; padding: 9px 10px 8px; border-radius: 12px; background: rgba(0, 0, 0, 0.28); }
  .bd.open { display: block; }
  .bd-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 7px; }
  .bd-meta span { font-size: 10px; padding: 1px 7px; border-radius: 10px; background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.75); }
  .bd-h { display: flex; align-items: center; gap: 8px; margin: 8px 0 4px; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; color: rgba(255, 255, 255, 0.5); }
  .bd-h::after { content: ""; flex: 1; height: 0.5px; background: rgba(255, 255, 255, 0.12); }
  .bd-h:first-of-type { margin-top: 0; }
  .chart { display: block; width: 100%; height: 96px; }
  .legend2 { display: flex; gap: 12px; font-size: 9px; color: rgba(255, 255, 255, 0.6); margin: 3px 0 4px; }
  .legend2 i { display: inline-block; width: 10px; height: 2px; margin-right: 4px; vertical-align: 3px; border-radius: 1px; }
  .stat2 { display: flex; align-items: center; gap: 8px; height: 19px; font-size: 11px; }
  .stat2 .lbl { width: 76px; color: rgba(255, 255, 255, 0.55); font-size: 10px; }
  .stat2 .v { width: 22px; text-align: center; font-weight: 700; }
  .stat2 .bar { flex: 1; height: 5px; display: flex; gap: 2px; }
  .stat2 .bar i { display: block; height: 100%; border-radius: 3px; }
  .nopts { font-size: 10px; color: rgba(255, 255, 255, 0.4); }

  /* ---- NHL standings (division + wild card), opened from the rank ---- */
  .rank.click { cursor: pointer; padding: 1px 5px; margin: -1px -5px; border-radius: 6px; }
  .rank.click:hover { background: rgba(255, 255, 255, 0.1); }
  .rank.click b { border-bottom: 1px dotted rgba(95, 211, 218, 0.6); }
  .nst { display: none; margin: 2px 0 8px; padding: 8px 9px 6px; border-radius: 12px; background: rgba(0, 0, 0, 0.28); }
  .nst.open { display: block; }
  .nst-h { display: flex; justify-content: space-between; align-items: baseline; margin: 8px 0 3px; }
  .nst-h:first-child { margin-top: 0; }
  .nst-h b { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.75); }
  .nst-h span { font-size: 9px; color: rgba(255, 255, 255, 0.4); }
  .nst-cols { display: flex; gap: 6px; padding: 0 6px; font-size: 8px; font-weight: 700; letter-spacing: 0.06em; color: rgba(255, 255, 255, 0.35); }
  .nst-r { display: flex; align-items: center; gap: 6px; height: 19px; padding: 0 6px; border-radius: 6px; font-size: 11px; }
  .nst-r.me { background: rgba(95, 211, 218, 0.16); box-shadow: inset 2px 0 0 #5fd3da; font-weight: 700; }
  .nst-r.cut { box-shadow: 0 1px 0 rgba(255, 69, 58, 0.55); border-radius: 6px 6px 0 0; margin-bottom: 2px; }
  .nst-r.me.cut { box-shadow: inset 2px 0 0 #5fd3da, 0 1px 0 rgba(255, 69, 58, 0.55); }
  .nst-r .p, .nst-cols .p { width: 14px; text-align: right; color: rgba(255, 255, 255, 0.5); }
  .nst-r img { width: 16px; height: 16px; object-fit: contain; }
  .nst-r .ab { width: 30px; font-weight: 700; }
  .nst-r .nm, .nst-cols .nm { flex: 1; min-width: 0; color: rgba(255, 255, 255, 0.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nst-r.me .nm { color: #fff; }
  .nst-r .gp, .nst-cols .gp { width: 18px; text-align: right; color: rgba(255, 255, 255, 0.5); }
  .nst-r .rec, .nst-cols .rec { width: 42px; text-align: right; color: rgba(255, 255, 255, 0.6); }
  .nst-r .pt, .nst-cols .pt { width: 20px; text-align: right; font-weight: 700; }
  .nst-cols .ab { width: 46px; }
  .nst.bwf .nst-r img.flag { width: 16px; height: 11px; border-radius: 2px; object-fit: cover; }
  .nst.bwf .nst-r .nm { color: rgba(255, 255, 255, 0.8); }
  .nst.bwf .nst-r.me { background: rgba(255, 215, 106, 0.16); box-shadow: inset 2px 0 0 #ffd76a; }
  .nst .chgc { width: 22px; text-align: right; font-size: 9px; }
  .nst .chgc .chg { margin-left: 0; font-size: 9px; }
  .nst .chgc .chg.same { color: rgba(255, 255, 255, 0.25); }
  .nst.bwf .pts { width: 52px; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .card.badminton .rank.click b { border-bottom-color: rgba(255, 215, 106, 0.6); }

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

// Keep the widget on this screen: an offset saved on a wider/second display (or dragged past
// the edge) would otherwise put it entirely off screen. Origin = top 10px, right 14px, 344px wide.
function clampPos(p) {
  if (typeof window === "undefined" || !window.innerWidth) return p;
  const minX = -(window.innerWidth - 14 - 344), maxY = window.innerHeight - 60;
  return { x: Math.min(14, Math.max(minX, p.x || 0)), y: Math.min(maxY, Math.max(-10, p.y || 0)) };
}

function loadPos() {
  try {
    return clampPos(JSON.parse(localStorage.getItem(POS_KEY)) || { x: 0, y: 0 });
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
    pos = clampPos({ x: start.x + ev.clientX - sx, y: start.y + ev.clientY - sy });
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
  // Fast repeated clicks are a dblclick: keep it from reaching the header's position reset.
  <span className="chev" onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
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
    live: "Live", liveNow: "Live now", recent: "Last 24h", started: "Starting soon", underway: "underway",
    next: "Next", last: "Last", noEntries: "No upcoming entries",
    inDays: (d) => `in ${d} days`, inDH: (d, h) => `in ${d}d ${h}h`, inHM: (h, m) => `in ${h}h ${m}m`, inM: (m) => `in ${m}m`,
    stale: (a) => `⚠ Couldn't refresh · data from ${a}`,
    ago: (h) => (h < 1 ? "<1h ago" : h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`),
  },
  zh: {
    today: "今天", tomorrow: "明天", yesterday: "昨天", locale: "zh-CN",
    live: "进行中", liveNow: "进行中", recent: "24小时内", started: "即将开始", underway: "进行中",
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
  if (ms <= 0) return L.started; // start time passed but not live yet (pre-game / delay)
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

// Start lights: one more red light per day as the session nears; all five on the final day,
// then "lights out" once it is live.
function Lights({ ev }) {
  if (ev.status === "live") return <span className="lights-out f1x">LIGHTS OUT</span>;
  const days = Math.floor((Date.parse(ev.start) - Date.now()) / DAY);
  const lit = Math.max(0, Math.min(5, 5 - days));
  return <span className="lights">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < lit ? "on" : ""} />)}</span>;
}

function Countdown({ ev, tz, L }) {
  const live = ev.status === "live";
  const p = parts(Date.parse(ev.start) - Date.now());
  const units = [["DAYS", p.d], ["HRS", p.h], ["MIN", p.m]];
  return (
    <div className={`count ${isHot(ev, tz) ? "hot" : ""}`}>
      <div>
        <div className="count-label dim">
          <span>{live ? <span className="pill live">Live</span> : "Next"} · <b>{ev.subtitle}</b></span>
          <Lights ev={ev} />
        </div>
        {live ? (
          <div className="digits"><div className="digit"><div className="n f1x">ON TRACK</div></div></div>
        ) : (
          <div className="digits">
            {units.map(([u, n], i) => [
              i > 0 && <span className="sep f1x" key={u + "s"}>:</span>,
              <div className="digit" key={u}>
                <div className="n f1x">{String(n).padStart(2, "0")}</div>
                <div className="u">{u}</div>
              </div>,
            ])}
          </div>
        )}
      </div>
      <div className="count-when dim">
        <div>{relDay(ev, tz, L)}</div>
        <div className="t f1x">{clock(ev.start, tz)}</div>
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
            <div className="nm f1x">{SESSION_ABBR[s.name] || s.name}</div>
            <div className="dt">{weekday(s.start, tz)} {clock(s.start, tz).replace(":00", "").replace(" ", "").toLowerCase()}</div>
          </div>
        );
      })}
    </div>
  );
}

// Driver row: number plate, code/team, this weekend's session results, last race, standings.
function Driver({ s, tz }) {
  const color = s.color || "#888888";
  const last = s.last;
  const r = s.ranking;
  const hot = isHot(last, tz);
  const weekend = ((s.next && s.next.sessions) || []).filter((x) => x.result);
  return (
    <div className={`driver ${hot ? "hot" : ""}`}
         style={hot ? null : { background: `linear-gradient(100deg, ${rgba(color, 0.38)}, ${rgba(color, 0.05)} 70%)` }}>
      <div className="plate" style={{ background: color }}><span className="f1x">{s.badge}</span></div>
      <div className="who">
        <div className="code f1x">{s.short}</div>
        <div className="meta dim ellipsis">{s.team}</div>
        {weekend.length > 0 && (
          // Newest first, at most 3, so qualifying is never cut off.
          <div className="wk ellipsis">
            {weekend.slice(-3).reverse().map((x) => `${WEEKEND_ABBR[x.name] || x.name} ${x.result.summary}`).join(" · ")}
          </div>
        )}
      </div>
      <div className="stat click" onClick={(e) => toggleTable(e, "last_race")}>
        <div className="k">LAST RACE</div>
        <div className="v f1x">{last && last.result ? last.result.summary : "–"}</div>
        <div className="s">{last ? shortTitle(last.title).replace(" GP", "") : ""}</div>
      </div>
      <div className="stat click" onClick={(e) => toggleTable(e, "standings")}>
        <div className="k">STANDINGS</div>
        <div className="v f1x">{r ? `P${r.position}` : "–"}{r && r.change ? <Change n={r.change} /> : null}</div>
        <div className="s">{r ? `${Math.round(r.points)} pts` : ""}</div>
      </div>
    </div>
  );
}

// Full last-race classification / driver standings, opened from the driver stats.
function toggleTable(e, kind) {
  const card = e.currentTarget.closest(".card");
  card.querySelectorAll(".f1t").forEach((t) => {
    t.classList.toggle("open", t.dataset.kind === kind && !t.classList.contains("open"));
  });
}

function F1Table({ kind, table, stale }) {
  if (!table) return null;
  return (
    <div className="f1t" data-kind={kind}>
      <div className="f1t-h">
        <b className="f1x">{shortTitle(table.title)}</b>
        <span>{table.subtitle}{stale ? " · ⚠ stale" : ""}</span>
      </div>
      <div className="f1t-body">
        {table.rows.map((r) => (
          <div className={`f1t-r ${r.self ? "me" : ""}`} key={r.code + r.pos}
               style={r.self ? { boxShadow: `inset 3px 0 0 ${r.color || "#fff"}` } : null}>
            <span className="p f1x">{r.pos}</span>
            <span className="c" style={{ background: r.color || "#888" }} />
            <span className="cd f1x">{r.code}</span>
            <span className="tm">{r.team}</span>
            {kind === "standings" && <span className="cg"><Change n={r.change} /></span>}
            <span className="v">{r.value}</span>
            <span className="x">{r.extra}</span>
          </div>
        ))}
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
  // Faint carbon-fibre weave over the team-colour gradient.
  const carbon = "repeating-linear-gradient(45deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 4px), "
    + "repeating-linear-gradient(-45deg, rgba(0,0,0,0.09) 0 2px, transparent 2px 4px)";
  const bg = `${carbon}, linear-gradient(140deg, ${rgba(c1, 0.6)} 0%, rgba(20, 20, 26, 0.68) 50%, ${rgba(c2, 0.55)} 100%)`;
  const accent = `linear-gradient(135deg, ${rgba(c1, 0.75)}, ${rgba(c2, 0.75)})`;
  const collapsed = isCollapsed(sport, tz);
  return (
    <div className={`card f1 ${collapsed ? "collapsed" : ""}`} style={{ background: bg }}>
      <Header>
        <span><span className="f1-logo f1x">F1</span>{sport.next_round && <span className="f1-round f1x">ROUND {sport.next_round}</span>}</span>
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
                  <div className="gp-name f1x">{shortTitle(ev.title)}</div>
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
        {sport.tables && <F1Table kind="last_race" table={sport.tables.last_race} stale={sport.tables_stale} />}
        {sport.tables && <F1Table kind="standings" table={sport.tables.standings} stale={sport.tables_stale} />}
      </div>
    </div>
  );
}

// ---------- head-to-head card (Apple Sports style) ----------

const isFlag = (url) => /flag/i.test(url || "");

// Live game clock: count down locally every second from the polled value (seconds at as_of)
// while the clock is running; every data refresh re-renders the span and corrects any drift
// (e.g. whistles, which the widget cannot see).
const fmtClock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

function liveSeconds(el) {
  const sec = +el.dataset.sec;
  if (el.dataset.running !== "1") return sec;
  return Math.max(0, Math.round(sec - (Date.now() - Date.parse(el.dataset.asof)) / 1000));
}

if (typeof window !== "undefined" && !window.__sportsClockTicker) {
  window.__sportsClockTicker = setInterval(() => {
    document.querySelectorAll("[data-live-clock]").forEach((el) => { el.textContent = fmtClock(liveSeconds(el)); });
  }, 1000);
}

const LiveClock = ({ lv }) => {
  if (lv.seconds == null || !lv.as_of) return <span>{lv.clock}</span>;
  const running = lv.running && !lv.intermission;
  const sec = running ? Math.max(0, Math.round(lv.seconds - (Date.now() - Date.parse(lv.as_of)) / 1000)) : lv.seconds;
  return (
    <span data-live-clock="" data-sec={lv.seconds} data-asof={lv.as_of} data-running={running ? "1" : "0"}>
      {fmtClock(sec)}
    </span>
  );
};

// Faint ice markings behind the NHL matchup, kept clear of the text: goal lines + creases at
// the ends, blue lines between the logos and the centre, red line only as ticks at the boards.
const RinkLines = () => (
  <svg className="rink-lines" viewBox="0 0 400 100" preserveAspectRatio="none">
    <line x1="20" y1="8" x2="20" y2="92" stroke="rgba(255,69,58,0.28)" strokeWidth="1.2" />
    <line x1="380" y1="8" x2="380" y2="92" stroke="rgba(255,69,58,0.28)" strokeWidth="1.2" />
    <path d="M20,41 A9,9 0 0 1 20,59 Z" fill="rgba(10,132,255,0.16)" />
    <path d="M380,41 A9,9 0 0 0 380,59 Z" fill="rgba(10,132,255,0.16)" />
    <line x1="118" y1="0" x2="118" y2="100" stroke="rgba(10,132,255,0.3)" strokeWidth="2.5" />
    <line x1="282" y1="0" x2="282" y2="100" stroke="rgba(10,132,255,0.3)" strokeWidth="2.5" />
    <line x1="200" y1="0" x2="200" y2="9" stroke="rgba(255,69,58,0.4)" strokeWidth="2.5" />
    <line x1="200" y1="91" x2="200" y2="100" stroke="rgba(255,69,58,0.4)" strokeWidth="2.5" />
  </svg>
);

// The matchup column is narrow: a Chinese doubles pair becomes its two surnames ("梁伟铿 / 王昶" → "梁王").
// Only when every part is Chinese; mixed names (e.g. "Chen / Lin") stay as they are.
function pairShort(name) {
  const parts = name.split(" / ");
  return parts.length > 1 && parts.every((p) => /^[\u4e00-\u9fff]{2,}$/.test(p)) ? parts.map((p) => p[0]).join("") : name;
}

function Matchup({ ev, tz, L, zh, rink }) {
  const [a, b] = ev.competitors;
  const live = ev.status === "live";
  const streak = (c) => ((c.form || "").match(/·\s*([A-Z]+)(\d+)/) || []);
  const Team = ({ c }) => (
    <div className="team">
      <Img src={c.logo} cls={isFlag(c.logo) ? "flag" : ""} />
      <div className="ab ellipsis">{zh && c.name_zh ? pairShort(c.name_zh) : c.short}</div>
      {c.record && <div className="rec">{c.record}</div>}
      {sit && sit.team === c.short ? (
        // Power play / empty net: penalty time counts down with the game clock.
        <div className="pp">{sit.label}{sit.seconds != null && (
          <LiveClock lv={{ seconds: sit.seconds, as_of: lv.as_of, running: lv.running, intermission: lv.intermission }} />
        )}</div>
      ) : rink && streak(c)[1] ? <div className={`streak ${streak(c)[1]}`}>{streak(c)[1]}{streak(c)[2]}</div>
        : c.form && <div className="frm">{c.form}</div>}
    </div>
  );
  const lv = ev.live;
  const sit = live && lv && lv.situation;
  const title = zh ? zhTournament(ev.title) : shortTitle(ev.title);
  return (
    <div className={`matchup ${rink ? "rink" : ""} ${live && ev.detail ? "live" : ""} ${!live && isHot(ev, tz) ? "hot" : ""}`}
         onClick={live && ev.detail ? toggleDetail : null}>
      {rink && <RinkLines />}
      <Team c={a} />
      {live ? (
        <div className="mid">
          <div className="live-score">{a.score || 0}<i>:</i>{b.score || 0}</div>
          <div className="live-state">
            <span className="dot" />
            {lv ? (lv.intermission ? <span>{lv.period} INT · <LiveClock lv={lv} /></span>
              : <span>{lv.period}{lv.clock || lv.seconds != null ? " · " : ""}<LiveClock lv={lv} /></span>) : L.live}
          </div>
          {lv && lv.sog && <div className="live-sog">SOG {lv.sog.away}–{lv.sog.home}{sit ? ` · ${sit.strength}` : ""}</div>}
        </div>
      ) : (
        <div className="mid">
          <div className="big">{isDateOnly(ev) ? relDay(ev, tz, L) : clock(ev.start, tz)}</div>
          <div className="sm dim">{`${isDateOnly(ev) ? "" : relDay(ev, tz, L) + " · "}${countdown(ev, tz, L)}`}</div>
          <div className="sm faint ellipsis">{title}</div>
        </div>
      )}
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

// NHL game detail toggles open from the scoreboard (finished) or the live matchup.
function toggleDetail(e) {
  const panel = e.currentTarget.parentElement.querySelector(".gd");
  if (panel) panel.classList.toggle("open");
}

// Last game as a symmetric scoreboard capsule: away · FINAL · home, loser dimmed.
function Scoreboard({ ev, tz, L }) {
  const [a, b] = ev.competitors;
  const suffix = ((ev.result && ev.result.summary) || "").match(/\b(OT|SO)\b/);
  const outcome = ev.result && ev.result.outcome;
  const lose = (c) => (c.winner === false ? "lose" : "");
  return (
    <div className={`sb ${isHot(ev, tz) ? "hot" : ""}`} onClick={toggleDetail}>
      <div className={`side ${lose(a)}`}><Img src={a.logo} /><span className="ab">{a.short}</span><span className="pts">{a.score}</span></div>
      <div className="mid">
        <span className="fin">FINAL{suffix ? `/${suffix[1]}` : ""}</span>
        <div className="when">{relDay(ev, tz, L)}</div>
      </div>
      <div className={`side home ${lose(b)}`}><span className="pts">{b.score}</span><span className="ab">{b.short}</span><Img src={b.logo} /></div>
      {outcome && <span className={`wl ${outcome}`}>{outcome === "win" ? "W" : "L"}</span>}
      {ev.detail && <span className="tog">▾</span>}
    </div>
  );
}

const PERIOD_NAMES = { 1: "1st Period", 2: "2nd Period", 3: "3rd Period", OT: "Overtime" };

function GameDetail({ ev }) {
  const d = ev.detail;
  if (!d) return null;
  const [a, b] = ev.competitors;
  const logo = {};
  ev.competitors.forEach((c) => { logo[c.short] = c.logo; });
  const tint = (c) => (c.self ? "#5fd3da" : "rgba(255,255,255,0.4)");
  const sog = d.sog || {};
  const total = (sog.away || 0) + (sog.home || 0) || 1;
  let periods = ["1", "2", "3"].concat(d.goals.some((g) => g.period === "OT") ? ["OT"] : []);
  if (ev.status === "live" && ev.live) {
    // Only periods that have started.
    const cur = { "1ST": 1, "2ND": 2, "3RD": 3 }[ev.live.period] || 4;
    periods = periods.filter((p, i) => i < cur);
  }
  return (
    <div className="gd">
      <div className="gd-h">Shots on goal</div>
      <div className="sog">
        <span><span className="faint">{a.short}</span> {sog.away}</span>
        <span className="bar">
          <i style={{ width: `${(100 * (sog.away || 0)) / total}%`, background: tint(a) }} />
          <i style={{ flex: 1, background: tint(b) }} />
        </span>
        <span>{sog.home} <span className="faint">{b.short}</span></span>
      </div>
      {d.stats && d.stats.length > 0 && (
        <div>
          <div className="gd-h">Team stats</div>
          {d.stats.map((st) => {
            const sum = (st.a || 0) + (st.h || 0);
            const share = sum ? (100 * (st.a || 0)) / sum : 50;
            return (
              <div className="tst" key={st.key}>
                <span className="v">{st.away}</span>
                <div className="mid">
                  <div className="lb">{st.label}</div>
                  <span className="bar">
                    <i style={{ width: `${share}%`, background: tint(a) }} />
                    <i style={{ flex: 1, background: tint(b) }} />
                  </span>
                </div>
                <span className="v">{st.home}</span>
              </div>
            );
          })}
        </div>
      )}
      {periods.map((p) => {
        const goals = d.goals.filter((g) => g.period === p);
        return (
          <div key={p}>
            <div className="gd-h">{PERIOD_NAMES[p] || p}{goals.length ? null : <em>No scoring</em>}</div>
            {goals.map((g, i) => {
              const [x, y] = g.score.split("–");
              const awayScored = g.team === a.short;
              return (
                <div className="goal" key={i}>
                  <span className="t">{g.time}</span>
                  <Img src={logo[g.team]} />
                  <div className="who">
                    <b>{g.scorer}</b>{g.scorer_total ? <i> ({g.scorer_total})</i> : null}
                    {g.strength && <span className="tag">{g.strength}</span>}
                    {g.empty_net && <span className="tag">EN</span>}
                    <div className="ast">{g.assists.length ? g.assists.join(", ") : "Unassisted"}</div>
                  </div>
                  <span className="sc">{awayScored ? <b>{x}</b> : x} – {awayScored ? y : <b>{y}</b>}</span>
                </div>
              );
            })}
          </div>
        );
      })}
      {d.shootout && d.shootout.length > 0 && (
        <div>
          <div className="gd-h">Shootout</div>
          {[a, b].map((c) => (
            <div className="so" key={c.short}>
              <Img src={c.logo} />
              <span>{c.short}</span>
              <span className="att">
                {d.shootout.filter((x) => x.team === c.short).map((x, i) => (
                  <i key={i} className={x.result === "goal" ? "goal-hit" : ""} />
                ))}
              </span>
            </div>
          ))}
          {d.shootout.filter((x) => x.winner).map((x) => <div className="so-win" key={x.player}>Winner · {x.player}</div>)}
        </div>
      )}
      {d.stars && d.stars.length > 0 && (
        <div>
          <div className="gd-h">Three stars</div>
          <div className="stars">
            {d.stars.map((st) => (
              <div key={st.star}>
                <div className="st">{"★".repeat(st.star)}</div>
                <Img src={logo[st.team]} />
                <div className="nm">{st.name}</div>
                <div className="ln">{st.pos} · {st.line}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// NHL standings panel: division + conference wild card; red rule = last playoff spot.
function toggleStandings(e) {
  const panel = e.currentTarget.closest(".subj").querySelector(".nst");
  if (panel) panel.classList.toggle("open");
}

function NHLStandings({ tables }) {
  if (!tables || !tables.division) return null;
  const Table = ({ t }) => (
    <div>
      <div className="nst-h"><b>{t.title}</b><span>{t.subtitle}</span></div>
      <div className="nst-cols"><span className="p">#</span><span className="ab">TEAM</span><span className="nm" /><span className="chgc" /><span className="gp">GP</span><span className="rec">W-L-OT</span><span className="pt">PTS</span></div>
      {t.rows.map((r) => (
        <div className={`nst-r ${r.self ? "me" : ""} ${r.cut ? "cut" : ""}`} key={r.code}>
          <span className="p">{r.pos}</span>
          <Img src={r.logo} />
          <span className="ab">{r.code}</span>
          <span className="nm">{r.name}</span>
          <span className="chgc"><Change n={r.change} /></span>
          <span className="gp">{r.gp}</span>
          <span className="rec">{r.extra}</span>
          <span className="pt">{r.value}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="nst">
      <Table t={tables.division} />
      {tables.wildcard && <Table t={tables.wildcard} />}
    </div>
  );
}

// ---------- badminton extras ----------

// World top 10 for the subject's event, opened by clicking the rank (shares the .nst panel).
function BWFRanking({ t, zh, event }) {
  return (
    <div className="nst bwf">
      <div className="nst-h"><b>{zh ? `世界排名 · ${ZH_EVENTS[event] || event}` : t.title}</b><span>{zh ? `前 ${t.rows.length}` : t.subtitle}</span></div>
      {t.rows.map((row) => (
        <div className={`nst-r ${row.self ? "me" : ""}`} key={row.pos}>
          <span className="p">{row.pos}</span>
          <Img src={row.logo} cls="flag" />
          <span className="nm">{zh && row.name_zh ? row.name_zh : row.name}</span>
          <span className="chgc"><Change n={row.extra} /></span>
          <span className="pts">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

const Shuttle = () => (
  <svg className="shuttle" viewBox="0 0 24 24">
    <path d="M12 22a3 3 0 0 0 3-3v-1H9v1a3 3 0 0 0 3 3z" fill="#ffd76a" />
    <path d="M9 18 4 4l5 2 3-4 3 4 5-2-5 14z" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M12 2v16M9 6l1 12M15 6l-1 12" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
  </svg>
);

// Faint court lines behind the last-match board: sidelines, service lines, centre line, net.
const CourtLines = () => (
  <svg className="court-lines" viewBox="0 0 400 100" preserveAspectRatio="none">
    <g stroke="rgba(255,255,255,0.13)" strokeWidth="1.5" fill="none">
      <rect x="6" y="6" width="388" height="88" />
      <line x1="6" y1="16" x2="394" y2="16" /><line x1="6" y1="84" x2="394" y2="84" />
      <line x1="30" y1="6" x2="30" y2="94" /><line x1="370" y1="6" x2="370" y2="94" />
      <line x1="142" y1="6" x2="142" y2="94" /><line x1="258" y1="6" x2="258" y2="94" />
      <line x1="30" y1="50" x2="142" y2="50" /><line x1="258" y1="50" x2="370" y2="50" />
    </g>
    <line x1="200" y1="0" x2="200" y2="100" stroke="rgba(255,255,255,0.32)" strokeWidth="2" strokeDasharray="3 2" />
  </svg>
);

function toggleBD(e) {
  const panel = e.currentTarget.parentElement.querySelector(".bd");
  if (panel) panel.classList.toggle("open");
}

// Score progression: one section per game, our points (gold) vs opponent (white) per rally.
function ScoreChart({ games }) {
  const W = 300, H = 96, top = 14, bottom = 6, gap = 8;
  const total = games.reduce((a, g) => a + g.points.length, 0);
  const maxPts = Math.max(21, ...games.map((g) => Math.max(g.self, g.opp)));
  const usable = W - gap * (games.length - 1);
  const y = (v) => H - bottom - ((H - top - bottom) * v) / maxPts;
  let x0 = 0;
  const parts = games.map((g, gi) => {
    const w = (usable * g.points.length) / total;
    const x = (i) => x0 + (w * (i + 1)) / g.points.length;
    const line = (k) => `M${x0},${y(0)} ` + g.points.map((p, i) => `L${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
    const won = g.self > g.opp;
    const el = (
      <g key={gi}>
        <rect x={x0} y={top - 2} width={w} height={H - top - bottom + 2} rx="3" fill="rgba(255,255,255,0.035)" />
        <line x1={x0} y1={y(11)} x2={x0 + w} y2={y(11)} stroke="rgba(255,255,255,0.08)" strokeDasharray="2 2" />
        <path d={line(1)} fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.4" strokeLinejoin="round" />
        <path d={line(0)} fill="none" stroke="#ffd76a" strokeWidth="1.8" strokeLinejoin="round" />
        <text x={x0 + 2} y={9} fontSize="8" fill="rgba(255,255,255,0.5)">G{gi + 1}</text>
        <text x={x0 + w - 2} y={9} fontSize="8.5" textAnchor="end" fontWeight="700" fill={won ? "#ffd76a" : "rgba(255,255,255,0.75)"}>
          {g.self}-{g.opp}
        </text>
      </g>
    );
    x0 += w + gap;
    return el;
  });
  return <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">{parts}</svg>;
}

function BadmintonDetail({ ev, zh, selfName }) {
  const d = ev.detail;
  if (!d) return null;
  const [me, op] = ev.competitors;
  const hasPts = d.games.some((g) => g.points && g.points.length);
  const st = d.stats || {};
  const Stat = ({ label, pair }) => (pair && pair[0] != null ? (
    <div className="stat2">
      <span className="lbl">{label}</span>
      <span className="v" style={{ color: "#ffd76a" }}>{pair[0]}</span>
      <span className="bar">
        <i style={{ width: `${(100 * pair[0]) / ((pair[0] + pair[1]) || 1)}%`, background: "#ffd76a" }} />
        <i style={{ flex: 1, background: "rgba(255,255,255,0.4)" }} />
      </span>
      <span className="v">{pair[1]}</span>
    </div>
  ) : null);
  return (
    <div className="bd">
      <div className="bd-meta">
        {d.duration && <span>{zh ? `用时 ${d.duration} 分钟` : `${d.duration} min`}</span>}
        {d.venue && <span>{d.venue}</span>}
      </div>
      <div className="bd-h">{zh ? "得分走势" : "Score progression"}</div>
      {hasPts ? (
        <div>
          <ScoreChart games={d.games} />
          <div className="legend2">
            <span><i style={{ background: "#ffd76a" }} />{selfName || me.name}</span>
            <span><i style={{ background: "rgba(255,255,255,0.65)" }} />{zh && op.name_zh ? op.name_zh : op.name}</span>
          </div>
        </div>
      ) : <div className="nopts">{zh ? "暂无逐分数据" : "No point-by-point data"}</div>}
      {st.rallies_won && st.rallies_won[0] != null && (
        <div>
          <div className="bd-h">{zh ? "技术统计" : "Stats"}</div>
          <Stat label={zh ? "总得分" : "Points won"} pair={st.rallies_won} />
          <Stat label={zh ? "最长连续得分" : "Longest run"} pair={st.max_streak} />
          <Stat label={zh ? "局点" : "Game points"} pair={st.game_points} />
        </div>
      )}
    </div>
  );
}

// Tennis-style board with per-game scores. selfName replaces our side's name.
function Board({ ev, tz, selfName, zh, court }) {
  const n = Math.max(...ev.competitors.map((c) => (c.games || []).length));
  const other = (i) => ev.competitors[1 - i].games || [];
  return (
    <div className={`board ${court ? "court" : ""} ${isHot(ev, tz) ? "hot" : ""}`} onClick={court && ev.detail ? toggleBD : null}>
      {court && <CourtLines />}
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
      {court && ev.detail && <span className="tog">▾</span>}
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

function Subject({ s, tz, L, zh, sportId, tables }) {
  const nhl = sportId === "nhl";
  const r = s.ranking;
  const bwfTable = sportId === "badminton" && tables && r ? tables[r.label] : null;
  const canStand = (nhl && tables && tables.division) || bwfTable;
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
        {r && <span className={`rank ${canStand ? "click" : ""}`} onClick={canStand ? toggleStandings : null}>
          {zh ? ZH_EVENTS[r.label] || r.label : r.label} <b>#{r.position}</b><Change n={r.change} />
        </span>}
      </div>
      {r && r.note && <div className="note">{r.note}</div>}
      {nhl && canStand && <NHLStandings tables={tables} />}
      {bwfTable && <BWFRanking t={bwfTable} zh={zh} event={r.label} />}

      {next && next.competitors ? (
        <div>
          <Matchup ev={next} tz={tz} L={L} zh={zh} rink={nhl} />
          {nhl && next.status === "live" && <GameDetail ev={next} />}
          <Path path={next.path} zh={zh} />
        </div>
      )
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
          {hasGames && sportId === "badminton" ? (
            <div>
              <Board ev={last} tz={tz} selfName={zh ? s.short : null} zh={zh} court />
              <BadmintonDetail ev={last} zh={zh} selfName={zh ? s.short : null} />
            </div>
          )
            : hasGames ? <Board ev={last} tz={tz} selfName={zh ? s.short : null} zh={zh} />
            : nhl && last.competitors ? <div><Scoreboard ev={last} tz={tz} L={L} /><GameDetail ev={last} /></div>
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
        <span>{sport.id === "badminton" && <Shuttle />}{sport.name}</span>
        <span className="right">
          {r && r.detail && <span className="accent">{r.detail} · {r.points} pts</span>}
          <Chevron sport={sport} tz={tz} collapsed={collapsed} />
        </span>
      </Header>
      <Summary sport={sport} tz={tz} L={L} zh={zh} />
      <div className="body">
        {sport.subjects.map((s) => <Subject s={s} tz={tz} L={L} zh={zh} sportId={sport.id} tables={sport.tables} key={s.id} />)}
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
