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
  renderQuickky(member.quickkyUrl);
};

const loadMember = async () => {
  const res = await fetch("/api/me", { headers: lmuAuthHeaders() });
  if (!res.ok) throw new Error("載入會員資料失敗");
  const { member } = await res.json();
  fillForm(member);
  setState("member");
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
    setMsg("連線失敗，再試一次 🙏", false);
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
};

$("btn-save").addEventListener("click", saveMember);
init();
