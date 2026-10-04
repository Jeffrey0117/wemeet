// 活動獨立頁（/e/{id}）：Luma 式版面 — 資料由 server 注入 window.__EVENT__，fallback 打 /api/events
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const $ = (id) => document.getElementById(id);

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const TYPE_INFO = {
  english: { label: "英文口說小聚", grad: ["#e2572b", "#c1622f"] },
  book: { label: "讀書會", grad: ["#7fa98f", "#5d8a72"] },
  biz: { label: "創業小聚", grad: ["#c1622f", "#8a4520"] },
  chat: { label: "聊天小聚", grad: ["#e2572b", "#d98a3d"] },
  drink: { label: "小酌之夜", grad: ["#6b4a38", "#3a2318"] },
};
const typeInfo = (t) => TYPE_INFO[t] || { label: "揪可樂小聚", grad: ["#e2572b", "#c1622f"] };

/* markdown-lite：先 escape 再支援 ## 標題、**粗體**、- 列表、空行分段 */
const escText = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
const mdLite = (src) => {
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => {
    if (para.length) out.push("<p>" + para.map(inline).join("<br>") + "</p>");
    para = [];
  };
  const flushList = () => {
    if (list) out.push("<ul>" + list.map((li) => "<li>" + inline(li) + "</li>").join("") + "</ul>");
    list = null;
  };
  escText(src).split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); return; }
    if (line.startsWith("## ")) { flushPara(); flushList(); out.push("<h3>" + inline(line.slice(3)) + "</h3>"); return; }
    if (line.startsWith("- ")) { flushPara(); (list = list || []).push(line.slice(2)); return; }
    flushList();
    para.push(line);
  });
  flushPara();
  flushList();
  return out.join("");
};

const fmtWhen = (ev) => {
  const d = new Date(String(ev.date) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return { m: "", day: "", text: ev.date };
  return {
    m: d.getMonth() + 1 + "月",
    day: String(d.getDate()),
    text: `${d.getMonth() + 1}/${d.getDate()}（週${WEEKDAYS[d.getDay()]}）`,
  };
};

const render = (ev) => {
  const signupUrl = "/signup?event=" + encodeURIComponent(ev.id);
  document.title = `${ev.title}｜Chill Club 揪可樂`;
  $("ev-title").textContent = ev.title;

  /* 日期時間 */
  const when = fmtWhen(ev);
  $("ev-chip-m").textContent = when.m;
  $("ev-chip-d").textContent = when.day;
  $("ev-when").textContent = when.text;
  $("ev-time").textContent = ev.time || "";

  /* 地點（hideVenue 場次 server 端已拿掉 location） */
  const where = $("ev-where");
  if (ev.location) {
    const b = el("b", null, ev.location);
    where.appendChild(b);
    if (ev.mapUrl && !ev.past) {
      const a = el("a", "ev-map-link", "導航 →");
      a.href = ev.mapUrl;
      a.target = "_blank";
      a.rel = "noopener";
      where.appendChild(a);
    }
  } else if (!ev.past) {
    where.appendChild(el("b", "ev-unlock", "詳細地點報名後解鎖"));
    where.appendChild(el("span", "ev-unlock-sub", "報名完成就告訴你在哪裡"));
  } else {
    $("ev-where-row").hidden = true;
  }

  /* 海報／品牌漸層卡 */
  const poster = $("ev-poster");
  if (ev.poster) {
    const img = el("img", "ev-poster-img");
    img.src = ev.poster;
    img.alt = ev.title;
    poster.appendChild(img);
  } else {
    const t = typeInfo(ev.type);
    poster.classList.add("ev-poster-fallback");
    poster.style.background = `linear-gradient(145deg, ${t.grad[0]}, ${t.grad[1]})`;
    const logo = el("img", "ev-poster-logo");
    logo.src = "/logo-icon.png";
    logo.alt = "";
    poster.appendChild(logo);
    poster.appendChild(el("p", "ev-poster-type", t.label));
    poster.appendChild(el("p", "ev-poster-title", ev.title));
  }

  /* 報名卡狀態（邏輯對齊首頁活動卡） */
  const card = $("ev-signup-card");
  const cta = $("ev-cta");
  const slots = $("ev-slots");
  const left = ev.left != null ? ev.left : (!ev.hideCount && ev.capacity ? Math.max(0, ev.capacity - (ev.signedUp || 0)) : null);
  const isFull = ev.status === "closed" || (left !== null && left <= 0);

  if (ev.past) {
    $("ev-past").hidden = false;
    $("ev-signup-head").textContent = "這場已圓滿結束";
    slots.hidden = true;
    cta.textContent = "看看接下來的小聚 →";
    cta.href = "/#events";
    $("ev-fee").hidden = true;
  } else {
    if (ev.buyoutMode) {
      const b = ev.buyoutMode;
      $("ev-buyout").hidden = false;
      $("ev-buyout-text").textContent = b.reached
        ? "包場達成！剩最後幾個位子"
        : `已揪 ${b.signed} 人，再 ${b.goal - b.signed} 人包下整場！`;
      $("ev-buyout-fill").style.width = Math.min(100, Math.round((b.signed / b.goal) * 100)) + "%";
    } else {
      slots.appendChild(
        el("span", "event-slots" + (isFull ? " full" : ""), isFull ? ev.fullText || "已滿團" : left !== null ? `剩 ${left} 個名額` : "開放報名中")
      );
    }
    if (isFull && !ev.buyoutMode) {
      cta.textContent = "候補看看・先加入名單 →";
      cta.href = "/signup";
      cta.classList.add("btn-ghost");
      cta.classList.remove("btn-primary");
    } else {
      cta.href = signupUrl;
      cta.setAttribute("data-track-cta", "evpage-signup-" + ev.id);
    }
    $("ev-fee").textContent =
      ev.fee === 0
        ? "免報名費（餐點自付）"
        : `報名費 $${ev.fee != null ? ev.fee : 50}・${ev.prepay ? "先匯款鎖定名額" : "當天現場繳就好"}`;
    if (ev.feeNote) {
      $("ev-feenote").hidden = false;
      $("ev-feenote").textContent = ev.feeNote;
    }
  }

  /* 關於這場：desc（markdown-lite）→ fallback note */
  const about = ev.desc || ev.note;
  if (about) {
    $("ev-about").hidden = false;
    $("ev-desc").innerHTML = ev.desc ? mdLite(ev.desc) : "<p>" + inline(escText(ev.note)) + "</p>";
  }

  /* 流程表 */
  if (Array.isArray(ev.agenda) && ev.agenda.length) {
    $("ev-agenda-wrap").hidden = false;
    const ul = $("ev-agenda");
    ev.agenda.forEach((row) => {
      const li = el("li");
      li.appendChild(el("b", null, row.t || ""));
      li.appendChild(document.createTextNode(" " + (row.x || "")));
      ul.appendChild(li);
    });
  }

  /* 手機 sticky 報名列：報名卡捲出畫面才浮出 */
  if (!ev.past && !isFull) {
    const sticky = $("ev-sticky");
    $("ev-sticky-title").textContent = ev.title;
    $("ev-sticky-meta").textContent = `${when.text} ${ev.time || ""}`;
    const btn = $("ev-sticky-btn");
    btn.href = signupUrl;
    btn.setAttribute("data-track-cta", "evpage-sticky-" + ev.id);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        ([entry]) => { sticky.hidden = entry.isIntersecting; },
        { rootMargin: "-56px 0px 0px 0px" }
      ).observe(card);
    } else {
      sticky.hidden = false;
    }
  }

  loadAttendees(ev);
};

/* 誰要來：稱呼＋字首圓頭像牆 */
const AVA_COLORS = ["#e2572b", "#c1622f", "#7fa98f", "#6b4a38", "#d98a3d"];
const loadAttendees = async (ev) => {
  if (ev.hideCount) return;
  try {
    const res = await fetch("/api/events/" + encodeURIComponent(ev.id) + "/attendees");
    if (!res.ok) return;
    const { names = [], more = 0 } = await res.json();
    if (!names.length) return;
    $("ev-attendees").hidden = false;
    $("ev-att-count").textContent = `・${names.length + more} 人`;
    const wall = $("ev-att-wall");
    names.forEach((name, i) => {
      const row = el("div", "ev-att");
      const ava = el("span", "ev-ava", String(name).slice(0, 1).toUpperCase());
      ava.style.background = AVA_COLORS[i % AVA_COLORS.length];
      row.appendChild(ava);
      row.appendChild(el("span", "ev-att-name", name));
      wall.appendChild(row);
    });
    if (more > 0) {
      $("ev-att-more").hidden = false;
      $("ev-att-more").textContent = `還有 ${more} 位朋友也報名了`;
    }
  } catch (err) {
    /* 報名牆載不到就不顯示，不影響主頁面 */
  }
};

const boot = async () => {
  if (window.__EVENT__) {
    render(window.__EVENT__);
    return;
  }
  // fallback：server 沒注入（理論上不會發生）就自己撈
  const id = decodeURIComponent(location.pathname.split("/").filter(Boolean)[1] || "");
  try {
    const res = await fetch("/api/events");
    const { events = [] } = await res.json();
    const ev = events.find((e) => e.id === id);
    if (ev) render(ev);
    else location.href = "/#events";
  } catch (err) {
    location.href = "/#events";
  }
};

boot();
