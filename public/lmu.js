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

/* ---------- nav 右上角登入狀態（頭貼 + 下拉選單） ----------
   體驗策略：上次的登入狀態存 localStorage → 頁面一載入立刻畫（零等待、不閃問號），
   SDK 與 /api/me 回來後靜默校正，畫面只在真的有差異時才重繪。 */

const NAV_CACHE_KEY = "wemeet_nav";

const readNavCache = () => {
  try {
    return JSON.parse(localStorage.getItem(NAV_CACHE_KEY) || "null");
  } catch (err) {
    return null;
  }
};

const writeNavCache = (obj) => {
  try {
    localStorage.setItem(NAV_CACHE_KEY, JSON.stringify(obj));
  } catch (err) {}
};

const initNavAuth = () => {
  const slot = document.getElementById("nav-auth");
  if (!slot) return;
  let rendered = "";

  const render = (state) => {
    const sig = JSON.stringify(state);
    if (sig === rendered) return;
    rendered = sig;
    slot.textContent = "";

    if (!state.loggedIn) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nav-login";
      btn.textContent = "登入";
      btn.addEventListener("click", () => (window.letmeuse ? window.letmeuse.login() : (location.href = "/me")));
      slot.appendChild(btn);
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "nav-user";

    // 通知鈴鐺（報名成功/匯款確認/新場次）
    const bell = document.createElement("button");
    bell.type = "button";
    bell.className = "nav-bell";
    bell.setAttribute("aria-label", "通知");
    bell.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="19" height="19" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.41 5.956-2.737 7.326"/></svg>' +
      '<span class="bell-badge" hidden></span>';
    const noticeMenu = document.createElement("div");
    noticeMenu.className = "notice-menu";
    let noticesData = [];
    const badgeEl = () => bell.querySelector(".bell-badge");

    fetch("/api/me/notices", { headers: lmuAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        noticesData = d.notices || [];
        if (d.unread > 0) {
          badgeEl().textContent = d.unread > 9 ? "9+" : String(d.unread);
          badgeEl().hidden = false;
        }
      })
      .catch(() => {});

    bell.addEventListener("click", () => {
      wrap.classList.remove("open");
      const opening = !wrap.classList.contains("notices-open");
      wrap.classList.toggle("notices-open");
      if (!opening) return;
      noticeMenu.textContent = "";
      if (!noticesData.length) {
        const p = document.createElement("p");
        p.className = "notice-empty";
        p.textContent = "還沒有通知";
        noticeMenu.appendChild(p);
      }
      noticesData.forEach((n) => {
        const item = document.createElement("div");
        item.className = "notice-item";
        const t = document.createElement("strong");
        t.textContent = n.title;
        const b = document.createElement("p");
        b.textContent = n.body || "";
        const time = document.createElement("span");
        time.textContent = String(n.createdAt).slice(0, 10);
        item.appendChild(t);
        item.appendChild(b);
        item.appendChild(time);
        noticeMenu.appendChild(item);
      });
      badgeEl().hidden = true;
      fetch("/api/me/notices/seen", { method: "POST", headers: lmuAuthHeaders() }).catch(() => {});
    });

    let avatar;
    if (state.avatar) {
      avatar = document.createElement("img");
      avatar.src = state.avatar;
      avatar.alt = "";
    } else {
      avatar = document.createElement("span");
      if (state.letter) avatar.textContent = state.letter;
      else avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>';
    }
    avatar.className = "nav-avatar";
    avatar.addEventListener("click", () => {
      wrap.classList.remove("notices-open");
      wrap.classList.toggle("open");
    });

    const menu = document.createElement("div");
    menu.className = "nav-menu";
    const meLink = document.createElement("a");
    meLink.href = "/me";
    meLink.textContent = "會員中心";
    const logout = document.createElement("button");
    logout.type = "button";
    logout.textContent = "登出";
    logout.addEventListener("click", () => {
      writeNavCache({ loggedIn: false });
      if (window.letmeuse) window.letmeuse.logout();
    });
    menu.appendChild(meLink);
    menu.appendChild(logout);
    wrap.appendChild(bell);
    wrap.appendChild(avatar);
    wrap.appendChild(menu);
    wrap.appendChild(noticeMenu);
    slot.appendChild(wrap);
  };

  document.addEventListener("click", (e) => {
    const wrap = slot.querySelector(".nav-user");
    if (wrap && !wrap.contains(e.target)) {
      wrap.classList.remove("open");
      wrap.classList.remove("notices-open");
    }
  });

  // 1) 快取先上畫面，零等待
  const cached = readNavCache();
  if (cached) render(cached);

  // 2) SDK 就緒後校正真實狀態
  waitForLetMeUse().then((sdk) => {
    if (!sdk) {
      if (!cached) render({ loggedIn: false });
      return;
    }
    const sync = async (user) => {
      if (!user) {
        writeNavCache({ loggedIn: false });
        render({ loggedIn: false });
        return;
      }
      // 沒快取才先用 SDK 資料墊著；有快取就等 /api/me 一次到位，避免中間態閃爍
      if (!cached || !cached.loggedIn) {
        render({ loggedIn: true, avatar: user.avatar || "", letter: (user.name || "").slice(0, 1) });
      }
      let state = { loggedIn: true, avatar: user.avatar || "", letter: (user.name || "").slice(0, 1) };
      try {
        const res = await fetch("/api/me", { headers: lmuAuthHeaders() });
        if (res.ok) {
          const { member } = await res.json();
          state = {
            loggedIn: true,
            avatar: member.quickkyAvatar || user.avatar || "",
            letter: (member.nickname || user.name || "").slice(0, 1),
          };
        }
      } catch (err) {}
      writeNavCache(state);
      render(state);
    };
    sdk.onAuthChange(sync);
    sync(sdk.user);
  });
};

initNavAuth();
