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
  if (memberExpress) {
    const ev = typeof currentEvent === "function" ? currentEvent() : null;
    f = f.filter((s) => (s !== 1 || (ev && ev.poll)) && s !== 3 && s !== 4);
  }
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

const currentEvent = () =>
  eventsCache.find((e) => e.id === ((document.querySelector('input[name="eventId"]:checked') || {}).value || ""));

/* 時段投票（event.poll）：可複選，答案跟報名一起送出 */
const renderPoll = () => {
  const ev = currentEvent();
  const box = $("poll-box");
  if (!box) return;
  if (!ev || !ev.poll) { box.hidden = true; return; }
  box.hidden = false;
  $("poll-q").innerHTML = (ev.poll.question || "哪些時段你可以？") + '<span class="req-star" aria-hidden="true">*</span>（可複選）';
  const wrap = $("poll-chips");
  const kept = new Set([...wrap.querySelectorAll("input:checked")].map((c) => c.value));
  wrap.textContent = "";
  (ev.poll.options || []).forEach((opt) => {
    const label = document.createElement("label");
    label.className = "gchip";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.name = "poll-pick";
    cb.value = opt;
    cb.checked = kept.has(opt);
    label.appendChild(cb);
    label.appendChild(document.createTextNode(opt));
    wrap.appendChild(label);
  });
};

document.addEventListener("change", (e) => {
  if (e.target && e.target.name === "eventId") { computeFlow(); renderPoll(); }
});

const updateFeeBox = () => {
  const picked = (document.querySelector('input[name="eventId"]:checked') || {}).value || "";
  const ev = eventsCache.find((e) => e.id === picked);
  const fee = ev && ev.fee != null ? ev.fee : 50;
  document.getElementById("fee-num").textContent = `報名費 $${fee}`;
  document.getElementById("fee-sub").textContent =
    (ev && ev.feeNote) || (ev && ev.prepay ? "先匯款鎖定名額（報名完成會給帳號），不方便匯款現場繳也 OK" : "現場繳費就好，不用先匯款");
  const agreeTxt = document.getElementById("agree-pay-text");
  if (agreeTxt) agreeTxt.textContent = ev && ev.prepay ? "我了解報名費金額與付款方式（先匯款鎖位，或現場繳）" : "我了解活動報名費金額，當天現場繳費";
};

const applyFlow = () => {
  const step = flow[flowPos];
  if (step === 1) renderPoll();
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
    const title = document.getElementById("done-title");
    if (title && title.textContent === "報名成功！") title.textContent = `${memberNickname}，報名成功！`;
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
      const slotTxt = ev.buyoutMode
        ? (ev.buyoutMode.reached ? "　包場達成！剩最後幾位" : `　已揪 ${ev.buyoutMode.signed} 人・再 ${ev.buyoutMode.goal - ev.buyoutMode.signed} 人包場`)
        : left !== null ? `　剩 ${left} 名額` : "";
      sub.textContent = `${ev.time || ""}｜${ev.location || "地點確認中"}` + slotTxt;
      text.appendChild(title);
      text.appendChild(document.createElement("br"));
      text.appendChild(sub);

      label.appendChild(input);
      label.appendChild(text);
      box.insertBefore(label, waitlistOption);
    });

    if (preselected) {
      // 滿版場次看板（破格主視覺）；標題手寫底線用 squiggle
      const t = document.getElementById("eh-title");
      t.textContent = "";
      const sq = document.createElement("span");
      sq.className = "squiggle";
      sq.textContent = preselected.title;
      t.appendChild(sq);
      const meta = document.getElementById("eh-meta");
      meta.textContent = `${fmtDate(preselected.date)}・${preselected.time || ""}`;
      if (preselected.location) {
        meta.appendChild(document.createElement("br"));
        meta.appendChild(document.createTextNode(preselected.location));
      }
      const poster = $("eh-poster");
      if (preselected.poster) {
        poster.src = preselected.poster;
        poster.hidden = false;
        $("event-hero").classList.add("has-poster");
      } else {
        poster.hidden = true;
        $("event-hero").classList.remove("has-poster");
      }
      $("event-hero").hidden = false;
      document.body.classList.add("has-event-hero");
      skipEventStep = true;
      computeFlow();
      applyFlow();
    }
  } catch (err) {
    setMsg("活動載入失敗，可以先選「加入名單」完成報名");
  }
};

const exitPickedMode = () => {
  $("picked-banner").hidden = true;
  $("event-hero").hidden = true;
  document.body.classList.remove("has-event-hero");
  skipEventStep = false;
  flowPos = 0;
  computeFlow();
  applyFlow();
};
$("picked-change").addEventListener("click", exitPickedMode);
$("eh-change").addEventListener("click", exitPickedMode);

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
    if (member.age && !$("f-age").value) $("f-age").value = member.age;
    if (member.igHandle && !$("f-ig").value) $("f-ig").value = member.igHandle;
    memberNickname = member.nickname || "";

    // 資料齊全 → 秒報名模式（還停在流程開頭才切，避免打斷已在填的人）
    if (member.nickname && member.contact && member.age && flowPos === 0) {
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
    if (!$("f-contact").value.trim() && !$("f-phone").value.trim()) return "LINE ID 或電話至少留一個，才通知得到你";
    const age = parseInt($("f-age").value, 10);
    if (!age || age < 12 || age > 99) return "年紀填一下（12–99），我們好安排同溫層";
    const pickedEv = currentEvent();
    if (pickedEv && pickedEv.ratio && !(document.querySelector('input[name="gender"]:checked') || {}).value) {
      return "這場會平衡參加組成，性別選一下";
    }
    if (pickedEv && pickedEv.poll && !document.querySelector('input[name="poll-pick"]:checked')) {
      return "勾一下你可以的時段，我們才排得進去";
    }
  }
  if (step === 2) {
    if (!$("f-agree-pay").checked || !$("f-agree-attend").checked) return "兩個都勾一下，我們才能幫你留位子";
    // 秒報名模式跳過稱呼步，送出前補驗會員資料真的有帶到
    if (memberExpress && (!$("f-name").value.trim() || (!$("f-contact").value.trim() && !$("f-phone").value.trim()) || !parseInt($("f-age").value, 10))) {
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
        contact: $("f-contact").value.trim() || $("f-phone").value.trim(),
        phone: $("f-phone").value.trim(),
        age: parseInt($("f-age").value, 10) || 0,
        note: $("f-note").value.trim(),
        igHandle: $("f-ig").value.trim(),
        igFollowed: $("f-followed").checked,
        gender: (document.querySelector('input[name="gender"]:checked') || {}).value || "",
        picks: [...document.querySelectorAll('input[name="poll-pick"]:checked')].map((c) => c.value),
        agreedPayment: $("f-agree-pay").checked,
        agreedAttend: $("f-agree-attend").checked,
      }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      // 候補：軟文案（不透露額度機制）
      if (data.waitlisted) {
        document.getElementById("done-title").textContent = "報名收到了！";
        const sub = document.getElementById("done-sub");
        sub.innerHTML = "你的資料<strong>已經在名單上</strong>，不用重複報名。<br>";
        sub.appendChild(document.createTextNode(data.waitNote || "這場報名很熱烈，我們會依序私訊確認名額。"));
        document.getElementById("done-next-text").innerHTML = "私訊我們的 IG 說聲「我報名了」，<br>場次確定後會馬上通知你細節。";
      }
      // 重複報名：不新增資料，提示已報過並再次顯示場地
      if (data.already) {
        document.getElementById("done-title").textContent = "你早就報好了！";
        document.getElementById("done-sub").innerHTML = "這筆是你之前的報名，<strong>一直都在名單上</strong>。<br>完全不用再報一次，場地資訊在下面。";
        document.getElementById("done-next-text").innerHTML = "還沒私訊過的話，記得私訊 IG 說一聲，<br>我們確認後<strong>名額就是你的</strong>。";
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
      // 先匯款場：揭露轉帳資訊（只有報名成功才看得到）
      if (data.event && data.event.prepay) {
        const p = data.event.prepay;
        $("done-pay").hidden = false;
        $("pay-bank").textContent = p.bank || "";
        $("pay-account").textContent = p.account || "";
        $("pay-name").textContent = p.name ? "戶名：" + p.name : "";
        $("pay-copy").addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(p.account || "");
            $("pay-copy").textContent = "已複製 ✓";
            setTimeout(() => { $("pay-copy").textContent = "複製帳號"; }, 2000);
          } catch (err) {}
        });
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


/* ---------- 已報名查場地 ---------- */
document.getElementById("lu-btn").addEventListener("click", async () => {
  const box = document.getElementById("lu-result");
  box.textContent = "";
  const contact = document.getElementById("lu-contact").value.trim();
  if (!contact) return;
  try {
    const res = await fetch("/api/venue-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "查詢失敗");
    if (!(data.found || []).length) {
      const p = document.createElement("p");
      p.className = "lu-none";
      p.textContent = "查不到報名紀錄，確認一下輸入的是報名時填的聯絡方式";
      box.appendChild(p);
      return;
    }
    data.found.forEach((ev) => {
      const item = document.createElement("div");
      item.className = "lu-item";
      const t = document.createElement("p");
      t.innerHTML = "<strong>" + fmtDate(ev.date) + " " + ev.title + "</strong>　" + (ev.time || "");
      item.appendChild(t);
      const loc = document.createElement("p");
      loc.textContent = ev.location || "場地確認中，確定後會通知";
      item.appendChild(loc);
      if (ev.mapUrl) {
        const a = document.createElement("a");
        a.href = ev.mapUrl;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "開啟導航 →";
        item.appendChild(a);
      }
      box.appendChild(item);
    });
  } catch (err) {
    const p = document.createElement("p");
    p.className = "lu-none";
    p.textContent = err.message;
    box.appendChild(p);
  }
});
