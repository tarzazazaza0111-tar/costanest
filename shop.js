// Costa Nest shop page: plans -> order (amount with a few satang) -> PromptPay QR -> slip -> purchase code.
// Talks to the shop's Cloudflare Worker (SHOP_CONFIG.api), the same one the panel uses for codes.
(function () {
    var C = window.SHOP_CONFIG || {};
    var ORDER_KEY = "costanest.shop.order", CODE_KEY = "costanest.shop.code";
    var state = { info: null, order: null, pay: null, slip: null, busy: false, timer: null, qrText: "" };
    var CONTACT = C.contactText || "ทักแชทเพจ Costa design";
    var MSG = {
        net: "เชื่อมต่อร้านไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่",
        timeout: "ร้านตอบช้าเกินไป — ลองกดใหม่อีกครั้ง (ส่งสลิปเดิมซ้ำได้ ไม่คิดเงินซ้ำ)",
        notOpen: "ระบบร้านยังเปิดไม่ครบ — {contact}",
        shopNotReady: "ร้านยังไม่เปิดขายออนไลน์ตอนนี้ — {contact}",
        noPlan: "แพ็กเกจนี้ปิดขายแล้ว — รีเฟรชหน้าแล้วเลือกใหม่",
        busy: "มีคนใช้งานพร้อมกันมาก — รอสักครู่แล้วลองใหม่",
        badType: "ไฟล์นี้ไม่ใช่รูปภาพ — เลือกรูปสลิป JPG หรือ PNG",
        tooBig: "รูปใหญ่เกินไป — ใช้รูปสลิปจากแอปธนาคาร (ไม่เกิน 4 MB)",
        badImage: "อ่านรูปนี้ไม่ได้ — ใช้รูปสลิปจากแอปธนาคาร JPG หรือ PNG",
        slipNotFound: "ตรวจสลิปไม่ผ่าน: ไม่พบรายการโอนนี้ หรือ QR บนสลิปไม่ชัด — ใช้รูปสลิปตัวจริงจากแอปธนาคาร",
        slipPending: "ธนาคารยังไม่ยืนยันรายการนี้ (บางธนาคารใช้เวลาประมาณ 5 นาที) — รอสักครู่แล้วกดส่งอีกครั้ง",
        wrongReceiver: "สลิปนี้ไม่ได้โอนเข้าบัญชีของร้าน — ตรวจชื่อบัญชีปลายทางอีกครั้ง หรือ{contact}",
        wrongAmount: "ยอดในสลิป {paid} บาท ไม่ตรงกับยอดที่ต้องโอน {expected} บาท — {contact} พร้อมแนบสลิป",
        lateSlip: "สลิปนี้โอนนอกเวลาของคำสั่งซื้อ (ต้องโอนภายใน {min} นาทีหลังสั่งซื้อ) — {contact} พร้อมแนบสลิป",
        noOrder: "ไม่พบคำสั่งซื้อที่ตรงกับยอด {paid} บาท — เลือกแพ็กเกจแล้วโอนตามยอดที่แสดง หรือ{contact}",
        shopError: "ระบบตรวจสลิปขัดข้องชั่วคราว ({detail}) — {contact} พร้อมแนบสลิป เราจะส่งโค้ดให้",
        server: "ระบบร้านขัดข้องชั่วคราว — {contact} พร้อมแนบสลิป"
    };

    function $(id) { return document.getElementById(id); }
    function show(id, on) { $(id).classList.toggle("hidden", !on); }
    function store(k, v) { try { if (v === null) { localStorage.removeItem(k); } else { localStorage.setItem(k, JSON.stringify(v)); } } catch (e) { } }
    function load(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
    function money(x, dec) {
        var n = Number(x);
        try { return n.toLocaleString("th-TH", { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: 2 }); } catch (e) { return dec ? n.toFixed(2) : String(n); }
    }
    function text(key, vars) {
        var s = MSG[key] || MSG.server;
        vars = vars || {};
        return s.replace(/\{(\w+)\}/g, function (m, k) { return k === "contact" ? CONTACT : k === "min" ? String((state.info && state.info.minutes) || 60) : (vars[k] !== undefined ? vars[k] : ""); });
    }
    function say(id, message, unused, kind) { var el = $(id); el.textContent = message || ""; el.className = "msg" + (kind ? " " + kind : ""); }
    function fail(reason, extra) { var e = new Error(reason); e.reason = reason; e.extra = extra || {}; return e; }

    // ------------------------------------------------------------------ the shop's web app
    function api(body, ms) {
        if (!C.api) { return Promise.reject(fail("shopNotReady")); }
        return new Promise(function (resolve, reject) {
            var done = false, ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
            var t = setTimeout(function () { if (!done) { done = true; try { ctl && ctl.abort(); } catch (e) { } reject(fail("timeout")); } }, ms || 30000);
            fetch(C.api, { method: "POST", body: JSON.stringify(body), redirect: "follow", cache: "no-store", signal: ctl ? ctl.signal : undefined })
                .then(function (r) { if (!r.ok) { throw fail("net"); } return r.text(); })
                .then(function (s) {
                    var j;
                    try { j = JSON.parse(s); } catch (e) { throw fail(/^\s*</.test(s) ? "notOpen" : "net"); }
                    if (!done) { done = true; clearTimeout(t); resolve(j); }
                })
                .catch(function (e) { if (!done) { done = true; clearTimeout(t); reject(e && e.reason ? e : fail("net")); } });
        });
    }

    // ------------------------------------------------------------------ plans
    function renderPlans(info) {
        var box = $("plans");
        box.textContent = "";
        if (!info.ready || !info.plans || !info.plans.length) {
            $("shopMsg").textContent = text("shopNotReady"); show("shopMsg", true);
            return;
        }
        show("shopMsg", false);
        info.plans.forEach(function (p) {
            var el = document.createElement("div"), h = document.createElement("h3"), term = document.createElement("span"),
                price = document.createElement("p"), desc = document.createElement("p"), b = document.createElement("button");
            el.className = "plan";
            h.textContent = p.name;
            term.className = "term"; term.textContent = "อายุคีย์: " + p.term + " · 1 เครื่อง";
            price.className = "price"; price.textContent = money(p.price) + " "; var u = document.createElement("small"); u.textContent = "บาท"; price.appendChild(u);
            desc.className = "desc"; desc.textContent = p.note || "";
            b.className = "btn primary"; b.type = "button"; b.textContent = "ซื้อแพ็กเกจนี้"; b.setAttribute("data-plan", p.id);
            b.addEventListener("click", function () { buy(p.id, b); });
            el.appendChild(h); el.appendChild(term); el.appendChild(price); el.appendChild(desc); el.appendChild(b);
            box.appendChild(el);
        });
    }
    function loadShop() {
        return api({ action: "shop" }).then(function (info) {
            state.info = info; renderPlans(info); return info;
        }, function (e) {
            $("plans").textContent = ""; $("shopMsg").textContent = text(e.reason); show("shopMsg", true);
        });
    }

    // ------------------------------------------------------------------ order + QR
    function buy(planId, btn) {
        if (state.busy) { return Promise.resolve(); }
        state.busy = true; if (btn) { btn.disabled = true; btn.textContent = "กำลังสร้างคำสั่งซื้อ…"; }
        return api({ action: "order", plan: planId }).then(function (r) {
            state.busy = false; if (btn) { btn.disabled = false; btn.textContent = "ซื้อแพ็กเกจนี้"; }
            if (!r.ok) { $("shopMsg").textContent = text(r.error, r); show("shopMsg", true); return; }
            show("shopMsg", false);
            state.order = r.order; state.pay = r.pay; state.slip = null;
            store(ORDER_KEY, { order: r.order, pay: r.pay });
            showCheckout(true);
        }, function (e) {
            state.busy = false; if (btn) { btn.disabled = false; btn.textContent = "ซื้อแพ็กเกจนี้"; }
            $("shopMsg").textContent = text(e.reason); show("shopMsg", true);
        });
    }
    function drawQr(textValue) {
        state.qrText = textValue;
        var cv = $("qr"), ctx = null;
        try { ctx = cv.getContext && cv.getContext("2d"); } catch (e) { ctx = null; }
        if (!ctx || typeof qrcode !== "function") { return; }
        var qr = qrcode(0, "M"); qr.addData(textValue); qr.make();
        var n = qr.getModuleCount(), quiet = 4, cell = Math.max(4, Math.floor(528 / (n + quiet * 2))), size = (n + quiet * 2) * cell, r, c;
        cv.width = size; cv.height = size;
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size, size); ctx.fillStyle = "#000000";
        for (r = 0; r < n; r++) { for (c = 0; c < n; c++) { if (qr.isDark(r, c)) { ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell); } } }
        try { $("btnSaveQr").href = cv.toDataURL("image/png"); } catch (e2) { }
    }
    function showCheckout(scroll) {
        var o = state.order, p = state.pay;
        show("result", false); show("checkout", true);
        $("coPlan").textContent = o.plan + " · " + o.term;
        $("coAmount").textContent = money(o.amount, true);
        $("payBank").textContent = p.bank; $("payAcc").textContent = p.account; $("payName").textContent = p.holder; $("payAmt").textContent = money(o.amount, true);
        drawQr(PP.payload(p.promptpay, o.amount));
        resetSlip();
        tick(); clearInterval(state.timer); state.timer = setInterval(tick, 1000);
        if (scroll) { try { $("checkout").scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { } }
    }
    function tick() {
        if (!state.order) { return; }
        var left = Math.round((state.order.until - Date.now()) / 1000), el = $("coTimer");
        if (left > 0) {
            el.className = "timer";
            el.textContent = "QR นี้ใช้ได้อีก " + Math.floor(left / 60) + ":" + ("0" + (left % 60)).slice(-2) + " นาที · โอนแล้วส่งสลิปได้เลย";
        } else {
            el.className = "timer late";
            el.textContent = "หมดเวลาโอนตาม QR นี้แล้ว — ถ้าโอนไปแล้วส่งสลิปได้ตามปกติ ถ้ายังไม่โอน กด “เปลี่ยนแพ็กเกจ” เพื่อสั่งใหม่";
        }
    }

    // ------------------------------------------------------------------ slip
    // the slip as a JPEG data URL, at most 1600 px (EasySlip takes up to 4 MB)
    function readSlip(file) {
        return new Promise(function (resolve, reject) {
            if (!file || !/^image\//.test(file.type || "")) { reject(fail("badType")); return; }
            function plain() {
                if (file.size > 4 * 1024 * 1024) { reject(fail("tooBig")); return; }
                var fr = new FileReader();
                fr.onload = function () { resolve(String(fr.result)); };
                fr.onerror = function () { reject(fail("badImage")); };
                fr.readAsDataURL(file);
            }
            var probe = null;
            try { probe = document.createElement("canvas").getContext("2d"); } catch (e) { probe = null; }
            if (!probe || !window.URL || !URL.createObjectURL) { plain(); return; }
            var img = new Image(), url = URL.createObjectURL(file), settled = false;
            var guard = setTimeout(function () { if (!settled) { settled = true; plain(); } }, 8000);
            img.onload = function () {
                if (settled) { return; }
                settled = true; clearTimeout(guard);
                try {
                    var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement("canvas");
                    cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
                    var g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
                    resolve(cv.toDataURL("image/jpeg", 0.88));
                } catch (e2) { plain(); }
                URL.revokeObjectURL(url);
            };
            img.onerror = function () { if (!settled) { settled = true; clearTimeout(guard); URL.revokeObjectURL(url); plain(); } };
            img.src = url;
        });
    }
    function resetSlip() {
        state.slip = null; $("slipFile").value = ""; $("btnSend").disabled = true;
        show("slipPreview", false); show("dropText", true); say("slipMsg", "");
    }
    function takeSlip(file) {
        say("slipMsg", "กำลังเตรียมรูป…", null, "info");
        return readSlip(file).then(function (data) {
            state.slip = data;
            $("slipPreview").src = data; show("slipPreview", true); show("dropText", false);
            $("btnSend").disabled = false; say("slipMsg", "");
        }, function (e) { state.slip = null; $("btnSend").disabled = true; say("slipMsg", text(e.reason), null, "err"); });
    }
    function sendSlip(data, orderId, msgId) {
        if (state.busy) { return Promise.resolve(false); }
        state.busy = true; $("btnSend").disabled = true;
        say(msgId, "กำลังตรวจสลิปกับธนาคาร… (ไม่เกิน 1 นาที)", null, "info");
        return api({ action: "slip", slip: data, order: orderId || "" }, 90000).then(function (r) {
            state.busy = false; $("btnSend").disabled = !state.slip;
            if (!r.ok) { say(msgId, text(r.error, r), null, "err"); return false; }
            say(msgId, "");
            showResult(r);
            return true;
        }, function (e) {
            state.busy = false; $("btnSend").disabled = !state.slip;
            say(msgId, text(e.reason), null, "err"); return false;
        });
    }
    function showResult(r) {
        clearInterval(state.timer);
        state.order = null; store(ORDER_KEY, null);
        store(CODE_KEY, { code: r.code, plan: r.plan, term: r.term, at: Date.now() });
        show("checkout", false); show("result", true);
        $("resCode").textContent = r.code;
        $("resPlan").textContent = r.plan + " · อายุคีย์ " + r.term + (r.again ? " · สลิปนี้เคยใช้แล้ว นี่คือโค้ดเดิมของคุณ" : "");
        say("copyMsg", "");
        renderLast();
        try { $("result").scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { }
    }
    function copy(textValue) {
        function classic() {
            var ta = document.createElement("textarea"), ok = false;
            ta.value = textValue; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
            document.body.appendChild(ta); ta.select();
            try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
            document.body.removeChild(ta);
            return ok;
        }
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) { return navigator.clipboard.writeText(textValue).then(function () { return true; }, function () { return classic(); }); }
        } catch (e) { }
        return Promise.resolve(classic());
    }
    function renderLast() {
        var last = load(CODE_KEY), el = $("lostLast");
        if (!el) { el = document.createElement("p"); el.id = "lostLast"; el.className = "note"; $("lost").insertBefore(el, $("lostFile")); }
        el.textContent = last && last.code ? "โค้ดล่าสุดที่ซื้อจากเครื่องนี้: " + last.code + " (" + last.plan + ")" : "";
    }

    // ------------------------------------------------------------------ wiring
    function wire() {
        $("slipFile").addEventListener("change", function () { if (this.files && this.files[0]) { takeSlip(this.files[0]); } });
        var drop = $("drop");
        ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
        ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
        drop.addEventListener("drop", function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { takeSlip(f); } });
        $("btnSend").addEventListener("click", function () { if (state.slip) { sendSlip(state.slip, state.order && state.order.id, "slipMsg"); } });
        $("btnCancel").addEventListener("click", function () {
            clearInterval(state.timer); state.order = null; store(ORDER_KEY, null); show("checkout", false);
            try { $("plans").scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { }
        });
        $("btnCopyAcc").addEventListener("click", function () { copy(String(state.pay && state.pay.account || "").replace(/\D/g, "")); });
        $("btnCopyCode").addEventListener("click", function () {
            copy($("resCode").textContent).then(function (ok) { say("copyMsg", ok ? "คัดลอกโค้ดแล้ว ✓ นำไปวางในหน้าเปิดใช้งานของ Costa Nest" : "คัดลอกไม่ได้ — กดค้างที่โค้ดแล้วเลือกคัดลอก", null, ok ? "ok" : "err"); });
        });
        $("btnAgain").addEventListener("click", function () { show("result", false); try { $("plans").scrollIntoView({ behavior: "smooth" }); } catch (e) { } });
        $("lostFile").addEventListener("change", function () {
            var f = this.files && this.files[0];
            if (!f) { return; }
            say("lostMsg", "กำลังเตรียมรูป…", null, "info");
            readSlip(f).then(function (data) { return sendSlip(data, "", "lostMsg"); }, function (e) { say("lostMsg", text(e.reason), null, "err"); });
        });
        if (C.contactUrl) { var a = document.createElement("a"); a.href = C.contactUrl; a.target = "_blank"; a.rel = "noopener"; a.textContent = CONTACT; $("contact").textContent = ""; $("contact").appendChild(a); }
        else { $("contact").textContent = CONTACT; }
    }

    function start() {
        wire(); renderLast();
        var saved = load(ORDER_KEY);
        var p = loadShop();
        if (saved && saved.order && saved.pay && Date.now() - saved.order.until < 24 * 3600 * 1000) {
            state.order = saved.order; state.pay = saved.pay; showCheckout(false);
        }
        return p;
    }
    window.SHOP_APP = { state: state, start: start, buy: buy, sendSlip: sendSlip, readSlip: readSlip, takeSlip: takeSlip, MSG: MSG };
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", start); } else { start(); }
})();
