// 報名問卷：動態步驟流程
// 完整流程 [0選場次, 1稱呼, 2須知, 3IG, 4想說的話]
// 帶場次進來 → 跳過 0；會員資料齊全 → 跳過 1/3/4（會員秒報名：勾須知就送出）
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const ALL_STEPS = [0, 1, 2, 3, 4];

const $ = (id) => document.getElementById(id);
const steps = [...document.querySelectorAll(".step")];

let flow = [...ALL_STEPS];
let flowPos = 0;
let skipEventStep = false; // 帶 ?event= 進來且有效
let memberExpress = false; // 會員資料齊全
let memberNickname = "";

const fmtDate = (iso) => {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}（週${WEEKDAYS[d.getDay()]}）`;
};

const setMsg = (text) => {
  const node = $("quiz-msg");
  node.textContent = text;
  node.className = "quiz-msg" + (text ? " err" : "");
};

const computeFlow = () => {
  let f = [...ALL_STEPS];
  if (skipEventStep) f = f.filter((s) => s !== 0);
  if (memberExpress) f = f.filter((s) => s !== 1 && s !== 3 && s !== 4);
  flow = f;
  if (flowPos >= flow.length) flowPos = flow.length - 1;
};

const renderProgress = (done) => {
  const dots = [...$("progress").children];
  dots.forEach((d, i) => {
    const idx = flow.indexOf(i);
    d.style.display = idx === -1 ? "none" : "";
    d.classList.toggle("on", done || (idx !== -1 && idx <= flowPos));
  });
};

let eventsCache = [];

const updateFeeBox = () => {
  const picked = (document.querySelector('input[name="eventId"]:checked') || {}).value || "";
  const ev = eventsCache.find((e) => e.id === picked);
  const fee = ev && ev.fee != null ? ev.fee : 50;
  document.getElementById("fee-num").textContent = `報名費 $${fee}`;
  document.getElementById("fee-sub").textContent = (ev && ev.feeNote) || "現場繳費就好，不用先匯款";
};

const applyFlow = () => {
  const step = flow[flowPos];
  if (step === 2) updateFeeBox();
  steps.forEach((s) => s.classList.toggle("on", s.dataset.step === String(step)));
  renderProgress(false);
  $("quiz-nav").hidden = false;
  $("btn-prev").hidden = flowPos === 0;
  $("btn-next").textContent = flowPos === flow.length - 1 ? "送出報名" : "下一步 →";
  setMsg("");
};

const showDone = () => {
  steps.forEach((s) => s.classList.toggle("on", s.dataset.step === "done"));
  renderProgress(true);
  $("quiz-nav").hidden = true;
  // 會員用暱稱打招呼，秒報名的爽感收尾
  if (memberNickname) {
    const title = document.querySelector('[data-step="done"] h2');
    if (title) title.textContent = `${memberNickname}，搞定！`;
  }
  setMsg("");
};

/* ---------- 場次選項 ---------- */

const loadEvents = async () => {
  try {
    const res = await fetch("/api/events");
    const { events = [] } = await res.json();
    eventsCache = events;
    const box = $("event-choices");
    const waitlistOption = box.firstElementChild; // 「先加入名單」固定墊底
    const preselect = new URLSearchParams(location.search).get("event") || "";
    let preselected = null;

    // API 已按日期升冪，逐一插在名單選項前 → 日期近的在最上面
    events.forEach((ev) => {
      if (ev.past) return;
      const left = ev.left != null ? ev.left : (!ev.hideCount && ev.capacity ? Math.max(0, ev.capacity - (ev.signedUp || 0)) : null);
      const isFull = ev.status === "closed" || (left !== null && left <= 0);
      if (isFull) return;

      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "eventId";
      input.value = ev.id;
      if (ev.id === preselect) {
        input.checked = true;
        preselected = ev;
      }

      const text = document.createElement("span");
      const title = document.createElement("span");
      title.className = "t";
      title.textContent = `${fmtDate(ev.date)} ${ev.title}`;
      const sub = document.createElement("span");
      sub.className = "s";
      sub.textContent = `${ev.time || ""}｜詳細地點報名後解鎖` + (left !== null ? `　剩 ${left} 名額` : "");
      text.appendChild(title);
      text.appendChild(document.createElement("br"));
      text.appendChild(sub);

      label.appendChild(input);
      label.appendChild(text);
      box.insertBefore(label, waitlistOption);
    });

    if (preselected) {
      $("picked-text").textContent = `報名場次：${fmtDate(preselected.date)} ${preselected.title}`;
      $("picked-banner").hidden = false;
      skipEventStep = true;
      computeFlow();
      applyFlow();
    }
  } catch (err) {
    setMsg("活動載入失敗，可以先選「加入名單」完成報名");
  }
};

$("picked-change").addEventListener("click", () => {
  $("picked-banner").hidden = true;
  skipEventStep = false;
  flowPos = 0;
  computeFlow();
  applyFlow();
});

/* ---------- 會員秒報名 ---------- */

const prefillFromMember = async () => {
  const sdk = await waitForLetMeUse();
  if (!sdk || !sdk.user) return;
  try {
    const res = await fetch("/api/me", { headers: lmuAuthHeaders() });
    if (!res.ok) return;
    const { member } = await res.json();
    if (member.nickname && !$("f-name").value) $("f-name").value = member.nickname;
    if (member.contact && !$("f-contact").value) $("f-contact").value = member.contact;
    if (member.igHandle && !$("f-ig").value) $("f-ig").value = member.igHandle;
    memberNickname = member.nickname || "";

    // 資料齊全 → 秒報名模式（還停在流程開頭才切，避免打斷已在填的人）
    if (member.nickname && member.contact && flowPos === 0) {
      memberExpress = true;
      $("express-banner").hidden = false;
      computeFlow();
      applyFlow();
    }
  } catch (err) {}
};

$("express-off").addEventListener("click", () => {
  $("express-banner").hidden = true;
  memberExpress = false;
  flowPos = 0;
  computeFlow();
  applyFlow();
});

/* ---------- 驗證與送出 ---------- */

const validate = (step) => {
  if (step === 1) {
    if (!$("f-name").value.trim()) return "暱稱要填喔，不然不知道怎麼叫你";
    if (!$("f-contact").value.trim()) return "留個 LINE ID 或電話，才通知得到你";
    const pickedEv = eventsCache.find((e) => e.id === ((document.querySelector('input[name="eventId"]:checked') || {}).value || ""));
    if (pickedEv && pickedEv.ratio && !(document.querySelector('input[name="gender"]:checked') || {}).value) {
      return "這場會平衡參加組成，性別選一下";
    }
  }
  if (step === 2) {
    if (!$("f-agree-pay").checked || !$("f-agree-attend").checked) return "兩個都勾一下，我們才能幫你留位子";
    // 秒報名模式跳過稱呼步，送出前補驗會員資料真的有帶到
    if (memberExpress && (!$("f-name").value.trim() || !$("f-contact").value.trim())) {
      return "會員資料沒帶齊，請改用完整流程填寫";
    }
  }
  return "";
};

const submit = async () => {
  const btn = $("btn-next");
  btn.disabled = true;
  setMsg("");
  try {
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...lmuAuthHeaders() },
      body: JSON.stringify({
        eventId: (document.querySelector('input[name="eventId"]:checked') || {}).value || "",
        name: $("f-name").value.trim(),
        contact: $("f-contact").value.trim(),
        note: $("f-note").value.trim(),
        igHandle: $("f-ig").value.trim(),
        igFollowed: $("f-followed").checked,
        gender: (document.querySelector('input[name="gender"]:checked') || {}).value || "",
        agreedPayment: $("f-agree-pay").checked,
        agreedAttend: $("f-agree-attend").checked,
      }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      // 候補：軟文案（不透露額度機制）
      if (data.waitlisted) {
        const doneEl = document.querySelector('[data-step="done"]');
        const title = doneEl.querySelector("h2");
        if (title) title.textContent = "報名收到了！";
        const firstP = doneEl.querySelector("p");
        if (firstP) firstP.innerHTML = "這場報名很熱烈，我們會<strong>依序私訊確認名額</strong>。<br>先私訊 IG 跟我們說一聲，確認後會通知你場地細節。";
      }
      // 重複報名：不新增資料，提示已報過並再次顯示場地
      if (data.already) {
        const doneEl = document.querySelector('[data-step="done"]');
        const title = doneEl.querySelector("h2");
        if (title) title.textContent = "你已經報名過這場了！";
        const firstP = doneEl.querySelector("p");
        if (firstP) firstP.innerHTML = "不用重複報名，場地資訊在下面。<br>還沒私訊過的話，記得<strong>私訊 IG 跟我們說一聲</strong>。";
      }
      // 報名成功揭露場地：顯示地點與導航
      if (data.event && (data.event.location || data.event.mapUrl)) {
        const ev = data.event;
        $("done-venue").hidden = false;
        $("venue-title").textContent = `${fmtDate(ev.date)} ${ev.title}　${ev.time || ""}`;
        $("venue-loc").textContent = ev.location || "";
        if (ev.mapUrl) {
          $("venue-nav").hidden = false;
          $("venue-nav").href = ev.mapUrl;
        }
      }
      // 報名成功的即時回饋：鈴鐺紅點立刻亮、完成頁給「看我的報名」入口
      const loggedIn = !!(window.letmeuse && window.letmeuse.user);
      if (loggedIn && window.__wemeetBellRefresh) setTimeout(window.__wemeetBellRefresh, 600);
      $("done-track-member").hidden = !loggedIn;
      $("done-track-guest").hidden = loggedIn;
      showDone();
    } else {
      setMsg(data.error || "送出失敗，再試一次");
    }
  } catch (err) {
    setMsg("連線失敗，再試一次");
  } finally {
    btn.disabled = false;
  }
};

$("btn-next").addEventListener("click", () => {
  const problem = validate(flow[flowPos]);
  if (problem) {
    setMsg(problem);
    return;
  }
  if (flowPos === flow.length - 1) {
    submit();
    return;
  }
  flowPos += 1;
  applyFlow();
});

$("btn-prev").addEventListener("click", () => {
  flowPos = Math.max(0, flowPos - 1);
  applyFlow();
});

applyFlow();
loadEvents();
prefillFromMember();
