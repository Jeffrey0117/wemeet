// 揪可樂誌：文章列表
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const fmtDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

const load = async () => {
  const list = document.getElementById("bl-list");
  try {
    const res = await fetch("/api/posts");
    const { posts = [] } = await res.json();
    list.textContent = "";
    if (!posts.length) {
      list.appendChild(el("p", "bl-empty", "第一篇正在路上。"));
      return;
    }
    posts.forEach((p) => {
      const card = el("a", "bl-card");
      card.href = "/blog/" + encodeURIComponent(p.slug);
      if (p.cover) {
        const img = el("img", "bl-cover");
        img.src = p.cover;
        img.alt = "";
        img.loading = "lazy";
        card.appendChild(img);
      }
      const body = el("div", "bl-card-body");
      body.appendChild(el("p", "bl-kicker", [p.category, fmtDate(p.createdAt)].filter(Boolean).join("・")));
      body.appendChild(el("h2", "bl-card-title", p.title));
      if (p.excerpt) body.appendChild(el("p", "bl-excerpt", p.excerpt));
      card.appendChild(body);
      list.appendChild(card);
    });
  } catch (err) {
    list.textContent = "";
    list.appendChild(el("p", "bl-empty", "載入失敗，重新整理試試"));
  }
};

load();
