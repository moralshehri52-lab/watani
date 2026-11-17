/* اتصال مشترك بقاعدة بيانات Supabase (REST) — يستخدمه الحائط ولوحة الإشراف */
(function () {
  const C = window.WATANI_CONFIG || {};
  const BASE = String(C.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const KEY = String(C.SUPABASE_KEY || "").trim();
  const ready = /^(https:\/\/[^/]+|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)$/.test(BASE) && KEY.length > 20 && !/^sb_secret_/.test(KEY);

  /* المفاتيح الجديدة (sb_publishable_) تُرسل في apikey فقط؛ المفتاح القديم (JWT) يُرسل أيضًا كـ Bearer */
  function headers(token, extra) {
    const h = {apikey: KEY};
    const bearer = token || (KEY.startsWith("eyJ") ? KEY : null);
    if (bearer) h.Authorization = "Bearer " + bearer;
    return Object.assign(h, extra || {});
  }

  async function fail(r) {
    let e = {};
    try { e = await r.json(); } catch (_) {}
    const err = new Error(e.message || e.msg || e.error_description || e.error || ("HTTP " + r.status));
    err.status = r.status; err.code = e.code || e.error_code || e.error;
    return err;
  }

  async function rest(path, opt) {
    opt = opt || {};
    const h = headers(opt.token, opt.headers);
    if (opt.body !== undefined) h["Content-Type"] = "application/json";
    if (opt.prefer) h.Prefer = opt.prefer;
    const r = await fetch(BASE + "/rest/v1/" + path, {method: opt.method || "GET", headers: h, body: opt.body === undefined ? undefined : JSON.stringify(opt.body)});
    if (!r.ok) throw await fail(r);
    const txt = await r.text();
    const range = r.headers.get("content-range") || "";
    const total = range.includes("/") ? parseInt(range.split("/")[1], 10) : NaN;
    return {data: txt ? JSON.parse(txt) : null, count: isNaN(total) ? null : total};
  }

  function upload(path, blob, onProgress, token) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("POST", BASE + "/storage/v1/object/media/" + path);
      const h = headers(token, {"Content-Type": blob.type || "application/octet-stream", "x-upsert": "false"});
      for (const k in h) x.setRequestHeader(k, h[k]);
      if (x.upload && onProgress) x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      x.onload = () => {
        if (x.status >= 200 && x.status < 300) return resolve();
        let msg = ""; try { msg = JSON.parse(x.responseText).message || ""; } catch (_) {}
        reject(Object.assign(new Error(msg || ("upload " + x.status)), {status: x.status}));
      };
      x.onerror = () => reject(Object.assign(new Error("network"), {status: 0}));
      x.send(blob);
    });
  }

  async function removeFiles(paths, token) {
    const r = await fetch(BASE + "/storage/v1/object/media", {method: "DELETE", headers: headers(token, {"Content-Type": "application/json"}), body: JSON.stringify({prefixes: paths})});
    if (!r.ok) throw await fail(r);
  }

  async function auth(path, body, token) {
    const r = await fetch(BASE + "/auth/v1/" + path, {method: "POST", headers: headers(token, {"Content-Type": "application/json"}), body: JSON.stringify(body || {})});
    if (!r.ok) throw await fail(r);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }

  const publicUrl = p => BASE + "/storage/v1/object/public/media/" + String(p).split("/").map(encodeURIComponent).join("/");

  const ROLES = {
    child:     {one: "طفل",          many: "الأطفال"},
    parent:    {one: "ولي أمر",      many: "أولياء الأمور"},
    teacher:   {one: "معلمة",        many: "المعلمات"},
    principal: {one: "مديرة الروضة", many: "المديرة"},
    visitor:   {one: "زائر",         many: "الزوار"}
  };
  const KINDS = {image: "صورة", video: "فيديو", drawing: "رسمة", text: "عبارة"};
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const dateFmt = new Intl.DateTimeFormat("ar-u-ca-gregory", {day: "numeric", month: "long"});
  const when = iso => { try { return dateFmt.format(new Date(iso)); } catch (_) { return ""; } };

  window.WataniAPI = {ready, rest, upload, removeFiles, auth, publicUrl, ROLES, KINDS, esc, when};
})();
