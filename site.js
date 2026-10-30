/* LEGO Club results website. Reads data/index.json and data/events/<event>.json,
   which the Game Server uploads after every match. No server code: plain static files. */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const get = async (path) => {
    const r = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  };
  const TROPHY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3V3zm-1 4v1a2 2 0 0 0 2 2V7H6zm12 0h-2v3a2 2 0 0 0 2-2V7z"/></svg>';
  const STATUS = { live: ["live", "Live now"], final: ["final", "Final results"], upcoming: ["upcoming", "Coming up"] };
  const fmtDate = (d) => { if (!d) return ""; const t = new Date(d + "T12:00:00"); return isNaN(t) ? d : t.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric", year: "numeric" }); };
  const fmtTime = (iso) => { if (!iso) return ""; const t = new Date(iso); return isNaN(t) ? "" : t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); };

  // ---- live stream: YouTube links become an embedded player, anything else a button
  function youtubeEmbed(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\.|^m\./, "");
      let id = null;
      if (host === "youtu.be") id = u.pathname.slice(1);
      else if (host === "youtube.com") {
        if (u.pathname === "/watch") id = u.searchParams.get("v");
        else if (/^\/(live|embed|shorts)\//.test(u.pathname)) id = u.pathname.split("/")[2];
        else if (/^\/(channel)\//.test(u.pathname)) return `https://www.youtube.com/embed/live_stream?channel=${u.pathname.split("/")[2]}`;
      }
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
    } catch (e) { return null; }
  }
  function streamBlock(url, live, ended) {
    if (!url) return "";
    const emb = live ? youtubeEmbed(url) : null;     // the player only while an event is live; otherwise just the link
    const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; } })();
    const title = live ? "Watch the live stream" : ended ? "Watch the replay" : "LEGO Club live stream";
    const sub = live ? "Matches, the score reveals and the awards, live." : ended ? "Missed it? The stream recording is on " + (host || "the stream page") + "." : "Our live streams and past events.";
    return `<div class="brick studs ${live ? "red" : "cyan"} stream-cta"><div><h2>${title}</h2><div>${esc(sub)}</div></div>
        <a class="btn ghost" href="${esc(url)}" target="_blank" rel="noopener">${live ? "Open on " + esc(host || "stream") : ended ? "Watch the replay" : "Visit the channel"}</a></div>
      ${emb ? `<div class="frame" style="margin-top:12px"><iframe src="${esc(emb)}" title="Live stream" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>` : ""}`;
  }

  /* ================================================================ home page */
  async function home() {
    let idx;
    try { idx = await get("data/index.json"); } catch (e) { $("#events").innerHTML = '<div class="empty">Results will appear here after the first event is published.</div>'; return; }
    const site = idx.site || {};
    if (site.title) { $("#site-title").textContent = site.title; $("#hero-title").textContent = `${site.title} Results`; document.title = `${site.title} Results`; }
    $("#hero-tag").textContent = site.tagline || "";
    const events = idx.events || [];
    const live = events.find((e) => e.status === "live");
    const streamUrl = (live && live.stream_url) || site.stream_url;
    $("#stream").innerHTML = streamBlock(streamUrl, !!live);
    $("#nav-live").classList.toggle("hidden", !(live && streamUrl));
    $("#nav-live").textContent = "Watch live";
    $("#live-card").innerHTML = live ? `<a class="brick studs cyan ecard" href="event.html?e=${encodeURIComponent(live.slug)}" style="margin-top:22px">
        <div class="d" style="color:#fff"><span>${esc(fmtDate(live.date))}</span><span class="chip live">Live now</span></div>
        <h3 style="font-size:28px">${esc(live.name)}</h3><div>${live.played} matches played · ${live.teams} teams</div>
        <div class="go" style="color:#fff">Follow the live results →</div></a>` : "";
    $("#events").innerHTML = events.map((e) => {
      const [cls, txt] = STATUS[e.status] || STATUS.upcoming;
      return `<a class="brick studs ecard" href="event.html?e=${encodeURIComponent(e.slug)}">
        <div class="d"><span>${esc(fmtDate(e.date))}</span><span class="chip ${cls}">${txt}</span></div>
        <h3>${esc(e.name)}</h3>
        ${e.champion ? `<div class="champ">🏆 Champions: ${esc((e.champion.teams || []).filter(Boolean).join(" & "))}</div>` : ""}
        ${e.top && e.top.length ? `<ol>${e.top.map((t) => `<li>${esc(t.team)} <span>${esc(t.name)}</span></li>`).join("")}</ol>` : `<div class="muted">${e.teams} teams</div>`}
        <div class="go">See results →</div></a>`;
    }).join("") || '<div class="empty">No events have been published yet.</div>';
    $("#updated").textContent = idx.updated ? `Last updated ${fmtDate(idx.updated.slice(0, 10))}, ${fmtTime(idx.updated)}.` : "";
    if (live) setTimeout(home, 60000);
  }

  /* ================================================================ event page */
  const params = new URLSearchParams(location.search);
  let ev = null, tab = params.get("tab") || null, myTeam = params.get("team") || (() => { try { return localStorage.getItem("lc_team") || ""; } catch (e) { return ""; } })();
  const teamOf = (n) => (ev.teams || []).find((t) => t.number === n) || {};
  const tname = (n) => teamOf(n).name || "";

  function matchCard(m) {
    const mine = myTeam && [m.red1, m.red2, m.blue1, m.blue2].includes(myTeam);
    const tm = (n) => n ? `<span class="${n === myTeam ? "me" : ""}">${esc(n)}</span>` : "";
    const al = (a) => `<div class="al ${a === "red" ? "r" : "b"}">${tm(m[a + "1"])}${m[a + "2"] ? " & " + tm(m[a + "2"]) : ""}${m.kind === "elim" && m[a + "_alliance"] ? ` <small>Alliance ${m[a + "_alliance"]}</small>` : `<small>${esc([tname(m[a + "1"]), tname(m[a + "2"])].filter(Boolean).join(" & "))}</small>`}</div>`;
    let sc;
    if (m.status === "final") sc = `<div class="sc"><span class="r ${m.winner === "red" ? "w" : ""}">${m.red_score}</span><span class="dash">–</span><span class="b ${m.winner === "blue" ? "w" : ""}">${m.blue_score}</span></div>`;
    else if (m.status === "review") sc = `<div class="sc pend">Score<br>coming</div>`;
    else sc = `<div class="sc pend">${esc(m.scheduled ? fmtTime(m.scheduled) : "")}</div>`;
    const bd = m.status === "final" && m.red_bd ? (() => {
      const pen = m.red_bd.penalty_mode === "award" ? ["Opponent penalties", "penalty_awarded"] : ["Penalties", "penalties"];
      const rows = [["Autonomous balls", "auto_balls"], ["Autonomous Jump Circle", "auto_circle"], ["Teleop balls", "teleop_balls"], ["Teleop Jump Circle", "teleop_circle"], pen];
      return `<div class="bd">${rows.map(([l, k]) => `<span class="r">${m.red_bd[k] ?? 0}</span><span class="l">${l}</span><span class="b">${m.blue_bd[k] ?? 0}</span>`).join("")}</div>`;
    })() : "";
    const lab = `<div class="lab">${esc(m.label)}<small>${{ practice: "Practice", qual: "Qualification", elim: "Elimination" }[m.kind] || ""}</small></div>`;
    return bd ? `<details class="m ${mine ? "mine" : ""}"><summary>${lab}${al("red")}${sc}${al("blue")}</summary>${bd}</details>`
      : `<div class="m ${mine ? "mine" : ""}"><div class="sum">${lab}${al("red")}${sc}${al("blue")}</div></div>`;
  }

  function rankingsTable(list, stage) {
    if (!list.length) return '<div class="empty">Rankings appear after the first match is played.</div>';
    return `<div class="tablebox"><table class="rk"><tr><th>Rank</th><th>Team</th><th title="Ranking score">RS</th><th>W-L-T</th><th class="hide-sm">Auto</th><th class="hide-sm">Circle</th><th class="hide-sm">Teleop</th></tr>
      ${list.map((r) => `<tr class="${r.rank <= 3 ? "top3" : ""} ${r.team === myTeam ? "mine" : ""}"><td class="rank">${r.rank}</td><td><span class="t">${esc(r.team)}</span><span class="n">${esc(r.name)}</span></td>
        <td class="rs">${r.rs}</td><td>${r.wins}-${r.losses}-${r.ties}</td><td class="hide-sm">${r.auto}</td><td class="hide-sm">${r.circle}</td><td class="hide-sm">${r.teleop}</td></tr>`).join("")}
      </table></div><p class="note">${stage === "practice" ? "Practice rankings (practice matches don't count toward the official rankings). " : ""}Ranked by Ranking Score (2 for a win, 1 for a tie), then autonomous points, Jump Circle points and teleop points.</p>`;
  }

  function bracketHTML(b) {
    const card = (s) => {
      const row = (w) => {
        const seed = s[w + "_seed"], teams = s[w + "_teams"];
        if (seed === null || seed === undefined) return '<div class="row"><span class="muted">To be decided</span></div>';
        if (seed === 0) return '<div class="row"><span class="muted">Bye</span></div>';
        const win = s.done && s.winner === seed, lose = s.done && s.winner !== seed && s.winner !== null;
        const wins = s.best_of === 3 || s.reset ? `<b>${(s.wins || {})[String(seed)] || 0}</b>` : "";
        return `<div class="row ${win ? "win" : ""} ${lose ? "lose" : ""}"><span><span class="sd">#${seed}</span>${esc((teams || []).filter(Boolean).join(" & "))}</span>${wins}</div>`;
      };
      return `<div class="bk-s">${row("a")}${row("b")}${s.best_of === 3 ? '<div class="cap">Best of three</div>' : s.reset ? '<div class="cap">Bracket reset if needed</div>' : ""}</div>`;
    };
    const side = (key, title) => {
      const ss = b.series.filter((s) => s.side === key);
      if (!ss.length) return "";
      const rounds = [...new Set(ss.map((s) => s.label))];
      return `<div class="bk-side"><h3>${title}</h3><div class="bk">${rounds.map((r) => `<div class="bk-col"><h4>${esc(r)}</h4>${ss.filter((s) => s.label === r).map(card).join("")}</div>`).join("")}</div></div>`;
    };
    return b.format === "single" ? side("W", "Playoff bracket") + side("F", "Final")
      : side("W", "Winners bracket") + side("L", "Elimination bracket") + side("F", "Grand Final");
  }

  const TABS = {
    results: ["Results", () => {
      const done = ev.matches.filter((m) => m.status !== "scheduled").slice().reverse();
      return done.length ? `<div class="mlist">${done.map(matchCard).join("")}</div><p class="note">Tap a match for the score breakdown.</p>` : '<div class="empty">No results yet. Check back after the first match.</div>';
    }],
    rankings: ["Rankings", () => {
      const q = ev.rankings.qual || [], p = ev.rankings.practice || [];
      return q.length ? rankingsTable(q, "qual") : rankingsTable(p, "practice");
    }],
    schedule: ["Schedule", () => {
      const up = ev.matches.filter((m) => m.status === "scheduled");
      return up.length ? `<div class="mlist">${up.map(matchCard).join("")}</div>` : '<div class="empty">Every scheduled match has been played.</div>';
    }],
    elims: ["Eliminations", () => {
      let h = "";
      if (ev.alliances.length) h += `<div class="alls">${ev.alliances.map((a) => `<div><b>Alliance ${a.seed}</b>${esc(a.captain)} ${esc(tname(a.captain))}<br>${a.partner ? `${esc(a.partner)} ${esc(tname(a.partner))}` : ""}</div>`).join("")}</div>`;
      if (ev.bracket) h += bracketHTML(ev.bracket);
      return h || '<div class="empty">Eliminations haven\'t started yet.</div>';
    }],
    awards: ["Awards", () => ev.awards.length ? `<div class="aw">${ev.awards.map((a) => `<div class="brick studs"><span class="ic">${TROPHY}</span><h3>${esc(a.name)}</h3>${a.description ? `<p>${esc(a.description)}</p>` : ""}
        ${a.winners.map((w) => `<div class="w">${w.team ? `<b>${esc(w.team)}</b>${esc(w.name)}` : `<b>${esc(w.name)}</b>`}${w.school ? ` <span class="muted">· ${esc(w.school)}</span>` : ""}</div>`).join("")}</div>`).join("")}</div>`
      : '<div class="empty">Awards are posted here once they\'ve been presented.</div>'],
    teams: ["Teams", () => `<div class="teams">${ev.teams.map((t) => `<button data-team="${esc(t.number)}"><b>${esc(t.number)}</b>${esc(t.name)}<small>${esc([t.school, t.city].filter(Boolean).join(", "))}</small></button>`).join("")}</div>`],
  };
  function available() {
    return Object.keys(TABS).filter((k) => {
      if (k === "results") return true;
      if (k === "schedule") return ev.matches.some((m) => m.status === "scheduled");
      if (k === "elims") return ev.alliances.length || ev.bracket;
      if (k === "awards") return ev.awards.length;
      if (k === "rankings") return (ev.rankings.qual || []).length || (ev.rankings.practice || []).length;
      return ev.teams.length;
    });
  }
  function drawTabs() {
    const av = available();
    if (!tab || !av.includes(tab)) tab = ev.status === "final" && ev.awards.length ? "awards" : (ev.rankings.qual || []).length ? "rankings" : "results";
    if (!av.includes(tab)) tab = av[0];
    $("#tabs").innerHTML = av.map((k) => `<button role="tab" class="${k === tab ? "on" : ""}" data-tab="${k}">${TABS[k][0]}</button>`).join("");
    $$("#tabs button").forEach((b) => (b.onclick = () => { tab = b.dataset.tab; drawTabs(); }));
    $("#panel").innerHTML = TABS[tab][1]();
    $$("#panel [data-team]").forEach((b) => (b.onclick = () => pickTeam(b.dataset.team)));
  }

  function teamCard() {
    if (!myTeam || !teamOf(myTeam).number) { $("#teamcard").innerHTML = ""; return; }
    const t = teamOf(myTeam);
    const r = (ev.rankings.qual || []).find((x) => x.team === myTeam) || (ev.rankings.practice || []).find((x) => x.team === myTeam);
    const al = ev.alliances.find((a) => a.captain === myTeam || a.partner === myTeam);
    const ms = ev.matches.filter((m) => [m.red1, m.red2, m.blue1, m.blue2].includes(myTeam));
    const next = ms.find((m) => m.status === "scheduled");
    const awards = ev.awards.filter((a) => a.winners.some((w) => w.team === myTeam));
    $("#teamcard").innerHTML = `<section class="brick studs cyan teamcard"><div class="tc-h"><div><div class="num">${esc(t.number)}</div><h2>${esc(t.name)}</h2><div>${esc([t.school, t.city].filter(Boolean).join(", "))}</div></div>
        <button class="close" id="tc-close">Close</button></div>
      <div class="stats">${r ? `<div><b>#${r.rank}</b><small>Rank</small></div><div><b>${r.wins}-${r.losses}-${r.ties}</b><small>Record</small></div><div><b>${r.rs}</b><small>Ranking score</small></div>` : ""}
        ${al ? `<div><b>Alliance ${al.seed}</b><small>${al.captain === myTeam ? "Captain" : "First pick"}</small></div>` : ""}
        ${next ? `<div><b>${esc(next.label)}</b><small>Next match${next.scheduled ? " · " + fmtTime(next.scheduled) : ""}</small></div>` : ""}</div>
      ${awards.length ? `<p style="margin:12px 0 0;font-weight:800">🏆 ${awards.map((a) => esc(a.name)).join(", ")}</p>` : ""}</section>
      ${ms.length ? `<div class="mlist">${ms.map(matchCard).join("")}</div>` : ""}`;
    $("#tc-close").onclick = () => pickTeam("");
  }
  function pickTeam(n) {
    myTeam = n;
    try { n ? localStorage.setItem("lc_team", n) : localStorage.removeItem("lc_team"); } catch (e) {}
    $("#find").value = n ? `${n} ${tname(n)}` : "";
    $("#sugg").classList.add("hidden");
    teamCard(); drawTabs();
    if (n) $("#teamcard").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function wireSearch() {
    const inp = $("#find"), box = $("#sugg");
    inp.oninput = () => {
      const q = inp.value.trim().toLowerCase();
      const hits = q ? ev.teams.filter((t) => t.number.toLowerCase().startsWith(q) || (t.name || "").toLowerCase().includes(q) || (t.school || "").toLowerCase().includes(q)).slice(0, 8) : [];
      box.innerHTML = hits.map((t) => `<button data-t="${esc(t.number)}"><b>${esc(t.number)}</b>${esc(t.name)}</button>`).join("");
      box.classList.toggle("hidden", !hits.length);
      $$("[data-t]", box).forEach((b) => (b.onclick = () => pickTeam(b.dataset.t)));
    };
    inp.onkeydown = (e) => { if (e.key === "Enter") { const b = $("[data-t]", box); if (b) b.click(); } };
  }

  async function eventPage() {
    const slug = params.get("e");
    if (!slug) { location.href = "./"; return; }
    try { ev = await get(`data/events/${encodeURIComponent(slug)}.json`); }
    catch (e) { $("#ev-head").innerHTML = '<h1>Event not found</h1><p class="muted">It may not have been published yet.</p>'; return; }
    try { const idx = await get("data/index.json"); if (idx.site && idx.site.title) $("#site-title").textContent = idx.site.title; } catch (e) {}
    document.title = `${ev.name} · Results`;
    const [cls, txt] = STATUS[ev.status] || STATUS.upcoming;
    $("#ev-head").innerHTML = `<h1>${esc(ev.name)}</h1>
      <div class="ev-meta"><span class="chip ${cls}">${txt}</span><span>${esc(fmtDate(ev.date))}</span><span>${ev.counts.teams} teams</span><span>${ev.counts.played} matches played</span></div>
      <div class="ev-actions">${ev.stream_url && ev.status === "live" ? `<a class="btn live" href="#stream">Watch live</a>` : ""}</div>`;
    $("#nav-live").classList.toggle("hidden", !(ev.stream_url && ev.status === "live"));
    if (!$("#stream").dataset.url || $("#stream").dataset.url !== ev.stream_url) {      // don't reload a playing video on refresh
      $("#stream").dataset.url = ev.stream_url || "";
      $("#stream").innerHTML = streamBlock(ev.stream_url, ev.status === "live", ev.status === "final");
    }
    const f = ev.on_field;
    $("#onfield").innerHTML = f && ev.status === "live" ? `<div class="brick studs red onfield"><b>On the field: ${esc(f.label)}</b>
      <div class="vs"><span class="r">${esc(f.red.filter(Boolean).join(" & "))}</span>vs<span class="b">${esc(f.blue.filter(Boolean).join(" & "))}</span></div></div>` : "";
    $("#champion").innerHTML = ev.champion ? `<div class="brick studs cyan champion"><h2>🏆 Tournament Champions</h2><p>Alliance ${ev.champion.seed}: ${esc((ev.champion.teams || []).filter(Boolean).map((t) => `${t} ${tname(t)}`).join(" & "))}</p></div>` : "";
    $("#updated").textContent = `Updated ${fmtTime(ev.updated)}${ev.status === "live" ? ". This page refreshes by itself." : "."}`;
    teamCard(); drawTabs();
    if (ev.status === "live") setTimeout(eventPage, 30000);
  }

  if (document.body.dataset.page === "home") home();
  else { eventPage().then(() => { if (ev) wireSearch(); }); }
})();
