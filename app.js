/* 刷题器 —— 纯前端，无依赖。
   题目数据在 data.js (window.QUIZ_DATA)。
   按科目 > 章节分开，题目不混。
*/
(function () {
  "use strict";

  var DATA = window.QUIZ_DATA || { courses: [] };

  // 防呆：web/src/ 是源码目录，题库不在这里。直接双击它会白屏，
  // 这里给个明确指引（web/dist/ 是本文件 + 题库的成品，不会走到这条分支）。
  if (!window.QUIZ_DATA) {
    var hint = document.getElementById("app");
    if (hint) {
      hint.innerHTML = "<div class='empty'>"
        + "这里是网站源码目录，题库不在这个文件夹里。<br><br>"
        + "要刷题请打开：<b>course/web/dist/index.html</b>"
        + "<br><br>要构建成品：<code>.venv/bin/python course/web/build.py</code>"
        + "</div>";
    }
    return;
  }
  var LS_SEQ = "quiz.seq.";        // 顺序模式进度
  var LS_SHEET = "quiz.sheet.";    // 答题卡记录
  var LS_STATS = "quiz.stats";     // 全局统计
  var LS_SHUFFLE = "quiz.shuffle"; // 随机顺序开关

  var app = document.getElementById("app");
  var crumbs = document.getElementById("crumbs");
  var foot = document.getElementById("foot");
  var brand = document.getElementById("brand");

  // ---------- 工具 ----------
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function esc(s) { return s == null ? "" : String(s); }

  function getJSON(k, dflt) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : dflt; }
    catch (e) { return dflt; }
  }
  function setJSON(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  function hash() { return location.hash.replace(/^#\/?/, ""); }
  function go(path) { location.hash = "#/" + path; }

  brand.addEventListener("click", function () { go(""); });

  function setCrumbs(items) {
    clear(crumbs);
    items.forEach(function (it, i) {
      if (i) crumbs.appendChild(el("span", "sep", "/"));
      if (it.href && i < items.length - 1) {
        var a = el("a", null, it.text);
        a.href = it.href;
        crumbs.appendChild(a);
      } else {
        crumbs.appendChild(el("span", i === items.length - 1 ? "cur" : null, it.text));
      }
    });
  }

  function courseByKey(k) {
    return DATA.courses.filter(function (c) { return c.key === k; })[0];
  }
  function chapterOf(courseKey, idx) {
    var c = courseByKey(courseKey);
    if (!c) return null;
    return c.chapters.filter(function (ch) { return ch.idx === idx; })[0] || null;
  }

  // ---------- 题型样式 ----------
  function typeClass(t) {
    if (t === "单选题") return "pill t1";
    if (t === "多选题") return "pill t2";
    if (t === "判断题") return "pill t3";
    return "pill t4";
  }
  function isMulti(q) { return q.type === "多选题"; }
  function isShort(q) { return q.type === "简答题" || (!q.options.length && q.type !== "判断题"); }
  function shuffleOn() { return !!getJSON(LS_SHUFFLE, false); }

  // 章节内的出题顺序（随机模式下按 slug 固定种子打乱，保证多次进入一致）
  function orderOf(ch) {
    var n = ch.questions.length;
    var idx = [];
    for (var i = 0; i < n; i++) idx.push(i);
    if (!shuffleOn()) return idx;
    var seed = 0;
    for (var k = 0; k < ch.slug.length; k++) seed = (seed * 31 + ch.slug.charCodeAt(k)) % 2147483647;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    for (var j = n - 1; j > 0; j--) {
      var r = Math.floor(rnd() * (j + 1));
      var t = idx[j]; idx[j] = idx[r]; idx[r] = t;
    }
    return idx;
  }

  // ---------- 答案判定 ----------
  // answer 字符串统一为：选择题 "ABD"（字母序），判断 "true"/"false"
  function norm(s) { return String(s || "").trim(); }
  function correctSet(q) {
    var a = norm(q.answer);
    if (q.type === "判断题") return a.toLowerCase();
    return a.toUpperCase().split("").sort().join("");
  }
  function pickSet(picked) {
    return picked.slice().sort().join("");
  }
  function isCorrect(q, picked) {
    var c = correctSet(q);
    if (!c) return null;              // 没有答案
    if (isShort(q)) return null;      // 简答题不自动判分
    if (q.type === "判断题") return String(picked) === c;
    return pickSet(picked) === c;
  }

  // ---------- 首页：选科目 ----------
  function renderHome() {
    setCrumbs([{ text: "全部科目" }]);
    clear(app);
    if (!DATA.courses.length) {
      app.appendChild(el("div", "empty", "数据未生成，请先运行 build_site.py"));
      return;
    }
    var grid = el("div", "course-grid");
    DATA.courses.forEach(function (c) {
      var total = 0, miss = 0;
      c.chapters.forEach(function (ch) {
        ch.questions.forEach(function (q) {
          total++;
          if (!q.answer) miss++;
        });
      });
      var a = el("a", "course-card");
      a.href = "#/c/" + c.key;
      a.appendChild(el("div", "name", c.name));
      a.appendChild(el("div", "sub",
        c.chapters.length + " 个章节 · " + total + " 题" + (miss ? " · 缺答案 " + miss : "")));
      grid.appendChild(a);
    });
    app.appendChild(grid);

    var st = getJSON(LS_STATS, { right: 0, total: 0 });
    if (st.total > 0) {
      var box = el("div", "card");
      box.style.marginTop = "14px";
      box.appendChild(el("h2", null, "累计练习"));
      box.appendChild(el("div", "meta",
        "已答 " + st.total + " 题 · 正确 " + st.right + " 题 · 正确率 " +
        (st.total ? Math.round(st.right / st.total * 100) : 0) + "%"));
      var b = el("button", "btn small ghost", "清零");
      b.style.marginTop = "10px";
      b.onclick = function () { setJSON(LS_STATS, { right: 0, total: 0 }); renderHome(); };
      box.appendChild(b);
      app.appendChild(box);
    }
  }

  // ---------- 章节列表 ----------
  function renderCourse(key) {
    var c = courseByKey(key);
    if (!c) { go(""); return; }
    setCrumbs([{ text: "全部科目", href: "#/" }, { text: c.name }]);
    clear(app);

    var heading = el("div", "card");
    heading.appendChild(el("h2", null, c.name));
    var totalQ = 0;
    c.chapters.forEach(function (ch) { totalQ += ch.questions.length; });
    heading.appendChild(el("div", "meta", c.chapters.length + " 个章节 · 共 " + totalQ + " 题"));
    app.appendChild(heading);

    c.chapters.forEach(function (ch) {
      var seq = getJSON(LS_SEQ + ch.slug, { i: 0, done: {} });
      var doneN = Object.keys(seq.done || {}).length;
      var pct = ch.questions.length ? Math.round(doneN / ch.questions.length * 100) : 0;

      var row = el("a", "chap-row");
      row.href = "#/q/" + ch.slug;
      row.appendChild(el("div", "num", ch.num));
      var body = el("div", "body");
      body.appendChild(el("div", "title", ch.title || ("第 " + ch.idx + " 章")));
      body.appendChild(el("div", "sub",
        ch.questions.length + " 题 · 已做 " + doneN + " · " + pct + "%"));
      var bar = el("div", "bar");
      var fill = el("i");
      fill.style.width = pct + "%";
      bar.appendChild(fill);
      body.appendChild(bar);
      row.appendChild(body);
      row.appendChild(el("div", "go", "›"));
      app.appendChild(row);
    });
  }

  // ---------- 刷题 ----------
  var state = null;  // 当前章节练习状态

  function loadState(ch) {
    var saved = getJSON(LS_SHEET + ch.slug, {});
    var order = orderOf(ch);
    var pos = getJSON(LS_SEQ + ch.slug, { i: 0 }).i || 0;
    if (pos >= order.length) pos = 0;
    return {
      ch: ch,
      order: order,
      pos: pos,
      picked: {},      // 本页临时选择（多选题未提交前）
      sheet: saved,    // 已提交结果 {原始索引: {picked, ok}}
      shortText: {},   // 简答题草稿
      showAnswer: false
    };
  }

  function curIndex() { return state.order[state.pos]; }

  function saveSheet() {
    if (!state) return;
    setJSON(LS_SHEET + state.ch.slug, state.sheet);
    var done = {};
    Object.keys(state.sheet).forEach(function (k) { done[k] = 1; });
    setJSON(LS_SEQ + state.ch.slug, { i: state.pos, done: done });
  }

  function renderQuiz(slug) {
    var parts = slug.split("_");
    var key = parts.slice(0, -1).join("_");
    var idx = parseInt(parts[parts.length - 1], 10);
    var ch = chapterOf(key, idx);
    if (!ch) { go(""); return; }
    var course = courseByKey(key);

    setCrumbs([
      { text: "全部科目", href: "#/" },
      { text: course.name, href: "#/c/" + key },
      { text: ch.title || ch.num }
    ]);

    state = loadState(ch);
    renderQuestion();
  }

  function renderQuestion() {
    var ch = state.ch;
    var qs = ch.questions;
    var i = curIndex();
    var q = qs[i];
    var rec = state.sheet[i];
    var submitted = !!rec;
    var short = isShort(q);
    var picked = submitted ? rec.picked : (state.picked[state.pos] || []);
    var ok = submitted ? rec.ok : null;

    clear(app);
    if (!q) { app.appendChild(el("div", "empty", "本章暂无题目")); return; }

    // 头部
    var head = el("div", "quiz-head");
    var pos = el("div", "pos");
    pos.innerHTML = "第 <b>" + (state.pos + 1) + "</b> / " + qs.length + " 题"
      + (shuffleOn() ? "　<span style='font-size:12px;opacity:.7'>随机</span>" : "");
    head.appendChild(pos);

    var pills = el("div");
    pills.style.display = "flex";
    pills.style.gap = "8px";
    pills.appendChild(el("span", typeClass(q.type), q.type));
    if (submitted) {
      if (short) pills.appendChild(el("span", "pill t4", "已看答案"));
      else pills.appendChild(el("span", "pill " + (ok ? "t3" : "t4"), ok ? "已答对" : "答错了"));
    }
    head.appendChild(pills);
    app.appendChild(head);

    // 题干
    var stemLine = el("div", "stem");
    stemLine.textContent = (q.n ? q.n + ". " : "") + q.stem;
    app.appendChild(stemLine);

    // 选项 / 简答输入
    if (short) {
      var box = el("div", "card");
      box.style.background = "var(--panel2)";
      if (!submitted) {
        box.appendChild(el("div", "meta", "简答题：先自己写，提交后对照参考答案"));
        var ta = document.createElement("textarea");
        ta.placeholder = "在这里写下你的答案（可不填，直接提交看参考答案）";
        ta.value = state.shortText[i] || "";
        ta.style.cssText = "width:100%;min-height:120px;margin-top:10px;padding:12px;"
          + "border-radius:10px;border:1px solid var(--line);background:var(--panel);"
          + "color:var(--fg);font:14px/1.7 inherit;resize:vertical;box-sizing:border-box";
        ta.oninput = function () { state.shortText[i] = ta.value; };
        box.appendChild(ta);
      } else {
        if (rec.mine) {
          box.appendChild(el("div", "meta", "你的作答"));
          var mine = el("div", null, rec.mine);
          mine.style.cssText = "margin:6px 0 14px;color:var(--fg);white-space:pre-wrap";
          box.appendChild(mine);
        }
        box.appendChild(el("div", "meta", "参考答案"));
        var ref = el("div", null, q.answer || "（无）");
        ref.style.cssText = "margin-top:6px;color:var(--fg);white-space:pre-wrap;line-height:1.8";
        box.appendChild(ref);
      }
      app.appendChild(box);
    } else {
      var optWrap = el("div");
      q.options.forEach(function (o) {
        var isOn = picked.indexOf(o.key) > -1;
        var cls = "opt";
        if (submitted) {
          cls += " locked";
          var cset = correctSet(q);
          var isRight;
          if (q.type === "判断题") isRight = String(cset) === String(o.key).toLowerCase();
          else isRight = cset.indexOf(String(o.key).toUpperCase()) > -1;
          if (isRight) cls += " correct";
          else if (isOn) cls += " wrong";
        } else if (isOn) {
          cls += " sel";
        }
        var d = el("div", cls);
        d.appendChild(el("div", "key", o.key === "true" ? "对" : o.key === "false" ? "错" : o.key));
        d.appendChild(el("div", "text", o.text));
        if (!submitted) {
          d.onclick = function () { togglePick(q, state.pos, o.key); };
        }
        optWrap.appendChild(d);
      });
      app.appendChild(optWrap);
    }

    // 已提交反馈（选择题）
    if (submitted && !short) {
      var fb = el("div", "feedback " + (ok ? "ok" : "bad"));
      var line = el("div", "line");
      line.appendChild(el("span", "k", "正确答案"));
      var exp = q.answer;
      if (q.type === "判断题") exp = (String(q.answer).toLowerCase() === "true" ? "对（true）" : "错（false）");
      line.appendChild(el("span", "v", exp || "（暂无）"));
      fb.appendChild(line);
      if (q.note) fb.appendChild(el("div", "note", q.note));
      if (q.confidence && q.confidence !== "high") {
        var ctext = q.confidence === "medium" ? "中（可能不完全准确）" : "低（仅供参考）";
        fb.appendChild(el("div", "conf", "答案可信度：" + ctext));
      }
      app.appendChild(fb);
    }

    // 操作区
    var acts = el("div", "actions");

    var prev = el("button", "btn", "← 上一题");
    prev.disabled = state.pos === 0;
    prev.onclick = function () { gotoQ(state.pos - 1); };

    var last = state.pos === qs.length - 1;
    var nextText;
    if (last && submitted) nextText = "完成本章 ✓";
    else if (last) nextText = short ? "提交并看答案 →" : "提交本题 →";
    else if (submitted) nextText = "下一题 →";
    else if (short) nextText = "提交并看答案 →";
    else nextText = "提交并下一题 →";
    var next = el("button", "btn primary", nextText);
    next.disabled = !submitted && !short && picked.length === 0;
    next.onclick = function () {
      var isLast = state.pos === qs.length - 1;
      if (!submitted) {
        submit(q, i, picked);
        // 最后一题先显示反馈，再点一次才进入完成页
        if (isLast) renderQuestion();
        else gotoQ(state.pos + 1);
        return;
      }
      if (isLast) highlightEnd();
      else gotoQ(state.pos + 1);
    };

    var reveal = el("button", "btn ghost", submitted ? "撤销这题" : "直接看答案");
    reveal.onclick = function () {
      if (submitted) {
        delete state.sheet[i];
        state.picked[state.pos] = [];
        state.shortText[i] = "";
        saveSheet();
      } else {
        state.sheet[i] = { picked: picked, ok: false, peek: true, mine: state.shortText[i] || "" };
        saveSheet();
      }
      renderQuestion();
    };

    acts.appendChild(prev);
    acts.appendChild(next);
    acts.appendChild(reveal);

    var sp = el("div", "spacer");
    acts.appendChild(sp);

    var shuf = el("button", "btn ghost small", shuffleOn() ? "顺序：随机" : "顺序：题号");
    shuf.onclick = function () {
      setJSON(LS_SHUFFLE, !shuffleOn());
      state.order = orderOf(ch);
      state.pos = 0;
      saveSheet();
      renderQuestion();
    };
    acts.appendChild(shuf);

    var sheetBtn = el("button", "btn ghost small", "答题卡");
    sheetBtn.onclick = function () { toggleSheet(); };
    acts.appendChild(sheetBtn);

    app.appendChild(acts);

    // 答题卡
    var sheetBox = el("div", "card");
    sheetBox.id = "sheetbox";
    sheetBox.style.display = "none";
    sheetBox.appendChild(el("h2", null, "答题卡"));
    var sg = el("div", "sheet");
    state.order.forEach(function (qi, p) {
      var r = state.sheet[qi];
      var c = "cell";
      if (r) c += (isShort(qs[qi]) ? " done" : (r.ok ? " right" : " wrong"));
      if (p === state.pos) c += " cur";
      var cell = el("div", c, String(p + 1));
      cell.title = qs[qi].type + (qs[qi].n ? " 第" + qs[qi].n + "题" : "");
      cell.onclick = function () { gotoQ(p); };
      sg.appendChild(cell);
    });
    sheetBox.appendChild(sg);
    app.appendChild(sheetBox);

    // 键盘
    document.onkeydown = function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === "ArrowLeft") { if (state.pos > 0) gotoQ(state.pos - 1); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { next.click(); }
      else if (/^[1-9]$/.test(e.key)) {
        var n = parseInt(e.key, 10) - 1;
        if (!submitted && q.options[n]) togglePick(q, state.pos, q.options[n].key);
      }
      else if (/^[a-dA-D]$/.test(e.key)) {
        var k = e.key.toUpperCase();
        var found = q.options.filter(function (o) { return o.key === k; })[0];
        if (found && !submitted) togglePick(q, state.pos, k);
      }
    };

    updateFoot();
    window.scrollTo(0, 0);
  }

  function toggleSheet() {
    var b = document.getElementById("sheetbox");
    if (b) b.style.display = b.style.display === "none" ? "block" : "none";
  }

  function togglePick(q, pos, k) {
    var cur = state.picked[pos] || [];
    if (isMulti(q)) {
      var at = cur.indexOf(k);
      if (at > -1) cur.splice(at, 1); else cur.push(k);
      cur.sort();
    } else {
      cur = [k];
    }
    state.picked[pos] = cur;
    renderQuestion();
  }

  function submit(q, i, picked) {
    var short = isShort(q);
    var ok;
    if (short) ok = true;  // 简答题不计对错，仅记录已看
    else {
      ok = isCorrect(q, q.type === "判断题" ? picked[0] : picked);
      if (ok === null) ok = false;
    }
    state.sheet[i] = {
      picked: short ? [] : picked.slice(),
      ok: ok,
      peek: false,
      mine: short ? (state.shortText[i] || "") : ""
    };
    saveSheet();
    if (!short) {
      var st = getJSON(LS_STATS, { right: 0, total: 0 });
      st.total += 1;
      if (ok) st.right += 1;
      setJSON(LS_STATS, st);
    }
  }

  function gotoQ(p) {
    if (p < 0 || p >= state.order.length) return;
    state.pos = p;
    state.picked[p] = state.picked[p] || [];
    var done = {};
    Object.keys(state.sheet).forEach(function (k) { done[k] = 1; });
    setJSON(LS_SEQ + state.ch.slug, { i: p, done: done });
    renderQuestion();
  }

  function highlightEnd() {
    var ch = state.ch;
    var total = ch.questions.length;
    var right = 0, answered = 0, objAnswered = 0;
    ch.questions.forEach(function (q, j) {
      var r = state.sheet[j];
      if (r) {
        answered++;
        if (!isShort(q)) { objAnswered++; if (r.ok) right++; }
      }
    });
    clear(app);
    var box = el("div", "card");
    box.appendChild(el("h2", null, "本章完成"));
    box.appendChild(el("div", "meta", ch.title));
    var g = el("div", "stat-grid");
    g.style.marginTop = "16px";
    var rate = objAnswered ? Math.round(right / objAnswered * 100) + "%" : "—";
    [["已答", answered + "/" + total], ["答对", String(right)],
     ["正确率", rate]].forEach(function (p) {
      var s = el("div", "stat");
      s.appendChild(el("div", "n", p[1]));
      s.appendChild(el("div", "l", p[0]));
      g.appendChild(s);
    });
    box.appendChild(g);

    var acts = el("div", "actions");
    var again = el("button", "btn primary", "重做本章");
    again.onclick = function () {
      state.sheet = {};
      state.picked = {};
      state.shortText = {};
      saveSheet();
      gotoQ(0);
    };
    var back = el("button", "btn", "返回章节列表");
    back.onclick = function () { go("c/" + state.ch.slug.split("_").slice(0, -1).join("_")); };
    acts.appendChild(again);
    acts.appendChild(back);
    box.appendChild(acts);
    app.appendChild(box);
    updateFoot();
  }

  function updateFoot() {
    clear(foot);
    if (!state) {
      foot.appendChild(el("span", null, "题目按科目与章节隔离，不会混淆"));
      foot.appendChild(el("span", null, "键盘：← → 切题，Enter 提交，数字/字母选答案"));
      return;
    }
    var ch = state.ch;
    var answered = Object.keys(state.sheet).length;
    foot.appendChild(el("span", null, ch.title + " · " + (state.pos + 1) + "/" + ch.questions.length));
    foot.appendChild(el("span", null, "已答 " + answered));
    foot.appendChild(el("span", null, "← → 切题 · Enter 提交 · 1-9/A-D 选答"));
  }

  function route() {
    var h = hash();
    if (!h) { state = null; renderHome(); updateFoot(); return; }
    var seg = h.split("/");
    if (seg[0] === "c" && seg[1]) { state = null; renderCourse(seg[1]); updateFoot(); return; }
    if (seg[0] === "q" && seg[1]) { renderQuiz(seg[1]); return; }
    go("");
  }

  window.addEventListener("hashchange", route);
  document.addEventListener("DOMContentLoaded", route);
  if (document.readyState !== "loading") route();

  // PWA 离线：仅在 HTTPS（Cloudflare Pages 等）注册，file:// 与本地 http 跳过
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
