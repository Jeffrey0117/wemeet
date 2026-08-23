// 報名問卷：一題一步，最後送 POST /api/signup
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const STEP_COUNT = 5;
let current = 0;

const $ = (id) => document.getElementById(id);
const steps = [...document.querySelectorAll(".step")];

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

const show = (step) => {
  steps.forEach((s) => s.classList.toggle("on", s.dataset.step === String(step)));
  const dots = [...$("progress").children];
  dots.forEach((d, i) => d.classList.toggle("on", step === "done" || i <= step));
  const done = step === "done";
  $("quiz-nav").hidden = done;
  if (!done) {
    $("btn-prev").hidden = step === 0;
    $("btn-next").textContent = step === STEP_COUNT - 1 ? "送出報名" : "下一步 →";
  }
  setMsg("");
};

/* ---------- 場次選項 ---------- */

const loadEvents = async () => {
  try {
    const res = await fetch("/api/events");
    const { events = [] } = await res.json();
    const box = $("event-choices");
    const waitlistOption = box.firstElementChild; // 「先加入名單」固定墊底
    const preselect = new URLSearchParams(location.search).get("event") || "";
    let preselected = null;

    // API 已按日期升冪，逐一插在名單選項前 → 日期近的在最上面
    events.forEach((ev) => {
      if (ev.past) return; // 歷史場次不開放報名
      const left = ev.capacity ? Math.max(0, ev.capacity - (ev.signedUp || 0)) : null;
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

    // 首頁點了特定場次進來 → 跳過選場次，直接從暱稱那步開始
    if (preselected) {
      $("picked-text").textContent = `報名場次：${fmtDate(preselected.date)} ${preselected.title}`;
      $("picked-banner").hidden = false;
      current = 1;
      show(1);
    }
  } catch (err) {
    setMsg("活動載入失敗，可以先選「加入名單」完成報名");
  }
};

document.getElementById("picked-change").addEventListener("click", () => {
  $("picked-banner").hidden = true;
  current = 0;
  show(0);
});

/* ---------- 驗證與送出 ---------- */

const validate = (step) => {
  if (step === 1) {
    if (!$("f-name").value.trim()) return "暱稱要填喔，不然不知道怎麼叫你";
    if (!$("f-contact").value.trim()) return "留個 LINE ID 或電話，才通知得到你";
  }
  if (step === 2) {
    if (!$("f-agree-pay").checked || !$("f-agree-attend").checked) return "兩個都勾一下，我們才能幫你留位子";
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
        agreedPayment: $("f-agree-pay").checked,
        agreedAttend: $("f-agree-attend").checked,
      }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
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
      show("done");
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
  const problem = validate(current);
  if (problem) {
    setMsg(problem);
    return;
  }
  if (current === STEP_COUNT - 1) {
    submit();
    return;
  }
  current += 1;
  show(current);
});

$("btn-prev").addEventListener("click", () => {
  current = Math.max(0, current - 1);
  show(current);
});

// 已登入會員自動預填（欄位有值就不覆蓋）
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
  } catch (err) {}
};

show(0);
loadEvents();
prefillFromMember();
