// Costa Nest website effects: the hero nesting animation, the before/after demo, scroll reveal, counters,
// card spotlight. The shapes and their final places come from js/demo-data.js - a real result of the Costa Nest
// true-shape engine, made at build time (tools/make_site_demo.js).
(function () {
    var root = document.documentElement;
    root.classList.add("js");
    var D = window.NEST_DEMO;
    var RM = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    var FILL = ["#ff7a00", "#ecedf1", "#ff4d6d", "#ffb020"], EDGE = ["#ffc27a", "#ffffff", "#ff9fb1", "#ffe3a3"];

    function $(id) { return document.getElementById(id); }
    function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3); }
    function easeBack(t) { if (t <= 0) { return 0; } if (t >= 1) { return 1; } var c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function shortAngle(a) { a = ((a % 360) + 360) % 360; return a > 180 ? a - 360 : a; }
    function area(c) { var s = 0, i, n = c.length; for (i = 0; i < n; i += 2) { var j = (i + 2) % n; s += c[i] * c[j + 1] - c[j] * c[i + 1]; } return Math.abs(s) / 2; }
    function partArea(p) { var a = area(p.c[0]), i; for (i = 1; i < p.c.length; i++) { a -= area(p.c[i]); } return a; }
    function bbox(p) { var b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; p.c.forEach(function (c) { for (var i = 0; i < c.length; i += 2) { b.x0 = Math.min(b.x0, c[i]); b.x1 = Math.max(b.x1, c[i]); b.y0 = Math.min(b.y0, c[i + 1]); b.y1 = Math.max(b.y1, c[i + 1]); } }); return b; }
    function fmt(n, d) { return Number(n).toFixed(d); }

    // ---------------------------------------------------------------- drawing
    function drawSheet(g, ox, oy, s, sh, label, alpha, rulers) {
        var w = sh.w * s, h = sh.h * s, k, step = 50;
        g.save(); g.globalAlpha = alpha;
        g.fillStyle = "rgba(255,255,255,0.035)"; g.fillRect(ox, oy, w, h);
        g.strokeStyle = "rgba(255,255,255,0.05)"; g.lineWidth = 1; g.beginPath();
        for (k = step; k < sh.w; k += step) { g.moveTo(ox + k * s, oy); g.lineTo(ox + k * s, oy + h); }
        for (k = step; k < sh.h; k += step) { g.moveTo(ox, oy + k * s); g.lineTo(ox + w, oy + k * s); }
        g.stroke();
        g.setLineDash([6, 6]); g.strokeStyle = "rgba(255,176,32,0.35)";
        g.strokeRect(ox + sh.margin * s, oy + sh.margin * s, w - 2 * sh.margin * s, h - 2 * sh.margin * s);
        g.setLineDash([]); g.strokeStyle = "rgba(255,122,0,0.85)"; g.lineWidth = 2; g.strokeRect(ox, oy, w, h);
        if (rulers) {
            g.fillStyle = "rgba(255,255,255,0.45)"; g.strokeStyle = "rgba(255,255,255,0.25)"; g.lineWidth = 1;
            g.font = "500 15px 'Plex Mono', ui-monospace, monospace"; g.textAlign = "center"; g.beginPath();
            for (k = 0; k <= sh.w; k += 25) { var tx = ox + k * s, big = k % 100 === 0; g.moveTo(tx, oy - (big ? 14 : 7)); g.lineTo(tx, oy - 2); if (big) { g.fillText(String(k), tx, oy - 20); } }
            g.textAlign = "right";
            for (k = 0; k <= sh.h; k += 25) { var ty = oy + k * s, big2 = k % 100 === 0; g.moveTo(ox - (big2 ? 14 : 7), ty); g.lineTo(ox - 2, ty); if (big2) { g.fillText(String(k), ox - 18, ty + 5); } }
            g.stroke();
        }
        if (label) { g.fillStyle = "rgba(255,255,255,0.55)"; g.font = "600 22px 'Plex Mono', ui-monospace, monospace"; g.textAlign = "left"; g.fillText(label, ox, oy - 14); }
        g.restore();
    }
    function drawPart(g, p, cx, cy, ang, s, ox, oy, alpha, glow) {
        var rad = ang * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
        g.save(); g.globalAlpha = alpha; g.beginPath();
        p.c.forEach(function (c) {
            for (var i = 0; i < c.length; i += 2) {
                var x = ox + (cx + c[i] * cs - c[i + 1] * sn) * s, y = oy + (cy + c[i] * sn + c[i + 1] * cs) * s;
                if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); }
            }
            g.closePath();
        });
        if (glow) { g.shadowColor = FILL[p.k]; g.shadowBlur = 18; }
        g.fillStyle = FILL[p.k]; g.fill("evenodd");
        g.shadowBlur = 0; g.lineWidth = 1.6; g.strokeStyle = EDGE[p.k]; g.stroke();
        g.restore();
    }

    // ---------------------------------------------------------------- hero: a pile of parts -> one nested sheet, looping
    function hero() {
        var cv = $("heroStage");
        if (!cv || !D || !cv.getContext) { return; }
        var g = cv.getContext("2d");
        if (!g) { return; }
        var sh = D.sheet, pad = { l: 66, t: 56, r: 26 }, s = (cv.width - pad.l - pad.r) / sh.w;
        cv.height = Math.round(pad.t + sh.h * s + 34);
        var total = D.parts.reduce(function (a, p) { return a + partArea(p); }, 0);
        var order = D.parts.map(function (p, i) { return i; }).sort(function (a, b) { return D.parts[a].x - D.parts[b].x; });
        var start = [], T0 = 0, phase = 0, scan = document.querySelector(".scan"), state = $("heroState");
        function scatter() {
            start = D.parts.map(function (p) { return { x: 40 + Math.random() * (sh.w - 80), y: 30 + Math.random() * (sh.h - 60), a: Math.random() * 360 - 180 }; });
        }
        function frame(now) {
            if (!T0) { T0 = now; scatter(); if (scan) { scan.classList.remove("run"); void scan.offsetWidth; scan.classList.add("run"); } }
            var t = (now - T0) / 1000, landed = 0, landedArea = 0, fade = 1;
            if (t > 9.6) { T0 = 0; requestAnimationFrame(frame); return; }
            if (t > 8.8) { fade = 1 - (t - 8.8) / 0.8; }
            g.clearRect(0, 0, cv.width, cv.height);
            drawSheet(g, pad.l, pad.t, s, sh, "", 1, true);
            order.forEach(function (idx, rank) {
                var p = D.parts[idx], st = start[idx], k = (t - 0.5 - rank * 0.075) / 0.9, e = easeBack(k), a0 = st.a, a1 = shortAngle(p.a);
                var x = lerp(st.x, p.x, e), y = lerp(st.y, p.y, e), ang = lerp(a0, a1, ease(k));
                var alpha = (k <= 0 ? 0.28 : k >= 1 ? 1 : 0.28 + 0.72 * ease(k)) * fade;
                if (k >= 1) { landed++; landedArea += partArea(p); }
                drawPart(g, p, x, y, ang, s, pad.l, pad.t, alpha, k > 0 && k < 1);
            });
            $("hudParts").textContent = landed + " / " + D.count;
            $("hudUtil").textContent = fmt(D.util * landedArea / total, 1) + "%";
            var done = landed === D.count;
            if (state) { state.textContent = done ? "DONE · 1 SHEET" : "SOLVING"; state.className = done ? "done" : ""; }
            if (phase >= 0) { requestAnimationFrame(frame); }
        }
        $("hudSheet").textContent = sh.w + " × " + sh.h;
        $("hudRot").textContent = D.angleStep + "°";
        if (RM) {      // reduced motion: just the finished sheet
            drawSheet(g, pad.l, pad.t, s, sh, "", 1, true);
            D.parts.forEach(function (p) { drawPart(g, p, p.x, p.y, p.a, s, pad.l, pad.t, 1, false); });
            $("hudParts").textContent = D.count + " / " + D.count; $("hudUtil").textContent = fmt(D.util, 1) + "%";
            if (state) { state.textContent = "DONE · 1 SHEET"; state.className = "done"; }
            return;
        }
        requestAnimationFrame(frame);
    }

    // ---------------------------------------------------------------- demo: rows of boxes (2 sheets) <-> Costa Nest (1 sheet)
    function demo() {
        var cv = $("demoStage");
        if (!cv || !D || !cv.getContext) { return; }
        var g = cv.getContext("2d");
        if (!g) { return; }
        var sh = D.sheet, pad = 40, s = (cv.width - 2 * pad) / sh.w, gapY = 70, top = 52, n = Math.max(2, D.shelfSheets);
        var sheetH = sh.h * s, stepY = sheetH + gapY;
        cv.height = Math.round(top + n * sheetH + (n - 1) * gapY + 24);
        // the comparison layout, same rule as the build script: tallest first, rows, no rotation
        var boxes = D.parts.map(function (p, i) { var b = bbox(p); return { i: i, w: b.x1 - b.x0, h: b.y1 - b.y0, cx: -(b.x0 + b.x1) / 2, cy: -(b.y0 + b.y1) / 2 }; });
        boxes.sort(function (p, q) { return q.h - p.h; });
        var uw = sh.w - 2 * sh.margin, uh = sh.h - 2 * sh.margin, sheet = 0, x = 0, y = 0, rowH = 0, shelf = [];
        boxes.forEach(function (bx) {
            if (x > 0 && x + bx.w > uw) { y += rowH + sh.gap; x = 0; rowH = 0; }
            if (y + bx.h > uh) { sheet++; x = 0; y = 0; rowH = 0; }
            shelf[bx.i] = { sheet: sheet, x: sh.margin + x + bx.w / 2 + bx.cx, y: sh.margin + y + bx.h / 2 + bx.cy };
            x += bx.w + sh.gap; rowH = Math.max(rowH, bx.h);
        });
        var view = 1, from = 1, T0 = 0, dur = 1700, running = false;
        function poseOf(i, v) {
            var p = D.parts[i], b = shelf[i];
            return v === 0 ? { x: b.x, y: b.y + b.sheet * stepY / s, a: 0 } : { x: p.x, y: p.y, a: shortAngle(p.a) };
        }
        function draw(t) {
            var e = ease(t), extra = lerp(from === 0 ? 1 : 0, view === 0 ? 1 : 0, e), k2;   // 1 = the extra sheets are in use
            g.clearRect(0, 0, cv.width, cv.height);
            drawSheet(g, pad, top, s, sh, view === 0 ? "แผ่น 1 · เรียงตามกรอบ" : "แผ่น 1 · Costa Nest", 1, false);
            for (k2 = 1; k2 < n; k2++) {
                drawSheet(g, pad, top + k2 * stepY, s, sh, "แผ่น " + (k2 + 1), Math.max(0.12, extra), false);
                if (extra < 0.5) {
                    g.save(); g.globalAlpha = 1 - extra * 2; g.fillStyle = "rgba(74,222,128,0.9)"; g.font = "600 30px 'Plex Thai', sans-serif"; g.textAlign = "center";
                    g.fillText("ไม่ต้องใช้แผ่นที่ " + (k2 + 1), pad + sh.w * s / 2, top + k2 * stepY + sheetH / 2 + 10); g.restore();
                }
            }
            D.parts.forEach(function (p, i) {
                var k = Math.min(1, Math.max(0, (t * 1.25) - (i % 12) * 0.02)), a = poseOf(i, from), b = poseOf(i, view), q = easeBack(k);
                drawPart(g, p, lerp(a.x, b.x, q), lerp(a.y, b.y, q), lerp(a.a, b.a, ease(k)), s, pad, top, 1, k > 0 && k < 1);
            });
        }
        function go(v) {
            from = running ? from : view; view = v; T0 = 0; running = true;
            $("btnBefore").classList.toggle("on", v === 0); $("btnAfter").classList.toggle("on", v === 1);
            $("btnBefore").setAttribute("aria-pressed", String(v === 0)); $("btnAfter").setAttribute("aria-pressed", String(v === 1));
            if (RM) { from = v; running = false; draw(1); return; }
            requestAnimationFrame(function step(now) {
                if (!T0) { T0 = now; }
                var t = (now - T0) / dur;
                draw(Math.min(1, t));
                if (t < 1) { requestAnimationFrame(step); } else { from = view; running = false; }
            });
        }
        $("btnBefore").addEventListener("click", function () { go(0); });
        $("btnAfter").addEventListener("click", function () { go(1); });
        $("btnReplay").addEventListener("click", function () { from = 0; view = 0; draw(1); setTimeout(function () { go(1); }, 350); });
        // start as the "before" picture; when it scrolls into view, nest it
        from = 0; view = 0; draw(1);
        $("btnBefore").classList.add("on"); $("btnAfter").classList.remove("on");
        onSeen(cv, function () { setTimeout(function () { go(1); }, 400); });
    }

    // ---------------------------------------------------------------- numbers, reveal, spotlight
    function onSeen(el, fn) {
        if (!("IntersectionObserver" in window)) { fn(); return; }
        var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); fn(); } }); }, { threshold: 0.2 });
        io.observe(el);
    }
    function countUp(el) {
        var target = parseFloat(el.getAttribute("data-to") || el.textContent), dec = (String(el.getAttribute("data-to") || el.textContent).split(".")[1] || "").length;
        if (RM || !isFinite(target)) { el.textContent = fmt(target, dec); return; }
        var T0 = 0;
        requestAnimationFrame(function step(now) {
            if (!T0) { T0 = now; }
            var t = Math.min(1, (now - T0) / 1400);
            el.textContent = fmt(target * ease(t), dec);
            if (t < 1) { requestAnimationFrame(step); }
        });
    }
    function numbers() {
        if (!D) { return; }
        var saved = Math.round((1 - 1 / D.shelfSheets) * 100);
        $("dCount").textContent = D.count;
        $("dHead").textContent = "ใช้แผ่นน้อยลง " + saved + "%";
        $("sSheetsWas").textContent = D.shelfSheets;
        $("sUtilWas").textContent = fmt(D.shelfUtil, 1) + "%";
        $("sUtil").setAttribute("data-to", fmt(D.util, 1)); $("sUtil").textContent = "0.0";
        $("sSheets").setAttribute("data-to", "1");
        $("sUtilNote").textContent = "ใช้พื้นที่มากขึ้น " + fmt(D.util / D.shelfUtil, 1) + " เท่า";
        var st = document.querySelector(".stats");
        if (st) { onSeen(st, function () { [].forEach.call(document.querySelectorAll("[data-count]"), countUp); }); }
    }
    function reveal() {
        var els = document.querySelectorAll("[data-reveal]");
        if (RM || !("IntersectionObserver" in window)) { [].forEach.call(els, function (e) { e.classList.add("in"); }); return; }
        var io = new IntersectionObserver(function (es) {
            es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
        }, { threshold: 0.08, rootMargin: "0px 0px -30px 0px" });
        [].forEach.call(els, function (e, i) { e.style.transitionDelay = ((i % 4) * 70) + "ms"; io.observe(e); });
    }
    function spotlight() {
        [].forEach.call(document.querySelectorAll(".card"), function (c) {
            c.addEventListener("pointermove", function (ev) { var r = c.getBoundingClientRect(); c.style.setProperty("--mx", (ev.clientX - r.left) + "px"); c.style.setProperty("--my", (ev.clientY - r.top) + "px"); });
        });
    }

    function start() { reveal(); numbers(); hero(); demo(); spotlight(); }
    window.SITE_FX = { start: start };
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", start); } else { start(); }
})();
