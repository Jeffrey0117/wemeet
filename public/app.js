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
  head.appendChild(el("span", "history-done", "已結束"));
  row.appendChild(head);
  if (ev.note) row.appendChild(el("p", "history-recap", ev.note));
  return row;
};

const buildEventCard = (ev) => {
  const { md, w } = fmtDate(ev.date);
  const left = ev.left != null ? ev.left : (!ev.hideCount && ev.capacity ? Math.max(0, ev.capacity - (ev.signedUp || 0)) : null);
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
  meta.appendChild(document.createTextNode(" " + (ev.time || "") + (ev.past ? "" : `　報名費 $${ev.fee != null ? ev.fee : 50}`)));
  if (!ev.past) {
    meta.appendChild(document.createTextNode("　"));
    meta.appendChild(iconEl("map-pin", 14));
    meta.appendChild(document.createTextNode(" "));
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
    list.appendChild(el("p", "event-empty", "下一場正在籌備中！先報名加入名單，開團第一個通知你。"));
  } else {
    upcoming.forEach((ev) => list.appendChild(buildEventCard(ev)));
  }

  // 過往小聚：獨立區塊（有資料才顯示）
  const historySection = document.getElementById("events");
  const historyList = document.getElementById("history-list");
  if (historySection && historyList && past.length) {
    historyList.textContent = "";
    const wrap = el("div", "history-list");
    past.forEach((ev) => wrap.appendChild(buildHistoryRow(ev)));
    historyList.appendChild(wrap);
    historySection.hidden = false;
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

loadEvents();
loadWall();
loadReel();
bindReel();
bindHeroSound();
bindCalendarNav();
initVoicePlayer();
