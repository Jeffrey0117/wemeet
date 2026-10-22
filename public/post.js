// 文章頁：markdown-lite 渲染 + 文末漏斗（下一場小聚、更多文章）
const $ = (id) => document.getElementById(id);

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* 行內語法：先 escape 再換 — 連結 [文](http://…)、粗體 **x** */
const inline = (s) =>
  s
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

/* 區塊語法：## 標題、### 小標、> 引用、- 列表、![](圖)、--- 分隔線、空行分段 */
const renderMd = (src) => {
  const out = [];
  let list = null;
  let quote = null;
  let para = [];
  const flushPara = () => {
    if (para.length) out.push("<p>" + para.map(inline).join("<br>") + "</p>");
    para = [];
  };
  const flushList = () => {
    if (list) out.push("<ul>" + list.map((li) => "<li>" + inline(li) + "</li>").join("") + "</ul>");
    list = null;
  };
  const flushQuote = () => {
    if (quote) out.push("<blockquote>" + quote.map(inline).join("<br>") + "</blockquote>");
    quote = null;
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };
  esc(src).split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line) {
      flushAll();
      return;
    }
    const img = line.match(/^!\[([^\]]*)\]\((https?:[^)\s]+)\)$/);
    if (img) {
      flushAll();
      out.push(`<figure class="po-img"><img src="${img[2]}" alt="${img[1]}" loading="lazy">${img[1] ? `<figcaption>${img[1]}</figcaption>` : ""}</figure>`);
      return;
    }
    if (/^---+$/.test(line)) {
      flushAll();
      out.push("<hr>");
      return;
    }
    if (line.startsWith("### ")) {
      flushAll();
      out.push("<h3>" + inline(line.slice(4)) + "</h3>");
      return;
    }
    if (line.startsWith("## ")) {
      flushAll();
      out.push("<h2>" + inline(line.slice(3)) + "</h2>");
      return;
    }
    if (line.startsWith("&gt; ") || line === "&gt;") {
      flushPara();
      flushList();
      (quote = quote || []).push(line.replace(/^&gt;\s?/, ""));
      return;
    }
    if (line.startsWith("- ")) {
      flushPara();
      flushQuote();
      (list = list || []).push(line.slice(2));
      return;
    }
    flushList();
    flushQuote();
    para.push(line);
  });
  flushAll();
  return out.join("");
};

const fmtDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const render = (post) => {
  $("po-kicker").textContent = [post.category || "揪可樂誌", fmtDate(post.createdAt)].filter(Boolean).join("・");
  $("po-title").textContent = post.title;
  if (post.cover) {
    $("po-cover").src = post.cover;
    $("po-cover-wrap").hidden = false;
  }
  $("po-body").innerHTML = renderMd(post.md || "");
};

/* 文末：下一場開放報名的小聚 */
const loadNextEvent = async () => {
  try {
    const res = await fetch("/api/events");
    const { events = [] } = await res.json();
    const next = events.find((e) => !e.past && e.status === "open");
    if (!next) return;
    const d = new Date(next.date + "T00:00:00");
    const when = Number.isNaN(d.getTime()) ? next.date : `${d.getMonth() + 1}/${d.getDate()}（週${WEEKDAYS[d.getDay()]}）`;
    const card = $("po-next-card");
    const link = el("a", "po-next-link");
    link.href = "/e/" + encodeURIComponent(next.id);
    link.appendChild(el("b", null, next.title));
    link.appendChild(el("span", null, `${when}・${next.time || ""}`));
    card.appendChild(link);
    const btn = el("a", "btn btn-primary", "看活動・報名 →");
    btn.href = "/e/" + encodeURIComponent(next.id);
    card.appendChild(btn);
    $("po-next").hidden = false;
  } catch (err) {}
};

/* 更多文章 */
const loadMore = async (currentSlug) => {
  try {
    const res = await fetch("/api/posts");
    const { posts = [] } = await res.json();
    const others = posts.filter((p) => p.slug !== currentSlug).slice(0, 3);
    if (!others.length) return;
    const list = $("po-more-list");
    others.forEach((p) => {
      const a = el("a", "po-more-item");
      a.href = "/blog/" + encodeURIComponent(p.slug);
      a.appendChild(el("b", null, p.title));
      a.appendChild(el("span", null, fmtDate(p.createdAt)));
      list.appendChild(a);
    });
    $("po-more").hidden = false;
  } catch (err) {}
};

if (window.__POST__) {
  render(window.__POST__);
  loadNextEvent();
  loadMore(window.__POST__.slug);
} else {
  location.href = "/blog";
}
