// 前台首頁：月曆 + 活動清單（即將/歷史）+ Chill 友牆 + hero 影片聲音
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/* Lucide inline icons（動態內容用） */
const ICON_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICON_PATHS = {
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  "map-pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  "id-card":
    '<path d="M16 10h2"/><path d="M16 14h2"/><path d="M6.17 15a3 3 0 0 1 5.66 0"/><circle cx="9" cy="11" r="2"/><rect x="2" y="5" width="20" height="14" rx="2"/>',
  "volume-2":
    '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  "volume-x":
    '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
};
const iconEl = (name, size) => {
  const span = document.createElement("span");
  span.className = "icon";
  span.innerHTML = `<svg ${ICON_ATTRS} width="${size}" height="${size}">${ICON_PATHS[name]}</svg>`;
  return span;
};

const fmtDate = (iso) => {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return { md: iso, w: "" };
  return { md: `${d.getMonth() + 1}/${d.getDate()}`, w: `週${WEEKDAYS[d.getDay()]}` };
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/* ---------- 活動清單 ---------- */

let allEvents = [];

// 過往場次：純文字時間軸樣式（跟現役活動卡明顯區隔，避免誤會還能報名）
const buildHistoryRow = (ev) => {
  const { md, w } = fmtDate(ev.date);
  const row = el("div", "history-row");
  row.id = "event-card-" + ev.id;
  const head = el("p", "history-head");
  head.appendChild(el("span", "history-date", `${md}（${w}）`));
  head.appendChild(document.createTextNode(" " + ev.title));
  head.appendChild(el("span", "history-done", "圓滿結束"));
  row.appendChild(head);
  if (ev.location) row.appendChild(el("p", "history-loc", ev.location));
  if (ev.note) row.appendChild(el("p", "history-recap", ev.note));
  return row;
};

const buildEventCard = (ev, full) => {
  const { md, w } = fmtDate(ev.date);
  const left = ev.left != null ? ev.left : (!ev.hideCount && ev.capacity ? Math.max(0, ev.capacity - (ev.signedUp || 0)) : null);
  const isFull = ev.status === "closed" || (left !== null && left <= 0);

  const card = el("div", "event-card" + (ev.past ? " event-past" : "") + (full ? " event-full" : ""));
  card.id = (full ? "full-event-card-" : "event-card-") + ev.id;

  const dateBox = el("div", "event-date");
  dateBox.appendChild(el("span", "d", md));
  dateBox.appendChild(el("span", "w", w));
  card.appendChild(dateBox);

  const info = el("div", "event-info");
  info.appendChild(el("h3", null, ev.title));
  const meta = el("p", "event-meta");
  meta.appendChild(iconEl("clock", 14));
  meta.appendChild(document.createTextNode(" " + (ev.time || "") + (ev.past ? "" : `　報名費 $${ev.fee != null ? ev.fee : 50}`)));
  meta.appendChild(document.createTextNode("　"));
  meta.appendChild(iconEl("map-pin", 14));
  meta.appendChild(document.createTextNode(" "));
  if (ev.location) {
    if (ev.mapUrl && !ev.past) {
      const a = el("a", "event-map-link", ev.location);
      a.href = ev.mapUrl;
      a.target = "_blank";
      a.rel = "noopener";
      meta.appendChild(a);
    } else {
      meta.appendChild(document.createTextNode(ev.location));
    }
  } else if (!ev.past) {
    meta.appendChild(el("span", "unlock-note", "詳細地點報名後解鎖"));
  }
  info.appendChild(meta);
  if (full && ev.feeNote) info.appendChild(el("p", "event-feenote", ev.feeNote));
  // 完整版顯示流程文案；hero 緊湊版收起（.hero-events CSS 也會隱藏保險）
  if (ev.note && (full || ev.past)) info.appendChild(el("p", "event-note", ev.note));
  card.appendChild(info);

  const side = el("div", "event-side");
  if (ev.past) {
    side.appendChild(el("span", "event-slots done", "圓滿結束"));
  } else {
    if (ev.buyoutMode) {
      // 包場挑戰：成行基準已過，翻轉成集體解鎖敘事
      const b = ev.buyoutMode;
      const box = el("div", "buyout-box");
      box.appendChild(
        el("span", "buyout-text", b.reached ? "包場達成！剩最後幾個位子" : `已揪 ${b.signed} 人，再 ${b.goal - b.signed} 人包下整場！`)
      );
      const bar = el("div", "buyout-bar");
      const fill = el("i", "buyout-fill");
      fill.style.width = Math.min(100, Math.round((b.signed / b.goal) * 100)) + "%";
      bar.appendChild(fill);
      box.appendChild(bar);
      side.appendChild(box);
    } else {
      side.appendChild(
        el("span", "event-slots" + (isFull ? " full" : ""), isFull ? ev.fullText || "已滿團" : left !== null ? `剩 ${left} 個名額` : "開放報名中")
      );
    }
    if (!isFull) {
      const btn = el("a", "btn btn-primary", "報名這場");
      btn.href = "/signup?event=" + encodeURIComponent(ev.id);
      btn.setAttribute("data-track-cta", "signup-" + ev.id);
      side.appendChild(btn);
    }
  }
  card.appendChild(side);
  return card;
};

const renderEvents = (events) => {
  const list = document.getElementById("event-list");
  list.textContent = "";

  const upcoming = events.filter((e) => !e.past);
  const past = events.filter((e) => e.past).slice().reverse();

  if (!upcoming.length) {
    list.appendChild(el("p", "event-empty", "下一場正在籌備中！先報名加入名單，開團第一個通知你。"));
  } else {
    upcoming.forEach((ev) => list.appendChild(buildEventCard(ev)));
  }

  // 右側面板：預設置頂今天的場（沒有就下一場），日曆 hover 會切換
  renderEventPanel(null);

  // 過往小聚（有資料才顯示）
  const historyWrap = document.getElementById("history-wrap");
  const historyList = document.getElementById("history-list");
  if (historyWrap && historyList && past.length) {
    historyList.textContent = "";
    const wrap = el("div", "history-list");
    past.forEach((ev) => wrap.appendChild(buildHistoryRow(ev)));
    historyList.appendChild(wrap);
    historyWrap.hidden = false;
  }
};

const loadEvents = async () => {
  const list = document.getElementById("event-list");
  try {
    const res = await fetch("/api/events");
    const data = await res.json();
    allEvents = data.events || [];
    renderEvents(allEvents);
    renderCalendar();
  } catch (err) {
    list.textContent = "";
    list.appendChild(el("p", "event-empty", "活動載入失敗，重新整理一下試試"));
  }
};

/* ---------- 下方活動面板（左日曆右內容） ---------- */

const todayIsoStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// dateIso = null → 預設（今天有場次就置頂今天，否則下一場）
const renderEventPanel = (dateIso) => {
  const head = document.getElementById("event-panel-head");
  const list = document.getElementById("full-event-list");
  if (!head || !list) return;
  const tIso = todayIsoStr();
  let shown = [];
  if (dateIso) {
    shown = allEvents.filter((e) => e.date === dateIso);
    const d = new Date(dateIso + "T00:00:00");
    head.textContent = `${d.getMonth() + 1}/${d.getDate()}（週${WEEKDAYS[d.getDay()]}）的場次`;
  } else {
    const todays = allEvents.filter((e) => e.date === tIso && !e.past);
    if (todays.length) {
      shown = todays;
      head.textContent = "今天的場次";
    } else {
      const upcoming = allEvents.filter((e) => !e.past);
      shown = upcoming.slice(0, 2);
      head.textContent = shown.length ? "下一場" : "";
    }
  }
  list.textContent = "";
  if (!shown.length) {
    list.appendChild(el("p", "event-empty", "下一場正在籌備中！先報名加入名單，開團第一個通知你。"));
    return;
  }
  shown.forEach((ev) => {
    const card = buildEventCard(ev, true);
    if (ev.past) card.classList.add("event-past");
    list.appendChild(card);
  });
};

/* ---------- 月曆（工廠：hero 與下方各一座） ---------- */

const today = new Date();

const flashTo = (elId) => {
  const card = document.getElementById(elId);
  if (!card) return false;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.remove("flash");
  void card.offsetWidth;
  card.classList.add("flash");
  return true;
};

/* 日曆 hover 浮卡：共用一張，跟著游標所在的日期格定位 */
let calPop = null;
const getCalPop = () => {
  if (!calPop) {
    calPop = el("div", "cal-pop");
    calPop.hidden = true;
    document.body.appendChild(calPop);
  }
  return calPop;
};

const showCalPop = (cell, dayEvents) => {
  const pop = getCalPop();
  pop.textContent = "";
  dayEvents.forEach((ev) => {
    const item = el("div", "cal-pop-item");
    item.appendChild(el("p", "cal-pop-title", ev.title));
    const meta = el("p", "cal-pop-meta", (ev.time || "") + (ev.location ? "｜" + ev.location : ""));
    item.appendChild(meta);
    item.appendChild(
      el("p", "cal-pop-state" + (ev.past ? " done" : ""), ev.past ? "圓滿結束 ✓" : ev.status === "closed" ? (ev.fullText || "已滿團") : ev.buyoutMode ? (ev.buyoutMode.reached ? "包場達成！剩最後幾位" : `已揪 ${ev.buyoutMode.signed} 人・包場倒數 ${ev.buyoutMode.goal - ev.buyoutMode.signed} 人`) : ev.left != null ? `開放報名中・剩 ${ev.left} 名額` : "開放報名中")
    );
    pop.appendChild(item);
  });
  pop.appendChild(el("p", "cal-pop-hint", "點日期看完整介紹"));
  pop.hidden = false;
  const r = cell.getBoundingClientRect();
  const popW = 260;
  let left = r.left + window.scrollX + r.width / 2 - popW / 2;
  left = Math.max(8, Math.min(left, window.scrollX + document.documentElement.clientWidth - popW - 8));
  pop.style.left = left + "px";
  pop.style.top = r.bottom + window.scrollY + 8 + "px";
};

const hideCalPop = () => {
  if (calPop) calPop.hidden = true;
};

const makeCalendar = ({ titleId, gridId, prevId, nextId, onPick, onHover, onLeave }) => {
  let y = today.getFullYear();
  let m = today.getMonth();

  const render = () => {
    const grid = document.getElementById(gridId);
    const title = document.getElementById(titleId);
    if (!grid || !title) return;
    title.textContent = `${y} 年 ${m + 1} 月`;
    grid.textContent = "";
    WEEKDAYS.forEach((w) => grid.appendChild(el("span", "cal-dow", w)));
    const first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    for (let i = 0; i < first.getDay(); i++) grid.appendChild(el("span", "cal-day cal-empty"));
    const byDate = {};
    allEvents.forEach((ev) => {
      (byDate[ev.date] = byDate[ev.date] || []).push(ev);
    });
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayEvents = byDate[iso] || [];
      const cell = el("span", "cal-day", String(d));
      if (d === today.getDate() && m === today.getMonth() && y === today.getFullYear()) cell.classList.add("today");
      if (dayEvents.length) {
        cell.classList.add("has-event");
        if (dayEvents.every((e) => e.past)) cell.classList.add("was-event");
        cell.appendChild(el("i", "cal-dot"));
        cell.addEventListener("click", () => { hideCalPop(); onPick(dayEvents[0]); });
        cell.addEventListener("mouseenter", () => (onHover ? onHover(iso) : showCalPop(cell, dayEvents)));
        cell.addEventListener("mouseleave", () => (onLeave ? onLeave() : hideCalPop()));
      }
      grid.appendChild(cell);
    }
  };

  const prev = document.getElementById(prevId);
  const next = document.getElementById(nextId);
  if (prev) prev.addEventListener("click", () => { m -= 1; if (m < 0) { m = 11; y -= 1; } render(); });
  if (next) next.addEventListener("click", () => { m += 1; if (m > 11) { m = 0; y += 1; } render(); });
  return render;
};

const renderHeroCal = makeCalendar({
  titleId: "cal-title", gridId: "cal-grid", prevId: "cal-prev", nextId: "cal-next",
  onPick: (ev) => flashTo("event-card-" + ev.id) || flashTo("full-event-card-" + ev.id),
});
// 下方日曆：hover 直接切右側面板內容；點=釘選該天；移開回到預設（今天/下一場）
let panelPinned = null;
const renderLowerCal = makeCalendar({
  titleId: "cal2-title", gridId: "cal2-grid", prevId: "cal2-prev", nextId: "cal2-next",
  onPick: (ev) => { panelPinned = panelPinned === ev.date ? null : ev.date; renderEventPanel(panelPinned); },
  onHover: (iso) => renderEventPanel(iso),
  onLeave: () => renderEventPanel(panelPinned),
});

const renderCalendar = () => { renderHeroCal(); renderLowerCal(); };
const bindCalendarNav = () => {};

/* ---------- 跟著影片學英文（reelscript 音檔 + 同步逐字稿） ---------- */

const renderReel = (data) => {
  const video = document.getElementById("reel-video");
  const segsBox = document.getElementById("reel-segs");
  if (!video) return;

  video.pause();
  video.src = data.videoUrl || data.audioUrl;
  if (data.thumbnail) video.poster = data.thumbnail;

  document.getElementById("reel-title").textContent = data.title || "";
  document.getElementById("reel-channel").textContent = data.channel ? "@" + data.channel : "";
  document.getElementById("reel-watch").href = data.base + "/watch/" + encodeURIComponent(data.videoId);
  bindReelLearn(data);
  document.getElementById("reel-count").textContent = data.segments.length ? data.segments.length + " 段" : "";

  segsBox.textContent = "";
  const rows = data.segments.map((seg) => {
    const row = el("div", "reel-seg");
    row.appendChild(el("span", "reel-seg-time", (Math.floor(seg.start / 60)) + ":" + String(Math.floor(seg.start % 60)).padStart(2, "0")));
    const txt = el("div", "reel-seg-text");
    txt.appendChild(el("p", "reel-en", seg.en || ""));
    if (seg.zh) txt.appendChild(el("p", "reel-zh", seg.zh));
    row.appendChild(txt);
    row.addEventListener("click", () => {
      video.currentTime = seg.start;
      video.play().catch(() => {});
    });
    segsBox.appendChild(row);
    return { row, seg };
  });

  // 播到哪句亮哪句（淡底色）＋自動捲到當前句
  video.ontimeupdate = () => {
    const t = video.currentTime;
    let active = null;
    rows.forEach(({ row, seg }) => {
      const on = t >= seg.start && t < seg.end;
      row.classList.toggle("on", on);
      if (on) active = row;
    });
    if (active && !video.paused) active.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
};

// 學習模式大按鈕：wemeet 已登入 → SSO 帶帳號直達 reelscript；未登入 → 直接去註冊
const REELSCRIPT_APP_ID = "app_3lXIxPKb";
const LMU_ORIGIN = "https://letmeuse.isnowfriend.com";
const bindReelLearn = (data) => {
  const btn = document.getElementById("reel-learn");
  if (!btn) return;
  const watchPath = "/watch/" + encodeURIComponent(data.videoId);
  btn.href = data.base + watchPath;
  btn.onclick = async (e) => {
    const sdk = window.letmeuse;
    if (!sdk || !sdk.user) return; // 未登入照普通連結走（去 reelscript 註冊）
    e.preventDefault();
    try {
      const res = await fetch(LMU_ORIGIN + "/api/auth/sso/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + sdk.getToken() },
        body: JSON.stringify({ targetAppId: REELSCRIPT_APP_ID }),
      });
      const json = await res.json();
      const code = (json.data || json).code;
      if (res.ok && code) {
        window.open(data.base + "/sso.html#code=" + encodeURIComponent(code) + "&next=" + encodeURIComponent(watchPath), "_blank", "noopener");
        return;
      }
    } catch (err) {}
    window.open(data.base + watchPath, "_blank", "noopener");
  };
};

const loadReel = async () => {
  const section = document.getElementById("icebreaker");
  try {
    const res = await fetch("/api/reelplay");
    if (!res.ok) throw new Error("bad status");
    const data = await res.json();
    if (!data.audioUrl || !(data.segments || []).length) throw new Error("empty");
    renderReel(data);
  } catch (err) {
    if (section) section.hidden = true; // 上游掛了整區收起，不留破版
  }
};

const bindReel = () => {
  const btn = document.getElementById("reel-next");
  if (btn) btn.addEventListener("click", loadReel);
};

/* ---------- Chill 友牆 ---------- */

const renderWall = (wall) => {
  const grid = document.getElementById("wall-list");
  grid.textContent = "";

  wall.forEach((m) => {
    const card = el("a", "wall-card");
    card.href = m.quickkyUrl;
    card.target = "_blank";
    card.rel = "noopener";
    if (m.avatarUrl) {
      const avatar = el("img", "wall-photo");
      avatar.src = m.avatarUrl;
      avatar.alt = m.nickname || "";
      avatar.loading = "lazy";
      card.appendChild(avatar);
    } else {
      card.appendChild(el("div", "wall-photo wall-photo-blank", (m.nickname || "?").slice(0, 1)));
    }
    const body = el("div", "wall-body");
    body.appendChild(el("h3", null, m.nickname || "Chill 友"));
    if (m.bio) body.appendChild(el("p", "wall-bio", m.bio));
    card.appendChild(body);
    grid.appendChild(card);
  });

  // 最後一格永遠是邀請卡：卡少時是招募入口，卡多時是加入牆上的入口
  const cta = el("a", "wall-card wall-card-cta");
  cta.href = "/me";
  const ctaBody = el("div", "wall-cta-body");
  ctaBody.appendChild(iconEl("id-card", 30));
  ctaBody.appendChild(el("h3", null, wall.length ? "你也上牆" : "成為第一張卡"));
  ctaBody.appendChild(el("p", "wall-bio", "建立你的 Quickky 名片卡"));
  cta.appendChild(ctaBody);
  grid.appendChild(cta);
};

const loadWall = async () => {
  try {
    const res = await fetch("/api/wall");
    const data = await res.json();
    renderWall(data.wall || []);
  } catch (err) {
    renderWall([]);
  }
};

/* ---------- hero 影片聲音開關（自動播放必須靜音，點一下開聲） ---------- */

const bindHeroSound = () => {
  const video = document.querySelector(".hero-video");
  const btn = document.getElementById("video-sound");
  if (!video || !btn) return;

  const renderBtn = () => {
    btn.innerHTML = video.muted
      ? `<svg ${ICON_ATTRS} width="18" height="18">${ICON_PATHS["volume-x"]}</svg><span>開聲音</span>`
      : `<svg ${ICON_ATTRS} width="18" height="18">${ICON_PATHS["volume-2"]}</svg>`;
  };
  const toggle = () => {
    video.muted = !video.muted;
    if (!video.muted) video.play().catch(() => {});
    renderBtn();
  };
  btn.addEventListener("click", toggle);
  video.addEventListener("click", toggle);
  renderBtn();
};

/* ---------- 會員心得語音條（真實波形 + 點擊跳轉） ---------- */

const VOICE_PLAY_ICON = `<svg ${ICON_ATTRS} width="22" height="22" style="margin-left:3px" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
const VOICE_PAUSE_ICON = `<svg ${ICON_ATTRS} width="22" height="22" fill="currentColor"><rect x="5" y="4" width="4.5" height="16" rx="1.5"/><rect x="14.5" y="4" width="4.5" height="16" rx="1.5"/></svg>`;
const voiceAudios = [];

const initVoiceCard = (card) => {
  const src = card.dataset.src;
  // data-avatar 有給就在標註前顯示頭貼（心得主本人的臉）
  if (card.dataset.avatar) {
    const img = document.createElement("img");
    img.className = "voice-avatar";
    img.src = card.dataset.avatar;
    img.alt = "";
    img.loading = "lazy";
    const body = card.querySelector(".voice-body");
    card.insertBefore(img, body);
    card.classList.add("has-avatar");
  }
  const btn = card.querySelector(".voice-play");
  const wave = card.querySelector(".voice-wave");
  const curEl = card.querySelector(".voice-cur");
  const durEl = card.querySelector(".voice-total");
  if (!src || !btn || !wave) return;

  const audio = new Audio(src);
  audio.preload = "metadata";
  voiceAudios.push(audio);

  // 倍速切換 1x → 1.5x → 2x
  const rateBtn = card.querySelector(".voice-rate");
  if (rateBtn) {
    const RATES = [1, 1.5, 2];
    let rateIdx = 0;
    rateBtn.addEventListener("click", () => {
      rateIdx = (rateIdx + 1) % RATES.length;
      audio.playbackRate = RATES[rateIdx];
      rateBtn.textContent = RATES[rateIdx] + "x";
      rateBtn.classList.toggle("boost", rateIdx > 0);
    });
  }

  const BAR_COUNT = 56;
  let bars = [];

  const drawBars = (peaks) => {
    wave.textContent = "";
    bars = peaks.map((p) => {
      const b = document.createElement("i");
      b.style.height = Math.max(12, Math.round(p * 100)) + "%";
      wave.appendChild(b);
      return b;
    });
  };

  // 先畫假波形墊底，Web Audio 解碼出真實波形後替換
  drawBars(Array.from({ length: BAR_COUNT }, (_, i) => Math.min(0.3 + 0.35 * Math.abs(Math.sin(i * 0.6)) + (i % 6 === 0 ? 0.2 : 0), 1)));

  fetch(src)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      return ctx.decodeAudioData(buf).then((ab) => {
        const data = ab.getChannelData(0);
        const block = Math.floor(data.length / BAR_COUNT);
        const peaks = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          let max = 0;
          for (let j = i * block; j < (i + 1) * block; j += 40) {
            const v = Math.abs(data[j]);
            if (v > max) max = v;
          }
          peaks.push(max);
        }
        const top = Math.max(...peaks) || 1;
        drawBars(peaks.map((p) => Math.max(0.12, p / top)));
        ctx.close();
      });
    })
    .catch(() => {});

  const fmtTime = (s) => {
    if (!Number.isFinite(s)) return "0:00";
    return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  };
  const setBtn = () => { btn.innerHTML = audio.paused ? VOICE_PLAY_ICON : VOICE_PAUSE_ICON; };
  const playSolo = () => {
    voiceAudios.forEach((a) => { if (a !== audio) a.pause(); }); // 同時間只播一段
    audio.play().catch(() => {});
  };

  btn.addEventListener("click", () => (audio.paused ? playSolo() : audio.pause()));
  audio.addEventListener("play", setBtn);
  audio.addEventListener("pause", setBtn);
  audio.addEventListener("ended", () => {
    audio.currentTime = 0;
    setBtn();
  });
  audio.addEventListener("loadedmetadata", () => { durEl.textContent = " / " + fmtTime(audio.duration); });
  audio.addEventListener("timeupdate", () => {
    const ratio = audio.currentTime / (audio.duration || 1);
    bars.forEach((b, i) => b.classList.toggle("played", i / bars.length < ratio));
    curEl.textContent = fmtTime(audio.currentTime);
  });
  wave.addEventListener("click", (e) => {
    if (!audio.duration) return;
    const rect = wave.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
    if (audio.paused) playSolo();
  });
  setBtn();
};

const initVoicePlayer = () => {
  document.querySelectorAll(".voice-card[data-src]").forEach(initVoiceCard);
};

/* ---------- 成長數據（真實資料：AdMan 人氣 + 報名人次 + 場次數） ---------- */

const renderPulse = (d) => {
  const tiles = document.getElementById("pulse-tiles");
  if (!tiles) return;
  tiles.textContent = "";
  const tile = (num, label) => {
    const t = el("div", "pulse-tile");
    t.appendChild(el("div", "pulse-num", String(num)));
    t.appendChild(el("div", "pulse-label", label));
    tiles.appendChild(t);
  };
  if (d.threadsViews) tile(Number(d.threadsViews).toLocaleString("en-US"), "Threads 檢視次數");
  else if (d.views) tile(d.views, "次網站瀏覽");
  tile(d.attendees || 0, "人次報名參加");
  tile(d.eventsHeld || 0, "場小聚圓滿結束");

  // 累積曲線（手繪風：線段重取樣 + 垂直方向抖動，資料點本身不偏移）
  const series = d.series || [];
  const wrap = document.getElementById("pulse-chart-wrap");
  const svg = document.getElementById("pulse-chart");
  if (!wrap || !svg || series.length < 2) return;
  wrap.hidden = false;
  const W = 600, H = 230, PT = 40, PB = 18, PX = 18;
  const maxV = series[series.length - 1].total;
  const x = (i) => PX + (i / (series.length - 1)) * (W - PX * 2);
  const yv = (v) => H - PB - (v / maxV) * (H - PB - PT);
  const anchors = series.map((p, i) => ({ x: x(i), y: yv(p.total) }));
  const wobbly = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const steps = Math.max(4, Math.round(dist / 20));
    const nx = -(b.y - a.y) / dist, ny = (b.x - a.x) / dist;
    for (let sIdx = 0; sIdx < steps; sIdx++) {
      const t = sIdx / steps;
      const raw = Math.sin((i * 13 + sIdx * 7 + 3) * 12.9898) * 43758.5453;
      const jit = sIdx === 0 ? 0 : (raw - Math.floor(raw) - 0.5) * 3.6;
      wobbly.push({ x: a.x + (b.x - a.x) * t + nx * jit, y: a.y + (b.y - a.y) * t + ny * jit });
    }
  }
  wobbly.push(anchors[anchors.length - 1]);
  const path = wobbly.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${path} L${(W - PX).toFixed(1)} ${H - PB} L${PX} ${H - PB} Z`;
  svg.innerHTML =
    `<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="rgba(226,87,43,0.28)"/><stop offset="100%" stop-color="rgba(226,87,43,0)"/></linearGradient></defs>` +
    `<path d="${area}" fill="url(#pg)"/>` +
    `<path d="${path}" fill="none" stroke="#e2572b" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>` +
    anchors.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="#faf3e7" stroke="#e2572b" stroke-width="2.5"/>`).join("") +
    `<text x="${(W - PX - 4).toFixed(1)}" y="${(yv(maxV) - 16).toFixed(1)}" text-anchor="end" font-size="17" font-family="Iansui, sans-serif" fill="#3a2318">${maxV} 人次！</text>`;
};

const loadPulse = async () => {
  try {
    const res = await fetch("/api/pulse");
    if (!res.ok) return;
    renderPulse(await res.json());
  } catch (err) {}
};

loadEvents();
loadWall();
loadPulse();
loadReel();
bindReel();
bindHeroSound();
bindCalendarNav();
initVoicePlayer();
