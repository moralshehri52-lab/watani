/* حائط حب الوطن: عرض المشاركات المعتمدة، الإعجاب، ونموذج المشاركة مع رفع الصور والفيديو والرسم */
(() => {
  const API = window.WataniAPI;
  const {ROLES, KINDS, esc, when} = API;
  const $ = id => document.getElementById(id);
  const PAGE = 18, MAX_VIDEO = 50 * 1024 * 1024, MAX_IMAGE_SRC = 30 * 1024 * 1024;
  const HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.2 4.5c2 0 3.5 1.1 4.8 2.8 1.3-1.7 2.8-2.8 4.8-2.8 3.6 0 5.7 3.5 4.5 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>';
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  };

  /* ======================= الحائط ======================= */
  const feed = $("wallFeed"), more = $("wallMore"), stats = $("wallStats");
  let role = "all", sort = "new", offset = 0, loading = false, posts = [], total = null, loadedAt = 0;
  let liked = new Set(store.get("watani-liked", []));

  function card(p) {
    const r = ROLES[p.role] ? p.role : "visitor";
    const kind = p.media_kind || "text";
    let media = "";
    if (p.media_path) {
      const url = API.publicUrl(p.media_path);
      if (kind === "video") {
        media = `<div class="pvideo"><video src="${esc(url)}#t=0.1" controls playsinline preload="metadata"></video></div>`;
      } else {
        media = `<button class="pmedia open ${kind === "drawing" ? "drawing" : ""}" type="button" data-src="${esc(url)}" data-title="${esc(KINDS[kind] + " · " + p.name)}" aria-label="تكبير ${KINDS[kind]} ${esc(p.name)}"><img src="${esc(url)}" alt="${esc(KINDS[kind] + " من " + p.name)}" loading="lazy"></button>`;
      }
    }
    const msg = (p.message || "").trim();
    const on = liked.has(p.id);
    return `<article class="post${p.media_path ? "" : " textonly"}" data-role="${r}" data-id="${esc(p.id)}">
      ${media}
      ${msg ? `<p class="pmsg">${esc(msg)}</p>` : ""}
      <div class="pfoot">
        <span class="avatar" aria-hidden="true">${esc([...p.name.trim()][0] || "؟")}</span>
        <span class="pwho"><b>${esc(p.name)}</b><span><span class="prole">${ROLES[r].one}</span> · ${KINDS[kind]} · ${when(p.created_at)}</span></span>
        <button class="like" type="button" data-like="${esc(p.id)}" aria-pressed="${on}" aria-label="إعجاب بمشاركة ${esc(p.name)}">${HEART}<span>${p.likes || 0}</span></button>
      </div>
    </article>`;
  }

  function empty(title, text) { feed.innerHTML = `<p class="wempty"><b>${title}</b>${text}</p>`; }

  function renderStats() {
    if (total == null) { stats.textContent = ""; return; }
    const n = total, num = `<b>${n.toLocaleString("ar")}</b>`;
    const label = n === 1 ? "مشاركة واحدة" : n === 2 ? "مشاركتان" : (n % 100 >= 3 && n % 100 <= 10) ? num + " مشاركات" : num + " مشاركة";
    stats.innerHTML = label + (role === "all" ? " على الحائط" : " من " + ROLES[role].many);
  }

  async function load(reset) {
    if (!API.ready) {
      feed.removeAttribute("aria-busy");
      empty("الحائط قيد الإعداد", "ستظهر المشاركات هنا قريبًا بإذن الله.");
      return;
    }
    if (loading) return;
    loading = true;
    if (reset) { offset = 0; posts = []; feed.setAttribute("aria-busy", "true"); feed.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>'; more.hidden = true; }
    const q = ["select=id,created_at,name,role,message,media_path,media_kind,likes",
      "status=eq.approved",
      role === "all" ? "" : "role=eq." + role,
      "order=" + (sort === "top" ? "likes.desc,created_at.desc" : "created_at.desc"),
      "limit=" + PAGE, "offset=" + offset].filter(Boolean).join("&");
    try {
      const {data, count} = await API.rest("posts?" + q, {prefer: "count=exact"});
      if (count != null) total = count;
      if (reset) feed.innerHTML = "";
      const fresh = (data || []).filter(p => !posts.some(o => o.id === p.id));
      posts = posts.concat(fresh); offset += (data || []).length;
      if (!posts.length) {
        empty(role === "all" ? "كن أول من يشارك!" : "لا توجد مشاركات هنا بعد",
          role === "all" ? "اضغط «شاركنا حب الوطن» وأضف عبارتك أو صورتك أو رسمتك." : "جرّب تصفية أخرى، أو أضف أول مشاركة في هذا القسم.");
      } else {
        feed.insertAdjacentHTML("beforeend", fresh.map(card).join(""));
      }
      more.hidden = !(total != null ? offset < total : (data || []).length === PAGE);
      renderStats(); loadedAt = Date.now();
    } catch (err) {
      console.error(err);
      if (reset || !posts.length) empty("تعذّر تحميل الحائط", "تأكد من اتصالك بالإنترنت ثم حدّث الصفحة.");
    }
    feed.removeAttribute("aria-busy");
    loading = false;
  }

  document.querySelectorAll("#wallFilters .chip").forEach(ch => ch.addEventListener("click", () => {
    document.querySelectorAll("#wallFilters .chip").forEach(c => c.setAttribute("aria-pressed", String(c === ch)));
    role = ch.dataset.role; load(true);
  }));
  document.querySelectorAll("#wallSort button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("#wallSort button").forEach(c => c.setAttribute("aria-pressed", String(c === b)));
    sort = b.dataset.sort; load(true);
  }));
  more.addEventListener("click", () => load(false));

  /* الإعجاب: مرة واحدة لكل جهاز، ويمكن التراجع عنه */
  feed.addEventListener("click", async ev => {
    const b = ev.target.closest("[data-like]");
    if (!b || b.disabled) return;
    const id = b.dataset.like, on = !liked.has(id), num = b.querySelector("span");
    const before = +num.textContent || 0;
    b.disabled = true;
    b.setAttribute("aria-pressed", String(on)); num.textContent = Math.max(0, before + (on ? 1 : -1));
    if (on) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
    try {
      const {data} = await API.rest("rpc/like_post", {method: "POST", body: {post_id: id, delta: on ? 1 : -1}});
      if (typeof data === "number") num.textContent = data;
      on ? liked.add(id) : liked.delete(id);
      store.set("watani-liked", [...liked].slice(-500));
      const p = posts.find(x => x.id === id); if (p) p.likes = +num.textContent;
    } catch (_) {
      b.setAttribute("aria-pressed", String(!on)); num.textContent = before;
    }
    b.disabled = false;
  });

  /* تحديث الحائط عند العودة إليه */
  const onWall = () => location.hash === "#wall";
  window.addEventListener("hashchange", () => { if (onWall() && Date.now() - loadedAt > 60000) load(true); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && onWall() && Date.now() - loadedAt > 60000) load(true); });
  load(true);

  /* ======================= نموذج المشاركة ======================= */
  const dlg = $("shareDlg"), form = $("shareForm"), done = $("shareDone");
  const out = $("sMsgOut"), send = $("sSend"), prog = $("sProg"), bar = prog.querySelector("i");
  const nameIn = $("sName"), msgIn = $("sMsg"), consentBox = $("sConsentBox"), consent = $("sConsent");
  const panes = {image: $("paneImage"), video: $("paneVideo"), drawing: $("paneDrawing")};
  let kind = "none", files = {image: null, video: null, drawing: null}, busy = false;

  const say = (t, cls) => { out.textContent = t; out.className = "wmsg" + (cls ? " " + cls : ""); };
  const currentRole = () => (form.querySelector("input[name=role]:checked") || {}).value || "visitor";

  function openShare() {
    if (!API.ready) { alert("باب المشاركة سيُفتح قريبًا بإذن الله."); return; }
    if (location.hash !== "#wall") location.hash = "#wall";
    form.hidden = false; done.hidden = true; say("");
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    setTimeout(() => nameIn.focus(), 60);
  }
  function closeShare() { if (busy) return; dlg.close ? dlg.close() : dlg.removeAttribute("open"); }
  document.querySelectorAll("[data-share]").forEach(b => b.addEventListener("click", openShare));
  $("shareClose").addEventListener("click", closeShare);
  dlg.addEventListener("cancel", ev => { if (busy) ev.preventDefault(); });
  dlg.addEventListener("click", ev => { if (ev.target === dlg) closeShare(); });
  $("shareBack").addEventListener("click", closeShare);
  $("shareAgain").addEventListener("click", () => { resetForm(); form.hidden = false; done.hidden = true; nameIn.focus(); });

  msgIn.addEventListener("input", () => { $("sCount").textContent = msgIn.value.length + " / 500"; });

  function hasMedia() { return kind === "drawing" ? !!(files.drawing || pad.dirty) : kind !== "none" && !!files[kind]; }
  function syncConsent() {
    consentBox.hidden = !hasMedia();
  }

  form.querySelectorAll("input[name=kind]").forEach(r => r.addEventListener("change", () => {
    kind = r.value;
    for (const k in panes) panes[k].hidden = k !== kind;
    if (kind === "drawing") pad.fit();
    syncConsent(); say("");
  }));

  document.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => $(b.dataset.pick).click()));

  function showPreview(k, file) {
    const box = $("pv" + k[0].toUpperCase() + k.slice(1));
    const old = box.querySelector("img,video"); if (old && old.src.startsWith("blob:")) URL.revokeObjectURL(old.src);
    box.innerHTML = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    box.innerHTML = k === "video" ? `<video src="${url}" controls playsinline muted></video>` : `<img src="${url}" alt="معاينة">`;
  }

  $("fImage").addEventListener("change", e => pickFile("image", e.target));
  $("fVideo").addEventListener("change", e => pickFile("video", e.target));
  $("fDrawing").addEventListener("change", e => pickFile("drawing", e.target));
  function pickFile(k, input) {
    const f = input.files && input.files[0];
    input.value = "";
    if (!f) return;
    if (k === "video") {
      if (!/^video\//.test(f.type) && !/\.(mp4|mov|webm|m4v)$/i.test(f.name)) { say("اختر ملف فيديو.", "err"); return; }
      if (f.size > MAX_VIDEO) { say("المقطع أكبر من 50 ميجابايت. اختر مقطعًا أقصر أو قصّه من معرض الصور.", "err"); return; }
    } else {
      if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name)) { say("اختر ملف صورة.", "err"); return; }
      if (f.size > MAX_IMAGE_SRC) { say("الصورة كبيرة جدًا. اختر صورة أصغر.", "err"); return; }
    }
    files[k] = f; say("");
    if (k === "drawing") pad.clear(true);
    showPreview(k, f); syncConsent();
  }

  /* ---------- لوحة الرسم ---------- */
  const pad = (() => {
    const c = $("pad"), ctx = c.getContext("2d");
    let color = "#1f8f5a", wide = false, eraser = false, drawing = false, last = null, history = [];
    const self = {dirty: false};
    function blank() { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
    blank();
    self.fit = () => {};
    self.clear = keepFile => {
      blank(); history = []; self.dirty = false;
      if (!keepFile) { files.drawing = null; showPreview("drawing", null); }
      syncConsent();
    };
    const pos = e => { const r = c.getBoundingClientRect(); return {x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height}; };
    c.addEventListener("pointerdown", e => {
      e.preventDefault(); c.setPointerCapture(e.pointerId); drawing = true; last = pos(e);
      if (history.length > 20) history.shift();
      history.push(ctx.getImageData(0, 0, c.width, c.height));
      if (files.drawing) { files.drawing = null; showPreview("drawing", null); }
      dot(last);
    });
    c.addEventListener("pointermove", e => { if (!drawing) return; const p = pos(e); line(last, p); last = p; });
    const end = () => { if (drawing) { drawing = false; self.dirty = true; syncConsent(); } };
    c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end); c.addEventListener("pointerleave", end);
    function style() { ctx.strokeStyle = ctx.fillStyle = eraser ? "#fff" : color; ctx.lineWidth = eraser ? 48 : wide ? 26 : 11; ctx.lineCap = ctx.lineJoin = "round"; }
    function dot(p) { style(); ctx.beginPath(); ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
    function line(a, b) { style(); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    const bar = $("padBar");
    bar.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.color) {
        color = b.dataset.color; eraser = false;
        bar.querySelectorAll(".swatch").forEach(s => s.setAttribute("aria-pressed", String(s === b)));
        bar.querySelector("[data-eraser]").setAttribute("aria-pressed", "false");
      } else if (b.hasAttribute("data-size")) { wide = !wide; b.setAttribute("aria-pressed", String(wide)); }
      else if (b.hasAttribute("data-eraser")) { eraser = !eraser; b.setAttribute("aria-pressed", String(eraser)); }
      else if (b.hasAttribute("data-undo")) { const h = history.pop(); if (h) ctx.putImageData(h, 0, 0); if (!history.length) { self.dirty = false; syncConsent(); } }
      else if (b.hasAttribute("data-clear")) self.clear(false);
    });
    self.blob = () => new Promise(res => c.toBlob(res, "image/jpeg", .9));
    return self;
  })();

  /* ---------- تجهيز الصور: تصغير إلى 1600 بكسل بصيغة JPEG ---------- */
  function shrink(file) {
    if (file.type === "image/gif") return Promise.resolve(file);
    return new Promise(resolve => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        cv.toBlob(b => resolve(b || file), "image/jpeg", .86);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(/^image\/(jpeg|png|webp)$/.test(file.type) ? file : null); };
      img.src = url;
    });
  }

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const extOf = (blob, name) => ({"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm"}[blob.type])
    || ((name || "").split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";

  function resetForm() {
    form.reset(); kind = "none";
    for (const k in panes) { panes[k].hidden = true; files[k] = null; showPreview(k, null); }
    pad.clear(true); $("sCount").textContent = "0 / 500";
    prog.hidden = true; bar.style.width = "0"; say(""); syncConsent();
  }

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (busy) return;
    const name = nameIn.value.trim().replace(/\s+/g, " "), message = msgIn.value.trim(), role = currentRole();
    const withMedia = hasMedia();
    if (!name) { say("اكتب اسم المشارك.", "err"); nameIn.focus(); return; }
    if (!message && !withMedia) { say(kind === "none" ? "اكتب عبارة وطنية، أو أضف صورة أو فيديو أو رسمة." : "أضف " + KINDS[kind] + "، أو اكتب عبارة وطنية.", "err"); return; }
    if (withMedia && !consent.checked) { say("يلزم الإقرار بموافقة ولي الأمر قبل إرسال صورة أو مقطع أو رسمة.", "err"); consent.focus(); return; }
    if ($("sHp").value) { form.hidden = true; done.hidden = false; return; }
    const lastSent = store.get("watani-last", 0);
    if (Date.now() - lastSent < 30000) { say("أُرسلت مشاركة قبل لحظات. انتظر نصف دقيقة ثم أعد المحاولة.", "err"); return; }

    busy = true; send.disabled = true; dlg.querySelector(".x").disabled = true;
    const row = {name, role, message: message || null, consent: withMedia && consent.checked};
    try {
      if (withMedia) {
        say("جاري تجهيز الملف…");
        let blob, srcName = "";
        if (kind === "video") { blob = files.video; srcName = blob.name; }
        else if (kind === "drawing" && !files.drawing) blob = await pad.blob();
        else { const f = files[kind]; srcName = f.name; blob = await shrink(f); if (!blob) throw {friendly: "تعذّر قراءة هذه الصورة. جرّب صورة بصيغة JPG أو PNG."}; }
        if (kind === "video" && !blob.type) blob = new Blob([blob], {type: /\.mov$/i.test(srcName) ? "video/quicktime" : /\.webm$/i.test(srcName) ? "video/webm" : "video/mp4"});
        const path = "posts/" + uid() + "." + extOf(blob, srcName);
        prog.hidden = false; bar.style.width = "2%";
        say(kind === "video" ? "جاري رفع المقطع… لا تغلق الصفحة." : "جاري رفع الملف…");
        await API.upload(path, blob, p => { bar.style.width = Math.max(2, Math.round(p * 100)) + "%"; say((kind === "video" ? "جاري رفع المقطع… " : "جاري رفع الملف… ") + Math.round(p * 100) + "%"); });
        bar.style.width = "100%";
        row.media_path = path; row.media_kind = kind;
      }
      say("جاري الإرسال…");
      await API.rest("posts", {method: "POST", body: row, prefer: "return=minimal"});
      store.set("watani-last", Date.now());
      resetForm();
      form.hidden = true; done.hidden = false;
      done.querySelector("#shareAgain").focus();
    } catch (err) {
      console.error(err);
      let t = "تعذّر الإرسال الآن. تأكد من الاتصال بالإنترنت وحاول مرة أخرى.";
      if (err && err.friendly) t = err.friendly;
      else if (err && (err.status === 413 || /size|large/i.test(err.message || ""))) t = "الملف أكبر من المسموح (50 ميجابايت). اختر ملفًا أصغر.";
      else if (err && (err.status === 415 || /mime|type/i.test(err.message || ""))) t = "نوع الملف غير مدعوم. استخدم صورة JPG أو PNG أو فيديو MP4 أو MOV.";
      say(t, "err");
      prog.hidden = true;
    }
    busy = false; send.disabled = false; dlg.querySelector(".x").disabled = false;
  });
})();
