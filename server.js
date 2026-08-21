// Chill Club 揪可樂 — 零依賴伺服器（cloudpipe PM2 進入點）
// 靜態檔在 public/；API：/api/events、/api/signup、/api/admin/*
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const EVENTS_PATH = path.join(DATA_DIR, "events.json");
const SIGNUPS_PATH = path.join(DATA_DIR, "signups.json");
const MAX_BODY = 50 * 1024;

// 零依賴 .env loader（pm2 不會注入 env 檔）
const loadEnv = () => {
  const vars = {};
  for (const file of [".env", ".env.production"]) {
    try {
      const raw = fs.readFileSync(path.join(ROOT, file), "utf8");
      raw.split(/\r?\n/).forEach((line) => {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && !line.trim().startsWith("#")) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
      });
    } catch (err) {}
  }
  return vars;
};
const ENV = { ...loadEnv(), ...process.env };
const PORT = Number(ENV.PORT) || 4046;
const ADMIN_TOKEN = ENV.ADMIN_TOKEN || "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/* ---------- 基礎工具 ---------- */

const sendJson = (res, code, obj) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
};

const timingSafeEqual = (a, b) => {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

const bearerToken = (req) => {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
};

const readJsonBody = (req, res, cb) => {
  let body = "";
  let tooLarge = false;
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > MAX_BODY) {
      tooLarge = true;
      req.destroy();
    }
  });
  req.on("close", () => {
    if (tooLarge) sendJson(res, 413, { error: "body too large" });
  });
  req.on("end", () => {
    if (tooLarge) return;
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (err) {
      sendJson(res, 400, { error: "invalid JSON" });
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      sendJson(res, 400, { error: "body must be an object" });
      return;
    }
    cb(parsed);
  });
};

const readJsonFile = (target, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (err) {
    return fallback;
  }
};

const writeJsonAtomic = (target, obj, cb) => {
  const tmp = target + ".tmp";
  fs.mkdir(path.dirname(target), { recursive: true }, (mkErr) => {
    if (mkErr) return cb(mkErr);
    fs.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8", (wErr) => {
      if (wErr) return cb(wErr);
      fs.rename(tmp, target, cb);
    });
  });
};

/* ---------- 種子資料（data/ 不進 git，首次啟動自動建立） ---------- */

const SEED_EVENTS = [
  {
    id: "eng-2026-08-22",
    type: "english",
    title: "英文口說小聚 #1",
    date: "2026-08-22",
    time: "15:00",
    location: "星巴克 文新昌平門市",
    capacity: 8,
    note: "不用很會講，敢開口就好。輕鬆話題、小組練習，全程零壓力。",
    status: "open",
  },
];

const ensureData = () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(EVENTS_PATH)) fs.writeFileSync(EVENTS_PATH, JSON.stringify(SEED_EVENTS, null, 2), "utf8");
  if (!fs.existsSync(SIGNUPS_PATH)) fs.writeFileSync(SIGNUPS_PATH, "[]", "utf8");
};

/* ---------- 簡易 IP rate limit（POST /api/signup） ---------- */

const rateBuckets = new Map();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;

const rateLimited = (ip) => {
  const now = Date.now();
  const kept = (rateBuckets.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (kept.length >= RATE_LIMIT) {
    rateBuckets.set(ip, kept);
    return true;
  }
  rateBuckets.set(ip, [...kept, now]);
  return false;
};

const clientIp = (req) =>
  (req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
    .toString()
    .split(",")[0]
    .trim();

/* ---------- 公開 API ---------- */

const countByEvent = (signups) =>
  signups.reduce((acc, s) => ({ ...acc, [s.eventId]: (acc[s.eventId] || 0) + 1 }), {});

// 過了活動當天就自動下架（date 格式不合法的照常顯示）
const isPast = (e) => {
  const end = new Date(String(e.date) + "T23:59:59");
  return !Number.isNaN(end.getTime()) && end < new Date();
};

const publicEvents = () => {
  const events = readJsonFile(EVENTS_PATH, []);
  const counts = countByEvent(readJsonFile(SIGNUPS_PATH, []));
  return events
    .filter((e) => e.status !== "hidden" && !isPast(e))
    .map((e) => ({ ...e, signedUp: counts[e.id] || 0 }));
};

const cleanStr = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

const handleSignup = (req, res) => {
  if (rateLimited(clientIp(req))) {
    sendJson(res, 429, { error: "報名太頻繁了，休息一下再試" });
    return;
  }
  readJsonBody(req, res, (body) => {
    const name = cleanStr(body.name, 40);
    const contact = cleanStr(body.contact, 120);
    const note = cleanStr(body.note, 300);
    const igHandle = cleanStr(body.igHandle, 60);
    const igFollowed = body.igFollowed === true;
    const eventId = cleanStr(body.eventId, 60); // 空字串 = 先加入名單、開團通知
    if (!name || !contact) {
      sendJson(res, 400, { error: "暱稱和聯絡方式都要填喔" });
      return;
    }
    const events = readJsonFile(EVENTS_PATH, []);
    if (eventId) {
      const event = events.find((e) => e.id === eventId && e.status !== "hidden");
      if (!event) {
        sendJson(res, 404, { error: "找不到這個活動" });
        return;
      }
      if (event.status === "closed") {
        sendJson(res, 409, { error: "這場已經截止報名囉" });
        return;
      }
      const count = countByEvent(readJsonFile(SIGNUPS_PATH, []))[eventId] || 0;
      if (event.capacity && count >= event.capacity) {
        sendJson(res, 409, { error: "這場滿了！可以先留資料，下一場優先通知你" });
        return;
      }
    }
    const signups = readJsonFile(SIGNUPS_PATH, []);
    const entry = {
      id: crypto.randomBytes(8).toString("hex"),
      eventId: eventId || null,
      name,
      contact,
      note,
      igHandle,
      igFollowed,
      createdAt: new Date().toISOString(),
    };
    writeJsonAtomic(SIGNUPS_PATH, [...signups, entry], (err) => {
      if (err) sendJson(res, 500, { error: "寫入失敗，再試一次" });
      else sendJson(res, 200, { success: true });
    });
  });
};

/* ---------- Admin API（Bearer ADMIN_TOKEN） ---------- */

const requireAdmin = (req, res) => {
  if (!ADMIN_TOKEN) {
    sendJson(res, 503, { error: "ADMIN_TOKEN not configured" });
    return false;
  }
  const token = bearerToken(req);
  if (!token || !timingSafeEqual(token, ADMIN_TOKEN)) {
    sendJson(res, 401, { error: "unauthorized" });
    return false;
  }
  return true;
};

const handleAdmin = (req, res, pathname) => {
  if (!requireAdmin(req, res)) return;

  if (req.method === "GET" && pathname === "/api/admin/overview") {
    sendJson(res, 200, {
      events: readJsonFile(EVENTS_PATH, []),
      signups: readJsonFile(SIGNUPS_PATH, []),
    });
    return;
  }

  // 整份覆蓋活動清單（後台編輯用）
  if (req.method === "PUT" && pathname === "/api/admin/events") {
    readJsonBody(req, res, (body) => {
      if (!Array.isArray(body.events)) {
        sendJson(res, 400, { error: "events must be an array" });
        return;
      }
      const valid = body.events.every(
        (e) => e && typeof e === "object" && cleanStr(e.id, 60) && cleanStr(e.title, 80)
      );
      if (!valid) {
        sendJson(res, 400, { error: "每個活動都要有 id 和 title" });
        return;
      }
      writeJsonAtomic(EVENTS_PATH, body.events, (err) => {
        if (err) sendJson(res, 500, { error: "write failed" });
        else sendJson(res, 200, { success: true });
      });
    });
    return;
  }

  sendJson(res, 404, { error: "not found" });
};

/* ---------- 靜態檔 ---------- */

// CF 對 .js/.css 會蓋 4 小時瀏覽器快取（無視 origin header），
// 所以 HTML 裡的資產網址帶 __BUILD__ 版本號，每次部署重啟自動換新
const BUILD_ID = Date.now().toString(36);

const sendFile = (res, filePath) => {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not Found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") {
    const html = fs.readFileSync(filePath, "utf8").replace(/__BUILD__/g, BUILD_ID);
    res.writeHead(200, { "Content-Type": MIME[ext], "Cache-Control": "no-cache" });
    res.end(html);
    return;
  }
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(filePath).pipe(res);
};

const serveStatic = (res, urlPath) => {
  let filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  sendFile(res, filePath);
};

/* ---------- 路由 ---------- */

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch (err) {
    res.writeHead(400).end("Bad Request");
    return;
  }

  if (req.method === "GET" && pathname === "/api/events") {
    sendJson(res, 200, { events: publicEvents() });
    return;
  }
  if (req.method === "POST" && pathname === "/api/signup") {
    handleSignup(req, res);
    return;
  }
  if (pathname.startsWith("/api/admin/")) {
    handleAdmin(req, res, pathname);
    return;
  }
  if (pathname === "/admin") {
    sendFile(res, path.join(PUBLIC_DIR, "admin.html"));
    return;
  }
  if (pathname === "/signup") {
    sendFile(res, path.join(PUBLIC_DIR, "signup.html"));
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }
  serveStatic(res, pathname);
});

ensureData();
server.listen(PORT, () => {
  process.stdout.write(`wemeet server listening on :${PORT}\n`);
});
