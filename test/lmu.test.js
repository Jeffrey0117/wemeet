// LetMeUse token 驗證的回歸測試。
//
// 這些洞在 2026-11-08 改用 jwks-verify-kit 之前**全部是活的**。bug 已經修好了，
// 所以不能用 TDD 的「先寫測試」—— RED 那一步是刻意重現的：把 src/lmu.js 換回
// 舊的內聯實作跑一次，確認下面這些會變紅（做過，紀錄在 commit message）。
//
// 一顆對壞碼跟好碼都綠的測試比沒測試更糟：它會讓下一個人相信這條路有人守著。
//
// 起一個真的本機假 IdP（不是 mock fetch）：要驗的東西包含「JWKS 怎麼抓、抓不到
// 會怎樣」，用 mock 就測不到那一半。
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");

const { createLmu } = require("../src/lmu");

const APP = "app_wemeet_test";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

function keypair(kid) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig" };
  return { publicKey, privateKey, kid, jwk };
}

/** 簽一顆 ES256 token。header 覆寫放最後，所以負面測試可以在**簽之前**改 kid。 */
function sign(claims, pair, header = {}) {
  const h = b64({ alg: "ES256", kid: pair.kid, ...header });
  const p = b64(claims);
  const sig = crypto.sign("sha256", Buffer.from(`${h}.${p}`), {
    key: pair.privateKey, dsaEncoding: "ieee-p1363",
  });
  return `${h}.${p}.${sig.toString("base64url")}`;
}

/** 本機假 IdP。`state.keys` 可換，模擬金鑰輪換與撤銷。 */
async function startIdp(keys) {
  const state = { keys, hits: 0 };
  const server = http.createServer((req, res) => {
    state.hits += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: state.keys }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  return { state, url: `http://127.0.0.1:${port}/api/jwks`, close: () => server.close() };
}

const future = () => Math.floor(Date.now() / 1000) + 3600;

test("LetMeUse token 驗證", async (t) => {
  const good = keypair("kid-good");
  const other = keypair("kid-other"); // 不在 JWKS 裡的另一把
  const idp = await startIdp([good.jwk]);
  const lmu = createLmu({ appId: APP, jwksUrl: idp.url, onError: () => {} });
  const s = await lmu.ready();
  assert.equal(s.keys, 1, "預熱要拿到金鑰（不然下面每一條都會因為別的原因綠）");

  t.after(() => { lmu.stop(); idp.close(); });

  await t.test("✅ 基準線：真 token 通", () => {
    const claims = lmu.verifyLmuToken(sign({ sub: "usr_1", app: APP, exp: future() }, good));
    assert.ok(claims);
    assert.equal(claims.sub, "usr_1");
  });

  // ── 1. exp：舊碼 `if (!payload.exp || payload.exp * 1000 < Date.now())` ────
  await t.test("🔒 沒有 exp 的 token 要擋（舊碼：永不過期）", () => {
    assert.equal(lmu.verifyLmuToken(sign({ sub: "usr_1", app: APP }, good)), null);
  });

  await t.test("🔒 字串型 exp 要擋（舊碼：`!\"abc\"` 是 false、NaN 比較也是 false → 兩邊都躲過）", () => {
    const token = sign({ sub: "usr_1", app: APP, exp: String(future()) }, good);
    assert.equal(lmu.verifyLmuToken(token), null);
  });

  await t.test("🔒 已過期的 token 要擋", () => {
    const token = sign({ sub: "usr_1", app: APP, exp: Math.floor(Date.now() / 1000) - 10 }, good);
    assert.equal(lmu.verifyLmuToken(token), null);
  });

  // ── 2. 租戶邊界（JWKS 只有一把金鑰、簽發所有 app 的 token）─────────────────
  await t.test("🔒 別的 app 的 token 要擋", () => {
    assert.equal(lmu.verifyLmuToken(sign({ sub: "usr_1", app: "app_other", exp: future() }, good)), null);
  });

  await t.test("🔒 完全沒帶 app claim 要擋", () => {
    assert.equal(lmu.verifyLmuToken(sign({ sub: "usr_1", exp: future() }, good)), null);
  });

  await t.test("🔒 沒設 appId 時 createLmu 直接 throw（不是靜默接受全部）", () => {
    assert.throws(() => createLmu({ appId: "", jwksUrl: idp.url }), /appId/);
  });

  await t.test("🔒 沒給網址時 createLmu 直接 throw（不是靜默拒絕全部）", () => {
    assert.throws(() => createLmu({ appId: APP }), /jwksUrl|baseUrl/);
  });

  // ── 3. 簽章與 header ──────────────────────────────────────────────────────
  await t.test("🔒 HS256 偽造要擋（app secret 外洩劇本）", () => {
    const h = b64({ alg: "HS256", typ: "JWT" });
    const p = b64({ sub: "usr_evil", app: APP, exp: future() });
    const sig = crypto.createHmac("sha256", "leaked-secret").update(`${h}.${p}`).digest("base64url");
    assert.equal(lmu.verifyLmuToken(`${h}.${p}.${sig}`), null);
  });

  await t.test("🔒 alg:none 要擋", () => {
    const h = b64({ alg: "none" });
    const p = b64({ sub: "usr_evil", app: APP, exp: future() });
    assert.equal(lmu.verifyLmuToken(`${h}.${p}.`), null);
  });

  await t.test("🔒 kid 不在 JWKS 要擋（簽章本身有效）", () => {
    // ⚠️ kid 一定要在**簽之前**就設好。簽完才去改 header 的話簽章本身就壞了,
    // 那樣的 401 證明不了「kid 檢查有在運作」（我在 selfize 犯過這個錯）。
    assert.equal(lmu.verifyLmuToken(sign({ sub: "usr_1", app: APP, exp: future() }, other)), null);
  });

  await t.test("🔒 header 沒帶 kid 要擋", () => {
    const token = sign({ sub: "usr_1", app: APP, exp: future() }, good, { kid: undefined });
    assert.equal(lmu.verifyLmuToken(token), null);
  });

  await t.test("🔒 簽章被改過要擋", () => {
    const t0 = sign({ sub: "usr_1", app: APP, exp: future() }, good);
    const [h, p, sig] = t0.split(".");
    const flipped = Buffer.from(sig, "base64url");
    flipped[0] ^= 0xff;
    assert.equal(lmu.verifyLmuToken(`${h}.${p}.${flipped.toString("base64url")}`), null);
  });

  await t.test("🔒 payload 被換掉要擋（驗簽在解析 payload 之前）", () => {
    const t0 = sign({ sub: "usr_1", app: APP, exp: future() }, good);
    const [h, , sig] = t0.split(".");
    const evil = b64({ sub: "usr_admin", app: APP, exp: future() });
    assert.equal(lmu.verifyLmuToken(`${h}.${evil}.${sig}`), null);
  });

  // ── 4. nbf（舊碼完全沒檢查）────────────────────────────────────────────────
  await t.test("🔒 nbf 還在未來要擋（舊碼沒檢查）", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = sign({ sub: "usr_1", app: APP, exp: now + 3600, nbf: now + 600 }, good);
    assert.equal(lmu.verifyLmuToken(token), null);
  });

  // ── 5. sub ────────────────────────────────────────────────────────────────
  await t.test("🔒 sub 不是非空字串要擋（會直接當資料的 key）", () => {
    for (const sub of [undefined, "", 123, { a: 1 }, null]) {
      assert.equal(lmu.verifyLmuToken(sign({ sub, app: APP, exp: future() }, good)), null, `sub=${JSON.stringify(sub)}`);
    }
  });

  // ── 6. 格式 ───────────────────────────────────────────────────────────────
  await t.test("🔒 垃圾輸入一律 null,不丟例外", () => {
    for (const bad of [null, undefined, "", "abc", "a.b", "a.b.c.d", 123, {}, "....", "Bearer x"]) {
      assert.equal(lmu.verifyLmuToken(bad), null, JSON.stringify(bad));
    }
  });

  await t.test("🔒 lmuUser：沒帶 / 壞掉的 Authorization 一律 null", () => {
    for (const auth of [undefined, "", "Basic abc", "Bearer", "Bearer   ", "Token xyz"]) {
      assert.equal(lmu.lmuUser({ headers: { authorization: auth } }), null, JSON.stringify(auth));
    }
  });

  await t.test("✅ lmuUser：小寫 bearer 也收（RFC 7235 scheme 不分大小寫）", () => {
    const token = sign({ sub: "usr_1", app: APP, exp: future() }, good);
    assert.ok(lmu.lmuUser({ headers: { authorization: `bearer ${token}` } }));
  });
});

// ── 7. 緊急撤銷（舊碼 `if (m.size) { jwksKeys = m }` → 空回應不覆蓋）──────────
test("🔒 權威的空 JWKS 要清空快取 —— 緊急撤銷金鑰必須真的生效", async () => {
  // 劇本：LetMeUse 私鑰外洩 → 把金鑰從 JWKS 下架。舊碼「空的不覆蓋」會繼續拿
  // 舊公鑰放行被盜金鑰簽的 token，直到有人想起來重啟 process。
  const leaked = keypair("kid-leaked");
  const idp = await startIdp([leaked.jwk]);
  const lmu = createLmu({ appId: APP, jwksUrl: idp.url, onError: () => {} });
  await lmu.ready();

  const token = sign({ sub: "usr_1", app: APP, exp: future() }, leaked);
  assert.ok(lmu.verifyLmuToken(token), "下架前要通（不然後面的 null 沒有意義）");

  idp.state.keys = []; // 金鑰下架
  const r = await lmu.refresh(); // 定時刷新在生產環境做的就是這件事
  assert.equal(r.throttled, false, "refresh 不該被節流掉（kit 0.2.1 之前會靜默吃掉）");

  assert.equal(lmu.verifyLmuToken(token), null, "被撤銷的金鑰必須立刻失效");
  assert.equal(lmu.stats().keys, 0);

  lmu.stop();
  idp.close();
});

// ── 8. 上游故障不該把登入中的人踢掉（另一個方向的錯誤同樣要避免）────────────
test("✅ JWKS 端點掛掉時,已快取的金鑰繼續有效（一次抖動不該全員登出）", async () => {
  const pair = keypair("kid-1");
  const idp = await startIdp([pair.jwk]);
  const lmu = createLmu({ appId: APP, jwksUrl: idp.url, onError: () => {} });
  await lmu.ready();

  const token = sign({ sub: "usr_1", app: APP, exp: future() }, pair);
  assert.ok(lmu.verifyLmuToken(token));

  idp.close(); // 上游死了
  await lmu.refresh(); // 抓取失敗
  assert.ok(lmu.verifyLmuToken(token), "傳輸失敗時舊公鑰要留著");
  assert.ok(lmu.stats().lastError, "但失敗要記下來（fail-closed 不能無聲）");

  lmu.stop();
});

// ── 9. 沒有逾時的 fetch 會讓快取永久凍結（舊碼的第三個洞）────────────────────
test("🔒 JWKS 端點接了連線卻不回應時,不會永久卡住", async () => {
  // 舊碼是 `const res = await fetch(JWKS_URL)` —— node 的 fetch 沒有預設逾時。
  // 對方接了連線但不回應 → promise 永不 settle → `jwksFetching` 旗標永遠是
  // true → 快取再也不會更新、每個請求都 401 直到有人重啟，而且零診斷。
  const server = http.createServer(() => { /* 刻意不回應 */ });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();

  const lmu = createLmu({
    appId: APP,
    jwksUrl: `http://127.0.0.1:${port}/api/jwks`,
    onError: () => {},
  });
  const started = Date.now();
  // 這一行在舊碼裡會永遠掛住（測試會被算成 cancelled 而不是 fail —— 查紅燈的
  // 時候要看 `# cancelled` 那一行，不只看 `# fail`）。
  const s = await lmu.ready();
  const elapsed = Date.now() - started;

  assert.equal(s.keys, 0, "抓不到就是 0 把金鑰（fail-closed）");
  assert.ok(s.lastError, "而且錯誤要看得見");
  assert.ok(elapsed < 20_000, `應該要逾時放掉,實際花了 ${elapsed}ms`);

  lmu.stop();
  server.close();
});
