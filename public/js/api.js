const Api = (() => {
  function token() { return localStorage.getItem('optima_token'); }
  function setSession(data) {
    localStorage.setItem('optima_token', data.token);
    localStorage.setItem('optima_role', data.role);
  }
  function clearSession() {
    localStorage.removeItem('optima_token');
    localStorage.removeItem('optima_role');
  }
  function role() { return localStorage.getItem('optima_role'); }

  async function req(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    const t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (res.status === 401) {
      clearSession();
      if (!location.pathname.endsWith('login.html')) location.href = 'login.html';
    }
    if (!res.ok) throw new Error((data && data.error) || `خطأ (${res.status})`);
    return data;
  }

  return {
    get: (url) => req('GET', url),
    post: (url, body) => req('POST', url, body),
    put: (url, body) => req('PUT', url, body),
    del: (url) => req('DELETE', url),
    token, setSession, clearSession, role,
  };
})();

function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return alert(msg);
  el.textContent = msg;
  el.className = 'show ' + type;
  setTimeout(() => { el.className = ''; }, 3200);
}

function requireRole(expected) {
  const t = Api.token();
  if (!t || Api.role() !== expected) {
    location.href = 'login.html';
    return false;
  }
  return true;
}

function tickClock() {
  const clk = document.getElementById('clk');
  const dt = document.getElementById('dt');
  if (!clk) return;
  const n = new Date();
  clk.textContent = n.toLocaleTimeString('ar-EG');
  if (dt) dt.textContent = n.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
setInterval(tickClock, 1000);
document.addEventListener('DOMContentLoaded', tickClock);
