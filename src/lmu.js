// LetMeUse token 驗證（只收 ES256，公鑰走 JWKS）。
//
// 2026-11-08：原本這段內聯在 1600 行的 server.js 裡（約 78 行的 JWKS 快取 +
// 驗章），所以沒辦法單獨測 —— 一 require 就會起一個 HTTP server。抽成模組之後
// 才測得到，而實作本身改用 `jwks-verify-kit`（生態系原本有十份各自獨立的拷貝）。
//
// 搬之前這份中了五個 fail-open，都有對應的回歸測試（test/lmu.test.js）：
//   1. `if (!payload.exp || payload.exp * 1000 < Date.now())` —— **字串型 exp
//      兩邊都躲過**（`!"abc"` 是 false、`"abc" < now` 的 NaN 比較也是 false）
//      → 永不過期。沒有 exp 的 token 同理。而 4h 的 exp 是這套設計唯一的撤銷
//      機制（登出、停用帳號都靠它）。
//   2. `if (LMU_APP_ID && payload.app !== LMU_APP_ID)` —— 自己忘了設
//      LETMEUSE_APP_ID 就等於接受任何 LetMeUse app 的任何使用者。JWKS 只有一把
//      金鑰、簽發**所有** app 的 token，所以 `app` claim 是唯一的租戶邊界。
//   3. `fetch(JWKS_URL)` 沒有逾時 —— node 的 fetch 沒有預設逾時，對方接了連線
//      卻不回應會讓 promise 永不 settle → in-flight 旗標永遠卡住 → 快取再也不
//      更新、每個請求都 401 直到重啟，而且零診斷。
//   4. `if (m.size) { jwksKeys = m }` —— 格式正確的空回應不覆蓋快取，所以緊急
//      撤銷金鑰（私鑰外洩後把金鑰從 JWKS 下架）永遠不生效。
//   5. 沒有 nbf 檢查；kid 沒帶也往下走。
//
// ⚠️ 只收 ES256（2026-10-28 起）：HS256 用 app secret 當簽章金鑰，等於「驗證方
// 必須握著簽發金鑰」—— secret 一外洩就能自簽任意 sub 冒充任何人。pokkit
// 2026-10-25 就是這樣被攻破的。
const { createLetMeUseVerifier } = require("jwks-verify-kit");

/**
 * @param {{ appId: string, jwksUrl?: string, baseUrl?: string, onError?: (e: Error) => void }} cfg
 *
 * appId 或網址缺一個就 **throw**。刻意的：缺設定的驗證器會變成「永遠拒絕每一
 * 顆 token」，而服務照樣回 200、健檢全綠、沒人登入得進來，統計是 0 看起來像
 * 「還沒人用」—— areyoubot 就這樣跑了三個月（見 infra-map）。
 */
function createLmu(cfg = {}) {
  const verifier = createLetMeUseVerifier({
    appId: cfg.appId,
    jwksUrl: cfg.jwksUrl || "",
    baseUrl: cfg.baseUrl || "",
    onError: cfg.onError || ((err) => console.warn(`[wemeet] JWKS: ${err.message}`)),
  });

  /** token → claims 或 null。同步（快取 miss 一律 fail-closed，背景補抓）。 */
  const verifyLmuToken = (token) => (token ? verifier.verifySync(token) : null);

  /** 從 Authorization header 取 Bearer token（scheme 依 RFC 7235 不分大小寫）。 */
  const bearerToken = (req) => verifier.bearer(req && req.headers && req.headers.authorization);

  /** req → claims 或 null。 */
  const lmuUser = (req) => verifyLmuToken(bearerToken(req));

  return {
    verifyLmuToken,
    bearerToken,
    lmuUser,
    /** 開機預熱 + 定時刷新。回傳 stats()。 */
    ready: verifier.ready,
    /** 立刻重抓 JWKS（緊急撤銷金鑰時用；定時刷新在生產環境做的就是這件事）。 */
    refresh: verifier.refresh,
    stop: verifier.stop,
    stats: verifier.stats,
  };
}

module.exports = { createLmu };
