// 前台首頁：載入活動清單（報名走 /signup 問卷頁）
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

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
    list.appendChild(el("p", "event-empty", "下一場正在籌備中！先到下面留個資料，開團第一個通知你 👇"));
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
    info.appendChild(el("p", "event-meta", `🕐 ${ev.time || ""}　📍 ${ev.location || ""}`));
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
    list.appendChild(el("p", "event-empty", "活動載入失敗，重新整理一下試試 🙏"));
  }
};

loadEvents();
