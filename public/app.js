// 前台首頁：載入活動清單（報名走 /signup 問卷頁）
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/* Lucide inline icons（動態內容用） */
const ICON_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICON_PATHS = {
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  "map-pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  "id-card":
    '<path d="M16 10h2"/><path d="M16 14h2"/><path d="M6.17 15a3 3 0 0 1 5.66 0"/><circle cx="9" cy="11" r="2"/><rect x="2" y="5" width="20" height="14" rx="2"/>',
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

const renderEvents = (events) => {
  const list = document.getElementById("event-list");
  list.textContent = "";

  if (!events.length) {
    list.appendChild(el("p", "event-empty", "下一場正在籌備中！先到下面留個資料，開團第一個通知你。"));
    return;
  }

  events.forEach((ev) => {
    const { md, w } = fmtDate(ev.date);
    const left = ev.capacity ? Math.max(0, ev.capacity - (ev.signedUp || 0)) : null;
    const isFull = ev.status === "closed" || (left !== null && left <= 0);

    const card = el("div", "event-card");

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
    meta.appendChild(el("span", "blur-text", "台中市西屯區某某街00巷0號"));
    meta.appendChild(document.createTextNode(" "));
    meta.appendChild(el("span", "unlock-note", "詳細地點報名後解鎖"));
    info.appendChild(meta);
    if (ev.note) info.appendChild(el("p", "event-note", ev.note));
    card.appendChild(info);

    const side = el("div", "event-side");
    const slots = el(
      "span",
      "event-slots" + (isFull ? " full" : ""),
      isFull ? "已滿團" : left !== null ? `剩 ${left} 個名額` : "開放報名中"
    );
    side.appendChild(slots);
    if (!isFull) {
      const btn = el("a", "btn btn-primary", "報名這場");
      btn.href = "/signup?event=" + encodeURIComponent(ev.id);
      side.appendChild(btn);
    }
    card.appendChild(side);
    list.appendChild(card);
  });
};

const loadEvents = async () => {
  const list = document.getElementById("event-list");
  try {
    const res = await fetch("/api/events");
    const data = await res.json();
    renderEvents(data.events || []);
  } catch (err) {
    list.textContent = "";
    list.appendChild(el("p", "event-empty", "活動載入失敗，重新整理一下試試"));
  }
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

loadEvents();
loadWall();
