/* لوحة الإشراف: تسجيل دخول المشرفة عبر Supabase Auth، ومراجعة المشاركات */
(() => {
  const API = window.WataniAPI, {ROLES, KINDS, esc} = API;
  const $ = id => document.getElementById(id);
  const PAGE = 30, KEY = "watani-admin-session";
  let session = null, status = "pending", offset = 0, rows = [];

  const toast = t => { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2600); };
  const fullDate = iso => { try { return new Intl.DateTimeFormat("ar-u-ca-gregory", {day: "numeric", month: "long", hour: "numeric", minute: "2-digit"}).format(new Date(iso)); } catch (_) { return ""; } };

  if (!API.ready) { $("setup").hidden = false; return; }

  /* ---------- الجلسة ---------- */
  function saveSession(s) {
    session = s ? {access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || (Math.floor(Date.now() / 1000) + (s.expires_in || 3600)), email: (s.user && s.user.email) || (session && session.email)} : null;
    try { session ? sessionStorage.setItem(KEY, JSON.stringify(session)) : sessionStorage.removeItem(KEY); } catch (_) {}
  }
  async function token() {
    if (!session) throw {status: 401};
    if (session.expires_at - 60 < Date.now() / 1000) {
      try { saveSession(await API.auth("token?grant_type=refresh_token", {refresh_token: session.refresh_token})); }
      catch (e) { saveSession(null); showLogin("انتهت الجلسة، سجّلي الدخول مرة أخرى."); throw e; }
    }
    return session.access_token;
  }
  async function call(path, opt) {
    opt = Object.assign({}, opt, {token: await token()});
    try { return await API.rest(path, opt); }
    catch (e) { if (e.status === 401) { saveSession(null); showLogin("انتهت الجلسة، سجّلي الدخول مرة أخرى."); } throw e; }
  }

  function showLogin(m) {
    $("panel").hidden = true; $("logout").hidden = true; $("login").hidden = false;
    $("loginMsg").textContent = m || ""; $("loginMsg").className = "msg" + (m ? " err" : "");
  }
  async function enter() {
    const {data} = await call("rpc/is_admin", {method: "POST", body: {}});
    if (data !== true) {
      await logout(true);
      showLogin("هذا الحساب ليس ضمن المشرفات. أضيفي بريده في جدول admins.");
      return;
    }
    $("login").hidden = true; $("panel").hidden = false; $("logout").hidden = false;
    load(true); counts();
  }

  $("login").addEventListener("submit", async ev => {
    ev.preventDefault();
    const email = $("email").value.trim(), password = $("password").value, m = $("loginMsg"), b = $("loginBtn");
    if (!email || !password) { m.textContent = "اكتبي البريد وكلمة المرور."; m.className = "msg err"; return; }
    b.disabled = true; m.textContent = "جاري الدخول…"; m.className = "msg";
    try {
      saveSession(await API.auth("token?grant_type=password", {email, password}));
      $("password").value = "";
      await enter();
    } catch (e) {
      m.textContent = (e && (e.status === 400 || e.code === "invalid_credentials")) ? "البريد أو كلمة المرور غير صحيحة." : "تعذّر الدخول الآن. تحققي من الاتصال وحاولي مرة أخرى.";
      m.className = "msg err";
    }
    b.disabled = false;
  });

  async function logout(silent) {
    try { if (session) await API.auth("logout", {}, session.access_token); } catch (_) {}
    saveSession(null);
    if (!silent) showLogin("");
  }
  $("logout").addEventListener("click", () => logout(false));

  /* ---------- القائمة ---------- */
  function item(p) {
    const r = ROLES[p.role] ? p.role : "visitor", kind = p.media_kind || "text";
    let media = "";
    if (p.media_path) {
      const url = esc(API.publicUrl(p.media_path));
      media = kind === "video"
        ? `<div class="m"><video src="${url}#t=0.1" controls playsinline preload="metadata"></video></div>`
        : `<div class="m"><a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${KINDS[kind]} من ${esc(p.name)}" loading="lazy"></a></div>`;
    }
    const consent = p.media_path ? (p.consent ? '<span class="chip c-ok">أُقرّت موافقة ولي الأمر</span>' : '<span class="chip c-no">بلا إقرار موافقة</span>') : "";
    const acts = {
      pending:  `<button class="btn primary" data-act="approved">موافقة ونشر</button><button class="btn warn" data-act="rejected">رفض</button>`,
      approved: `<button class="btn warn" data-act="rejected">إخفاء من الحائط</button>`,
      rejected: `<button class="btn primary" data-act="approved">نشر</button>`
    }[p.status] + `<button class="btn danger" data-act="delete">حذف نهائي</button>`;
    return `<article class="item" data-role="${r}" data-id="${esc(p.id)}">
      ${media}
      ${p.message ? `<p class="t">${esc(p.message)}</p>` : ""}
      <div class="meta"><b>${esc(p.name)}</b><span class="chip">${ROLES[r].one}</span><span class="chip">${KINDS[kind]}</span>${consent}</div>
      <div class="meta"><span>${fullDate(p.created_at)}</span>${p.status === "approved" ? `<span>❤ ${p.likes}</span>` : ""}</div>
      <div class="acts">${acts}</div>
    </article>`;
  }

  async function counts() {
    try { const {count} = await call("posts?select=id&status=eq.pending&limit=1", {prefer: "count=exact"}); $("nPending").textContent = count || 0; $("nPending").hidden = !count; } catch (_) {}
  }

  async function load(reset) {
    const list = $("list");
    if (reset) { offset = 0; rows = []; list.innerHTML = '<p class="empty">جاري التحميل…</p>'; }
    try {
      const order = status === "pending" ? "created_at.asc" : "created_at.desc";
      const {data, count} = await call(`posts?select=*&status=eq.${status}&order=${order}&limit=${PAGE}&offset=${offset}`, {prefer: "count=exact"});
      if (reset) list.innerHTML = "";
      rows = rows.concat(data); offset += data.length;
      if (!rows.length) {
        list.innerHTML = `<p class="empty"><b>${{pending: "لا توجد مشاركات بانتظار المراجعة", approved: "لا توجد مشاركات منشورة بعد", rejected: "لا توجد مشاركات مرفوضة"}[status]}</b>${status === "pending" ? "ستظهر هنا المشاركات الجديدة فور إرسالها." : ""}</p>`;
      } else list.insertAdjacentHTML("beforeend", data.map(item).join(""));
      $("more").hidden = !(count != null && offset < count);
    } catch (e) { if (e.status !== 401) list.innerHTML = '<p class="empty"><b>تعذّر التحميل</b>تحققي من الاتصال ثم حدّثي الصفحة.</p>'; }
  }
  $("more").addEventListener("click", () => load(false));

  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.setAttribute("aria-selected", String(x === t)));
    status = t.dataset.status; load(true);
  }));

  $("list").addEventListener("click", async ev => {
    const b = ev.target.closest("[data-act]"); if (!b) return;
    const card = b.closest(".item"), id = card.dataset.id, p = rows.find(r => r.id === id), act = b.dataset.act;
    if (act === "delete") {
      if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "تأكيد الحذف؟ لا يمكن التراجع"; setTimeout(() => { if (b.isConnected) { b.dataset.sure = ""; b.textContent = "حذف نهائي"; } }, 4000); return; }
    }
    card.querySelectorAll("button").forEach(x => x.disabled = true);
    try {
      if (act === "delete") {
        if (p && p.media_path) { try { await API.removeFiles([p.media_path], await token()); } catch (_) {} }
        await call("posts?id=eq." + id, {method: "DELETE", prefer: "return=minimal"});
        toast("حُذفت المشاركة نهائيًا");
      } else {
        await call("posts?id=eq." + id, {method: "PATCH", body: {status: act, reviewed_at: new Date().toISOString()}, prefer: "return=minimal"});
        toast(act === "approved" ? "نُشرت المشاركة على الحائط" : status === "approved" ? "أُخفيت المشاركة من الحائط" : "رُفضت المشاركة");
      }
      rows = rows.filter(r => r.id !== id); offset = Math.max(0, offset - 1);
      card.remove();
      if (!rows.length) load(true);
      counts();
    } catch (e) {
      if (e.status !== 401) toast("تعذّر تنفيذ العملية، حاولي مرة أخرى");
      card.querySelectorAll("button").forEach(x => x.disabled = false);
    }
  });

  /* تحديث تلقائي لعدد المشاركات الجديدة */
  setInterval(() => { if (session && !document.hidden) { counts(); } }, 60000);

  try { session = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (_) {}
  if (session) enter().catch(() => showLogin("")); else showLogin("");
})();
