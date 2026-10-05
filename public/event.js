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

/* ---------- 主題皮膚（Luma 式沉浸背景）：theme 欄位指定，type 自動對應 ---------- */
const LEAF_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/></svg>';
const PAGE_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 3h10l4 4v14H5z" opacity="0.92"/><path d="M15 3v4h4" opacity="0.5"/></svg>';
const THEMES = {
  reading: {
    cls: "ev-theme-reading",
    poster: "/media/theme-reading.jpg",
    posterKicker: "揪可樂・線下讀書會",
    particles: [
      { svg: LEAF_SVG, color: "#6b4a38" },
      { svg: LEAF_SVG, color: "#c1622f" },
      { svg: PAGE_SVG, color: "#8a6a50" },
    ],
  },
};
const TYPE_THEME = { book: "reading" };

const applyTheme = (ev) => {
  const key = ev.theme === "none" ? "" : ev.theme || TYPE_THEME[ev.type] || "";
  const theme = THEMES[key];
  if (!theme) return null;
  document.body.classList.add("ev-themed", theme.cls);
  $("ev-theme-bg").hidden = false;
  // 自備主題圖（themeBg）就鋪圖暗化；沒有就用純 CSS 漸層底
  if (ev.themeBg) {
    const img = $("ev-theme-img");
    img.style.backgroundImage = `url("${encodeURI(ev.themeBg)}")`;
    img.classList.add("has-img");
  }
  // 飄落粒子：負的 delay 讓畫面一載入就是滿天飄的狀態
  // 減少動態效果的使用者只跳過粒子動畫，主題（海報/配色）照常回傳
  const box = $("ev-particles");
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return theme;
  for (let i = 0; i < 18; i++) {
    const spec = theme.particles[i % theme.particles.length];
    const far = i % 4 === 0; // 每四顆一顆遠景：更大、模糊，做出景深
    const p = el("span", "ev-particle" + (far ? " ev-particle-far" : ""));
    p.innerHTML = spec.svg;
    p.style.color = spec.color;
    p.style.left = Math.random() * 100 + "%";
    p.style.width = Math.round((far ? 54 : 26) + Math.random() * (far ? 46 : 30)) + "px";
    p.style.animationDuration = (10 + Math.random() * 12).toFixed(1) + "s";
    p.style.animationDelay = (-Math.random() * 22).toFixed(1) + "s";
    box.appendChild(p);
  }
  return theme;
};

/* 報名 modal：同頁彈出表單（iframe 載 /signup，流程邏輯全複用） */
const openSignupModal = (url) => {
  const modal = $("ev-modal");
  const frame = $("ev-modal-frame");
  const embedUrl = url + (url.includes("?") ? "&" : "?") + "embed=1";
  if (frame.getAttribute("src") !== embedUrl) frame.src = embedUrl;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
};
const closeSignupModal = () => {
  $("ev-modal").hidden = true;
  document.body.style.overflow = "";
};
const bindModal = () => {
  $("ev-modal").addEventListener("click", (e) => {
    if (e.target === $("ev-modal")) closeSignupModal();
  });
  $("ev-modal-close").addEventListener("click", closeSignupModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("ev-modal").hidden) closeSignupModal();
  });
};
// 點報名 → 開 modal（新分頁/中鍵維持原連結行為）
const hookSignup = (el, url) => {
  el.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    openSignupModal(url);
  });
};

const render = (ev) => {
  const theme = applyTheme(ev);
  bindModal();
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
  } else if (theme && theme.poster) {
    // 主題預設海報：主題插畫 + CSS 蓋文字（上 kicker、下場次標題）
    poster.classList.add("ev-poster-sketch");
    const img = el("img", "ev-poster-img");
    img.src = theme.poster;
    img.alt = ev.title;
    poster.appendChild(img);
    poster.appendChild(el("p", "ev-ps-top", theme.posterKicker || "揪可樂小聚"));
    poster.appendChild(el("p", "ev-ps-title", ev.title));
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
      hookSignup(cta, "/signup");
    } else {
      cta.href = signupUrl;
      cta.setAttribute("data-track-cta", "evpage-signup-" + ev.id);
      hookSignup(cta, signupUrl);
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

  /* 關於這場：desc（markdown-lite）→ fallback note；過往場標題改成回顧語氣 */
  const about = ev.desc || ev.note;
  if (about) {
    $("ev-about").hidden = false;
    if (ev.past) $("ev-about-title").textContent = "那天發生了什麼";
    $("ev-desc").innerHTML = ev.desc ? mdLite(ev.desc) : "<p>" + inline(escText(ev.note)) + "</p>";
  }

  /* 現場回顧照片牆（photos: ["/media/xxx.jpg", ...]）＋極簡 lightbox */
  if (Array.isArray(ev.photos) && ev.photos.length) {
    $("ev-photos-wrap").hidden = false;
    const grid = $("ev-photos");
    const lb = $("ev-lightbox");
    const lbImg = $("ev-lb-img");
    ev.photos.forEach((src) => {
      const btn = el("button", "ev-photo");
      btn.type = "button";
      const img = el("img");
      img.src = src;
      img.alt = ev.title + " 現場照片";
      img.loading = "lazy";
      btn.appendChild(img);
      btn.addEventListener("click", () => {
        lbImg.src = src;
        lb.hidden = false;
      });
      grid.appendChild(btn);
    });
    const closeLb = () => { lb.hidden = true; lbImg.src = ""; };
    lb.addEventListener("click", closeLb);
    $("ev-lb-close").addEventListener("click", closeLb);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLb(); });
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
    hookSignup(btn, signupUrl);
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
    if (ev.past) $("ev-att-label").textContent = "誰來過";
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
