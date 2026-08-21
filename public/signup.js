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
    $("btn-next").textContent = step === STEP_COUNT - 1 ? "送出報名 🥤" : "下一步 →";
  }
  setMsg("");
};

/* ---------- 場次選項 ---------- */

const loadEvents = async () => {
  try {
    const res = await fetch("/api/events");
    const { events = [] } = await res.json();
    const box = $("event-choices");
    const preselect = new URLSearchParams(location.search).get("event") || "";

    events.forEach((ev) => {
      const left = ev.capacity ? Math.max(0, ev.capacity - (ev.signedUp || 0)) : null;
      const isFull = ev.status === "closed" || (left !== null && left <= 0);
      if (isFull) return;

      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "eventId";
      input.value = ev.id;
      if (ev.id === preselect) input.checked = true;

      const text = document.createElement("span");
      const title = document.createElement("span");
      title.className = "t";
      title.textContent = `${fmtDate(ev.date)} ${ev.title}`;
      const sub = document.createElement("span");
      sub.className = "s";
      sub.textContent = `🕐 ${ev.time || ""}　📍 ${ev.location || ""}` + (left !== null ? `　剩 ${left} 名額` : "");
      text.appendChild(title);
      text.appendChild(document.createElement("br"));
      text.appendChild(sub);

      label.appendChild(input);
      label.appendChild(text);
      box.insertBefore(label, box.firstChild);
    });
  } catch (err) {
    setMsg("活動載入失敗，可以先選「加入名單」完成報名 🙏");
  }
};

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
      show("done");
    } else {
      setMsg(data.error || "送出失敗，再試一次");
    }
  } catch (err) {
    setMsg("連線失敗，再試一次 🙏");
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
