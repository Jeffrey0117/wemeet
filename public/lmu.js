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
