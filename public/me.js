// 會員中心：LetMeUse 登入 + 會員資料 + Quickky 卡連結
const $ = (id) => document.getElementById(id);

const setState = (name) => {
  ["loading", "guest", "member"].forEach((s) => {
    $("state-" + s).hidden = s !== name;
  });
};

const setMsg = (text, ok) => {
  const node = $("me-msg");
  node.textContent = text;
  node.className = "me-msg " + (ok ? "ok" : "err");
};

const renderQuickky = (url) => {
  const has = !!url;
  $("quickky-none").hidden = has;
  $("quickky-has").hidden = !has;
  if (has) $("quickky-view").href = url;
};

const fillForm = (member) => {
  $("member-hello").textContent = `嗨，${member.nickname || member.name || "Chill 友"}！`;
  $("m-nickname").value = member.nickname || "";
  $("m-contact").value = member.contact || "";
  $("m-ig").value = member.igHandle || "";
  $("m-bio").value = member.bio || "";
  $("m-quickky").value = member.quickkyUrl || "";
  // 從未表態（undefined）時預設打勾，明確關過就尊重
  $("m-wall").checked = member.showOnWall === true || member.showOnWall == null;
  availData = member.availability || {};
  renderAvail();
  renderQuickky(member.quickkyUrl);
};

/* ---------- 我的空檔月曆 ---------- */

let availData = {}; // { "YYYY-MM-DD": "day"|"night"|"both" }
const AV_WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const avNow = new Date();
let avYear = avNow.getFullYear();
let avMonth = avNow.getMonth();

const renderAvail = () => {
  const grid = $("av-grid");
  const title = $("av-title");
  if (!grid) return;
  title.textContent = `${avYear} 年 ${avMonth + 1} 月`;
  grid.textContent = "";
  AV_WEEKDAYS.forEach((w) => {
    const d = document.createElement("span");
    d.className = "av-dow";
    d.textContent = w;
    grid.appendChild(d);
  });
  const first = new Date(avYear, avMonth, 1);
  const days = new Date(avYear, avMonth + 1, 0).getDate();
  const todayIso = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < first.getDay(); i++) grid.appendChild(document.createElement("span"));
  for (let d = 1; d <= days; d++) {
    const iso = `${avYear}-${String(avMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const cell = document.createElement("span");
    cell.className = "av-day";
    cell.textContent = d;
    if (iso < todayIso) {
      cell.classList.add("past");
    } else {
      const state = availData[iso];
      if (state) cell.classList.add("s-" + state);
      cell.addEventListener("click", () => {
        const order = [undefined, "day", "night", "both"];
        const next = order[(order.indexOf(availData[iso]) + 1) % order.length];
        if (next) availData[iso] = next;
        else delete availData[iso];
        renderAvail();
      });
    }
    grid.appendChild(cell);
  }
};

$("av-prev").addEventListener("click", () => {
  avMonth -= 1;
  if (avMonth < 0) { avMonth = 11; avYear -= 1; }
  renderAvail();
});
$("av-next").addEventListener("click", () => {
  avMonth += 1;
  if (avMonth > 11) { avMonth = 0; avYear += 1; }
  renderAvail();
});

const renderMySignups = (signups) => {
  const box = $("my-signups");
  const list = $("signup-list");
  list.textContent = "";
  const rows = signups.filter((s) => s.event);
  if (!rows.length) {
    box.hidden = true;
    return;
  }
  const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
  rows.forEach((s) => {
    const ev = s.event;
    const d = new Date(ev.date + "T00:00:00");
    const dateText = Number.isNaN(d.getTime()) ? ev.date : `${d.getMonth() + 1}/${d.getDate()}（週${WEEKDAYS[d.getDay()]}）`;
    const row = document.createElement("div");
    row.className = "signup-row" + (ev.past ? " past" : "");

    const t = document.createElement("p");
    t.className = "t";
    t.textContent = `${dateText} ${ev.title}　${ev.time || ""}`;
    row.appendChild(t);

    if (ev.location) {
      const loc = document.createElement("p");
      loc.className = "loc";
      loc.textContent = ev.location;
      row.appendChild(loc);
    }

    const foot = document.createElement("div");
    foot.className = "row-foot";
    const state = document.createElement("span");
    state.className = "state" + (s.paid ? " ok" : "");
    state.textContent = ev.past ? "已結束" : s.paid ? "已確認 ✓" : "已報名・費用現場繳";
    foot.appendChild(state);
    if (ev.mapUrl && !ev.past) {
      const nav = document.createElement("a");
      nav.href = ev.mapUrl;
      nav.target = "_blank";
      nav.rel = "noopener";
      nav.textContent = "開啟導航 →";
      foot.appendChild(nav);
    }
    row.appendChild(foot);
    list.appendChild(row);
  });
  box.hidden = false;
};

const loadMember = async () => {
  const res = await fetch("/api/me", { headers: lmuAuthHeaders() });
  if (!res.ok) throw new Error("載入會員資料失敗");
  const { member } = await res.json();
  fillForm(member);
  setState("member");
  try {
    const sr = await fetch("/api/me/signups", { headers: lmuAuthHeaders() });
    if (sr.ok) renderMySignups((await sr.json()).signups || []);
  } catch (err) {}
};

const saveMember = async () => {
  $("btn-save").disabled = true;
  setMsg("", true);
  try {
    const res = await fetch("/api/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...lmuAuthHeaders() },
      body: JSON.stringify({
        nickname: $("m-nickname").value.trim(),
        contact: $("m-contact").value.trim(),
        igHandle: $("m-ig").value.trim(),
        bio: $("m-bio").value.trim(),
        quickkyUrl: $("m-quickky").value.trim(),
        showOnWall: $("m-wall").checked,
        availability: availData,
      }),
    });
    const data = await res.json();
    if (res.ok && data.member) {
      setMsg("已儲存 ✓", true);
      renderQuickky(data.member.quickkyUrl);
    } else {
      setMsg(data.error || "儲存失敗，再試一次", false);
    }
  } catch (err) {
    setMsg("連線失敗，再試一次", false);
  } finally {
    $("btn-save").disabled = false;
  }
};

const init = async () => {
  const sdk = await waitForLetMeUse();
  if (!sdk) {
    setState("guest");
    return;
  }
  const sync = async (user) => {
    if (!user) {
      setState("guest");
      return;
    }
    setState("loading");
    try {
      await loadMember();
    } catch (err) {
      setState("guest");
    }
  };
  sdk.onAuthChange(sync);
  sync(sdk.user);

  $("btn-login").addEventListener("click", () => sdk.login());
  $("btn-logout").addEventListener("click", () => sdk.logout());

  // 去 Quickky 建卡：已登入就走 SSO（免重新登入），失敗退回普通連結
  const QUICKKY_APP_ID = "app_DddZG5K0";
  $("quickky-create").addEventListener("click", async (e) => {
    if (!sdk.user) return; // 未登入照普通連結走
    e.preventDefault();
    const fallback = $("quickky-create").href;
    try {
      const res = await fetch("https://letmeuse.isnowfriend.com/api/auth/sso/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + sdk.getToken() },
        body: JSON.stringify({ targetAppId: QUICKKY_APP_ID }),
      });
      const json = await res.json();
      const code = (json.data || json).code;
      if (res.ok && code) {
        window.open(
          "https://quickky.isnowfriend.com/sso#code=" + encodeURIComponent(code) + "&next=" + encodeURIComponent("/dashboard"),
          "_blank",
          "noopener"
        );
        return;
      }
    } catch (err) {}
    window.open(fallback, "_blank", "noopener");
  });
};

$("btn-save").addEventListener("click", saveMember);
init();
