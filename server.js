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
const LMU_APP_ID = ENV.LETMEUSE_APP_ID || "";
const LMU_SECRET = ENV.LETMEUSE_APP_SECRET || "";
const MEMBERS_PATH = path.join(DATA_DIR, "members.json");

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
  if (!fs.existsSync(MEMBERS_PATH)) fs.writeFileSync(MEMBERS_PATH, "{}", "utf8");
};

/* ---------- LetMeUse JWT 驗簽（ES256 via JWKS，HS256 過渡期相容） ---------- */

// JWKS 公鑰快取：背景抓、同步讀（照 quickky jwks-cache 模式）
const LMU_BASE_URL = (ENV.LETMEUSE_BASE_URL || "").replace(/\/$/, "");
const JWKS_URL = ENV.LETMEUSE_JWKS_URL || (LMU_BASE_URL ? LMU_BASE_URL + "/api/jwks" : "");
let jwksKeys = new Map();
let jwksLastFetch = 0;
let jwksFetching = false;

const refreshJwks = async () => {
  if (jwksFetching || !JWKS_URL) return;
  jwksFetching = true;
  try {
    const res = await fetch(JWKS_URL);
    if (!res.ok) return;
    const data = await res.json();
    const m = new Map();
    for (const jwk of data.keys || []) {
      try {
        if (jwk.kid) m.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: "jwk" }));
      } catch (err) {}
    }
    if (m.size) {
      jwksKeys = m;
      jwksLastFetch = Date.now();
    }
  } catch (err) {
  } finally {
    jwksFetching = false;
  }
};

const getJwksKey = (kid) => {
  const key = jwksKeys.get(kid);
  if (!key && Date.now() - jwksLastFetch > 60 * 1000) void refreshJwks();
  return key || null;
};

const verifyLmuToken = (token) => {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));

    if (header.alg === "ES256") {
      const pub = getJwksKey(header.kid);
      if (!pub) return null;
      const ok = crypto.verify(
        "sha256",
        Buffer.from(h + "." + p),
        { key: pub, dsaEncoding: "ieee-p1363" },
        Buffer.from(s, "base64url")
      );
      if (!ok) return null;
    } else if (header.alg === "HS256") {
      if (!LMU_SECRET) return null;
      const expected = crypto.createHmac("sha256", LMU_SECRET).update(h + "." + p).digest();
      const actual = Buffer.from(s, "base64url");
      if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    } else {
      return null;
    }

    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    if (!payload) return null;
    payload.sub = payload.sub || payload.userId;
    if (!payload.sub) return null;
    if (payload.app && LMU_APP_ID && payload.app !== LMU_APP_ID) return null;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch (err) {
    return null;
  }
};

const lmuUser = (req) => verifyLmuToken(bearerToken(req));

void refreshJwks();
const jwksTimer = setInterval(() => void refreshJwks(), 60 * 60 * 1000);
if (jwksTimer.unref) jwksTimer.unref();

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
    const agreedPayment = body.agreedPayment === true;
    const agreedAttend = body.agreedAttend === true;
    const eventId = cleanStr(body.eventId, 60); // 空字串 = 先加入名單、開團通知
    if (!name || !contact) {
      sendJson(res, 400, { error: "暱稱和聯絡方式都要填喔" });
      return;
    }
    if (!agreedPayment || !agreedAttend) {
      sendJson(res, 400, { error: "要先同意報名須知（費用與準時出席）才能報名喔" });
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
      agreedPayment,
      agreedAttend,
      paid: false,
      memberSub: (lmuUser(req) || {}).sub || null,
      createdAt: new Date().toISOString(),
    };
    writeJsonAtomic(SIGNUPS_PATH, [...signups, entry], (err) => {
      if (err) sendJson(res, 500, { error: "寫入失敗，再試一次" });
      else sendJson(res, 200, { success: true });
    });
  });
};

/* ---------- 會員 API（LetMeUse 登入） ---------- */

const QUICKKY_URL_RE = /^https:\/\/quickky\.(isnowfriend\.com|pipee\.tw)\/\S*$/;

// showOnWall 原樣傳回（undefined = 從未表態，前端拿來決定預設勾選）
const memberPublic = ({ sub, email, name, nickname, contact, igHandle, quickkyUrl, bio, showOnWall }) => ({
  sub, email, name, nickname, contact, igHandle, quickkyUrl, bio, showOnWall,
});

const handleMe = (req, res) => {
  const payload = lmuUser(req);
  if (!payload) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  const members = readJsonFile(MEMBERS_PATH, {});
  const existing = members[payload.sub];

  if (req.method === "GET") {
    if (existing) {
      sendJson(res, 200, { member: memberPublic(existing) });
      return;
    }
    const fresh = {
      sub: payload.sub,
      email: cleanStr(payload.email, 120),
      name: cleanStr(payload.name, 60),
      nickname: cleanStr(payload.name, 40),
      contact: "",
      igHandle: "",
      quickkyUrl: "",
      bio: "",
      createdAt: new Date().toISOString(),
    };
    writeJsonAtomic(MEMBERS_PATH, { ...members, [payload.sub]: fresh }, (err) => {
      if (err) sendJson(res, 500, { error: "write failed" });
      else sendJson(res, 200, { member: memberPublic(fresh) });
    });
    return;
  }

  if (req.method === "PUT") {
    readJsonBody(req, res, (body) => {
      let quickkyUrl = cleanStr(body.quickkyUrl, 200).replace(/\s+/g, "");
      if (quickkyUrl && !/^https?:\/\//i.test(quickkyUrl)) quickkyUrl = "https://" + quickkyUrl;
      quickkyUrl = quickkyUrl.replace(/^http:\/\//i, "https://");
      if (quickkyUrl && !QUICKKY_URL_RE.test(quickkyUrl)) {
        sendJson(res, 400, { error: "Quickky 連結格式不對，貼你卡片頁的網址（quickky.isnowfriend.com 開頭）" });
        return;
      }
      const base = existing || { sub: payload.sub, createdAt: new Date().toISOString() };
      const next = {
        ...base,
        email: cleanStr(payload.email, 120),
        name: cleanStr(payload.name, 60),
        nickname: cleanStr(body.nickname, 40) || cleanStr(payload.name, 40),
        contact: cleanStr(body.contact, 120),
        igHandle: cleanStr(body.igHandle, 60),
        quickkyUrl,
        bio: cleanStr(body.bio, 300),
        showOnWall: body.showOnWall === true && !!quickkyUrl,
        updatedAt: new Date().toISOString(),
      };
      writeJsonAtomic(MEMBERS_PATH, { ...members, [payload.sub]: next }, (err) => {
        if (err) sendJson(res, 500, { error: "write failed" });
        else sendJson(res, 200, { member: memberPublic(next) });
      });
    });
    return;
  }

  sendJson(res, 405, { error: "method not allowed" });
};

/* ---------- LetMeUse webhook（HMAC-SHA256 用 app secret 驗） ---------- */

const handleLmuWebhook = (req, res) => {
  let body = "";
  let tooLarge = false;
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > MAX_BODY) {
      tooLarge = true;
      req.destroy();
    }
  });
  req.on("end", () => {
    if (tooLarge) return;
    if (!LMU_SECRET) {
      sendJson(res, 503, { error: "not configured" });
      return;
    }
    const signature = req.headers["x-letmeuse-signature"] || "";
    const expected = crypto.createHmac("sha256", LMU_SECRET).update(body).digest("hex");
    if (!signature || !timingSafeEqual(signature, expected)) {
      sendJson(res, 401, { error: "invalid signature" });
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (err) {
      sendJson(res, 400, { error: "invalid JSON" });
      return;
    }
    const sub = parsed.payload && parsed.payload.id;
    const members = readJsonFile(MEMBERS_PATH, {});
    if (sub && members[sub]) {
      if (parsed.event === "user.deleted") {
        const { [sub]: removed, ...rest } = members;
        writeJsonAtomic(MEMBERS_PATH, rest, () => {});
      } else if (parsed.event === "user.updated") {
        const next = {
          ...members[sub],
          email: cleanStr(parsed.payload.email, 120) || members[sub].email,
          name: cleanStr(parsed.payload.name, 60) || members[sub].name,
        };
        writeJsonAtomic(MEMBERS_PATH, { ...members, [sub]: next }, () => {});
      }
    }
    sendJson(res, 200, { received: true });
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

  // 標記已匯款：PATCH /api/admin/signups/{id} {paid: true|false}
  const m = pathname.match(/^\/api\/admin\/signups\/([a-f0-9]{16})$/);
  if (req.method === "PATCH" && m) {
    readJsonBody(req, res, (body) => {
      const signups = readJsonFile(SIGNUPS_PATH, []);
      if (!signups.some((s) => s.id === m[1])) {
        sendJson(res, 404, { error: "signup not found" });
        return;
      }
      const next = signups.map((s) => (s.id === m[1] ? { ...s, paid: body.paid === true } : s));
      writeJsonAtomic(SIGNUPS_PATH, next, (err) => {
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
  if (pathname === "/api/me") {
    handleMe(req, res);
    return;
  }
  // 首頁 Chill 友牆：opt-in 且有連卡的會員，只露暱稱/自介/卡片
  if (req.method === "GET" && pathname === "/api/wall") {
    const members = Object.values(readJsonFile(MEMBERS_PATH, {}))
      .filter((m) => m.showOnWall === true && m.quickkyUrl)
      .map(({ nickname, bio, quickkyUrl }) => ({ nickname, bio, quickkyUrl }))
      .sort(() => Math.random() - 0.5);
    sendJson(res, 200, { wall: members });
    return;
  }
  if (req.method === "POST" && pathname === "/api/webhooks/letmeuse") {
    handleLmuWebhook(req, res);
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
  if (pathname === "/me") {
    sendFile(res, path.join(PUBLIC_DIR, "me.html"));
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
