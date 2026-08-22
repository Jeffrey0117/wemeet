// LetMeUse SDK 小工具（各頁共用）
const waitForLetMeUse = () =>
  new Promise((resolve) => {
    if (window.letmeuse && window.letmeuse.ready) return resolve(window.letmeuse);
    const check = setInterval(() => {
      if (window.letmeuse && window.letmeuse.ready) {
        clearInterval(check);
        resolve(window.letmeuse);
      }
    }, 100);
    setTimeout(() => {
      clearInterval(check);
      resolve(window.letmeuse || null);
    }, 5000);
  });

const lmuAuthHeaders = () => {
  const sdk = window.letmeuse;
  const token = sdk && sdk.user && sdk.getToken();
  return token ? { Authorization: "Bearer " + token } : {};
};

/* ---------- nav 右上角登入狀態（頭貼 + 下拉選單） ---------- */

const initNavAuth = async () => {
  const slot = document.getElementById("nav-auth");
  if (!slot) return;
  const sdk = await waitForLetMeUse();

  const render = (user) => {
    slot.textContent = "";
    if (!user) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nav-login";
      btn.textContent = "登入";
      btn.addEventListener("click", () => (sdk ? sdk.login() : (location.href = "/me")));
      slot.appendChild(btn);
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "nav-user";

    let avatar;
    if (user.avatar) {
      avatar = document.createElement("img");
      avatar.src = user.avatar;
      avatar.alt = user.name || "me";
    } else {
      avatar = document.createElement("span");
      avatar.textContent = (user.name || "?").slice(0, 1);
    }
    avatar.className = "nav-avatar";
    avatar.addEventListener("click", () => wrap.classList.toggle("open"));

    // 會員資料有 quickky 頭貼／暱稱就升級顯示
    fetch("/api/me", { headers: lmuAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const m = d && d.member;
        if (!m) return;
        if (m.quickkyAvatar) {
          const img = document.createElement("img");
          img.src = m.quickkyAvatar;
          img.alt = m.nickname || "me";
          img.className = "nav-avatar";
          img.addEventListener("click", () => wrap.classList.toggle("open"));
          wrap.replaceChild(img, wrap.firstChild);
        } else if (avatar.tagName === "SPAN" && m.nickname) {
          avatar.textContent = m.nickname.slice(0, 1);
        }
      })
      .catch(() => {});

    const menu = document.createElement("div");
    menu.className = "nav-menu";
    const meLink = document.createElement("a");
    meLink.href = "/me";
    meLink.textContent = "會員中心";
    const logout = document.createElement("button");
    logout.type = "button";
    logout.textContent = "登出";
    logout.addEventListener("click", () => sdk.logout());
    menu.appendChild(meLink);
    menu.appendChild(logout);

    wrap.appendChild(avatar);
    wrap.appendChild(menu);
    slot.appendChild(wrap);
  };

  document.addEventListener("click", (e) => {
    const wrap = slot.querySelector(".nav-user");
    if (wrap && !wrap.contains(e.target)) wrap.classList.remove("open");
  });

  if (!sdk) {
    render(null);
    return;
  }
  sdk.onAuthChange(render);
  render(sdk.user);
};

initNavAuth();
