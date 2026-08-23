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

const buildEventCard = (ev) => {
  const { md, w } = fmtDate(ev.date);
  const left = ev.capacity ? Math.max(0, ev.capacity - (ev.signedUp || 0)) : null;
  const isFull = ev.status === "closed" || (left !== null && left <= 0);

  const card = el("div", "event-card" + (ev.past ? " event-past" : ""));
  card.id = "event-card-" + ev.id;

  const dateBox = el("div", "event-date");
  dateBox.appendChild(el("span", "d", md));
  dateBox.appendChild(el("span", "w", w));
  card.appendChild(dateBox);

  const info = el("div", "event-info");
  info.appendChild(el("h3", null, ev.title));
  const meta = el("p", "event-meta");
  meta.appendChild(iconEl("clock", 14));
  meta.appendChild(document.createTextNode(" " + (ev.time || "") + "　"));
  meta.appendChild(iconEl("map-pin", 14));
  meta.appendChild(document.createTextNode(" "));
  if (ev.past) {
    meta.appendChild(document.createTextNode(ev.location || ""));
  } else {
    meta.appendChild(el("span", "blur-text", "台中市西屯區某某街00巷0號"));
    meta.appendChild(document.createTextNode(" "));
    meta.appendChild(el("span", "unlock-note", "詳細地點報名後解鎖"));
  }
  info.appendChild(meta);
  // 過往場次的 note 當「回顧」顯示（在 /admin 補一句當天聊了什麼）
  if (ev.note) info.appendChild(el("p", "event-note", ev.note));
  card.appendChild(info);

  const side = el("div", "event-side");
  if (ev.past) {
    side.appendChild(el("span", "event-slots done", "已結束"));
  } else {
    side.appendChild(
      el("span", "event-slots" + (isFull ? " full" : ""), isFull ? "已滿團" : left !== null ? `剩 ${left} 個名額` : "開放報名中")
    );
    if (!isFull) {
      const btn = el("a", "btn btn-primary", "報名這場");
      btn.href = "/signup?event=" + encodeURIComponent(ev.id);
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
    list.appendChild(el("p", "event-empty", "下一場正在籌備中！先到下面留個資料，開團第一個通知你。"));
  } else {
    upcoming.forEach((ev) => list.appendChild(buildEventCard(ev)));
  }

  if (past.length) {
    list.appendChild(el("h3", "event-history-title", "過往小聚"));
    past.forEach((ev) => list.appendChild(buildEventCard(ev)));
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

/* ---------- 月曆 ---------- */

const today = new Date();
let calYear = today.getFullYear();
let calMonth = today.getMonth(); // 0-based

const jumpToEvent = (ev) => {
  const card = document.getElementById("event-card-" + ev.id);
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.remove("flash");
  void card.offsetWidth; // 重新觸發動畫
  card.classList.add("flash");
};

const renderCalendar = () => {
  const grid = document.getElementById("cal-grid");
  const title = document.getElementById("cal-title");
  if (!grid || !title) return;

  title.textContent = `${calYear} 年 ${calMonth + 1} 月`;
  grid.textContent = "";

  WEEKDAYS.forEach((w) => grid.appendChild(el("span", "cal-dow", w)));

  const first = new Date(calYear, calMonth, 1);
  const days = new Date(calYear, calMonth + 1, 0).getDate();
  for (let i = 0; i < first.getDay(); i++) grid.appendChild(el("span", "cal-day cal-empty"));

  const byDate = {};
  allEvents.forEach((ev) => {
    (byDate[ev.date] = byDate[ev.date] || []).push(ev);
  });

  for (let d = 1; d <= days; d++) {
    const iso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayEvents = byDate[iso] || [];
    const cell = el("span", "cal-day", String(d));
    if (
      d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear()
    ) {
      cell.classList.add("today");
    }
    if (dayEvents.length) {
      cell.classList.add("has-event");
      if (dayEvents.every((e) => e.past)) cell.classList.add("was-event");
      cell.title = dayEvents.map((e) => e.title).join("、");
      cell.appendChild(el("i", "cal-dot"));
      cell.addEventListener("click", () => jumpToEvent(dayEvents[0]));
    }
    grid.appendChild(cell);
  }
};

const bindCalendarNav = () => {
  const prev = document.getElementById("cal-prev");
  const next = document.getElementById("cal-next");
  if (!prev || !next) return;
  prev.addEventListener("click", () => {
    calMonth -= 1;
    if (calMonth < 0) { calMonth = 11; calYear -= 1; }
    renderCalendar();
  });
  next.addEventListener("click", () => {
    calMonth += 1;
    if (calMonth > 11) { calMonth = 0; calYear += 1; }
    renderCalendar();
  });
};

/* ---------- 破冰話題卡（reelscript 內容，導流回 reelscript） ---------- */

const renderIcebreaker = (data) => {
  const deck = document.getElementById("ice-deck");
  if (!deck) return;
  deck.textContent = "";
  const base = data.base || "";
  const watchLink = (videoId, text) => {
    const a = el("a", "ice-src", text + " →");
    if (base && videoId) {
      a.href = base + "/watch/" + encodeURIComponent(videoId);
      a.target = "_blank";
      a.rel = "noopener";
    }
    return a;
  };

  if (data.snippet && data.snippet.en) {
    const s = data.snippet;
    const card = el("div", "ice-card ice-featured");
    card.appendChild(el("p", "ice-en", "“" + s.en + "”"));
    card.appendChild(el("p", "ice-zh", s.zh || ""));
    card.appendChild(watchLink(s.videoId, s.videoTitle ? "出自「" + s.videoTitle + "」" : "看出處影片"));
    deck.appendChild(card);
  }

  const quotes = (data.quotes && data.quotes.quotes) || [];
  quotes.slice(0, 2).forEach((q) => {
    const card = el("div", "ice-card");
    card.appendChild(el("p", "ice-en", "“" + q.en + "”"));
    card.appendChild(el("p", "ice-zh", q.zh || ""));
    card.appendChild(watchLink(q.videoId, q.videoTitle ? "出自「" + q.videoTitle + "」" : "看出處影片"));
    deck.appendChild(card);
  });

  const words = (data.vocabulary && data.vocabulary.words) || [];
  if (words.length) {
    const chips = el("div", "ice-chips");
    words.slice(0, 6).forEach((w) => {
      const chip = el("a", "ice-chip");
      chip.appendChild(el("strong", null, w.word));
      chip.appendChild(document.createTextNode(" " + (w.translation || "")));
      if (base && w.videoId) {
        chip.href = base + "/watch/" + encodeURIComponent(w.videoId);
        chip.target = "_blank";
        chip.rel = "noopener";
      }
      chips.appendChild(chip);
    });
    deck.appendChild(chips);
  }

  const more = document.getElementById("ice-more");
  if (more && base) more.href = base + "/icebreaker";
};

const loadIcebreaker = async () => {
  const section = document.getElementById("icebreaker");
  try {
    const res = await fetch("/api/icebreaker");
    if (!res.ok) throw new Error("bad status");
    const data = await res.json();
    if (!data.snippet && !data.quotes) throw new Error("empty");
    renderIcebreaker(data);
  } catch (err) {
    if (section) section.hidden = true; // 上游掛了就整區收起來，不留破版
  }
};

const bindIcebreaker = () => {
  const btn = document.getElementById("ice-refresh");
  if (btn) btn.addEventListener("click", loadIcebreaker);
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
    let avatar;
    if (m.avatarUrl) {
      avatar = el("img", "wall-avatar");
      avatar.src = m.avatarUrl;
      avatar.alt = m.nickname || "";
      avatar.loading = "lazy";
    } else {
      avatar = el("div", "wall-avatar", (m.nickname || "?").slice(0, 1));
    }
    card.appendChild(avatar);
    card.appendChild(el("h3", null, m.nickname || "Chill 友"));
    if (m.bio) card.appendChild(el("p", "wall-bio", m.bio));
    card.appendChild(el("span", "wall-go", "看卡片 →"));
    grid.appendChild(card);
  });

  // 最後一格永遠是邀請卡：卡少時是招募入口，卡多時是加入牆上的入口
  const cta = el("a", "wall-card wall-card-cta");
  cta.href = "/me";
  const ctaAvatar = el("div", "wall-avatar");
  ctaAvatar.appendChild(iconEl("id-card", 34));
  cta.appendChild(ctaAvatar);
  cta.appendChild(el("h3", null, wall.length ? "你也上牆" : "成為第一張卡"));
  cta.appendChild(el("p", "wall-bio", "建立你的 Quickky 名片卡，讓大家先認識你。"));
  cta.appendChild(el("span", "wall-go", "去建立 →"));
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

loadEvents();
loadWall();
loadIcebreaker();
bindIcebreaker();
bindHeroSound();
bindCalendarNav();
