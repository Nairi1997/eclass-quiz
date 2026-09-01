// ===== Data (loaded from external JSON files) =====
let QUIZ_DATA = [];
let BOOK_TOC = [];

// ===== State =====
let state = {
  mode: "chapter",
  filterCh: "ch1",
  filterKd: "考点一",
  currentIdx: 0,
  selected: [],
  answered: false,
  results: {},
  wrongSet: new Set(),
  favSet: new Set(),
  wrongCorrectCount: {},  // 错题强化：连续答对次数 {qid: count}
  examQuestions: [],
  examStartTime: 0,
  examTimeLimit: 1200,
  examTimer: null,
  searchQuery: "",
  tagFilter: "all",
  customQuestions: null,  // 智能组卷的题目列表
  shuffledOptMap: {},     // 打乱选项的映射 {qid: [perm]}
};

let settings = {
  autoNext: false,
  autoDelay: 1500,
  explainExpand: false,
  shuffleOpts: false,
  darkMode: false,
  showTags: true,
  examTime: 1200,
  examCount: 50,
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("EclassQuizState"));
    if (saved) {
      state.results = saved.results || {};
      state.wrongSet = new Set(saved.wrongSet || []);
      state.favSet = new Set(saved.favSet || []);
      state.wrongCorrectCount = saved.wrongCorrectCount || {};
    }
    
    // 自动清除已修复题目的旧答题记录（因答案曾出错，旧记录不可靠）
    const FIXED_QIDS = [8, 2001, 2012];  // 曾修复答案的题目ID
    let needClean = false;
    FIXED_QIDS.forEach(qid => {
      if (state.results[qid]) {
        delete state.results[qid];
        state.wrongSet.delete(qid);
        delete state.wrongCorrectCount[qid];
        needClean = true;
      }
    });
    if (needClean) saveState();
    
    const savedSettings = JSON.parse(localStorage.getItem("EclassQuizSettings"));
    if (savedSettings) {
      Object.assign(settings, savedSettings);
    }
    const savedTheme = localStorage.getItem("EclassQuizTheme");
    if (savedTheme === "dark") {
      settings.darkMode = true;
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch(e) {}
}
function saveState() {
  localStorage.setItem("EclassQuizState", JSON.stringify({
    results: state.results,
    wrongSet: Array.from(state.wrongSet),
    favSet: Array.from(state.favSet),
    wrongCorrectCount: state.wrongCorrectCount,
  }));
}
function saveSettings() {
  localStorage.setItem("EclassQuizSettings", JSON.stringify(settings));
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getShuffledOpts(q) {
  if (!settings.shuffleOpts) return null;
  if (state.shuffledOptMap[q.id]) return state.shuffledOptMap[q.id];
  const indices = q.opts.map((_, i) => i);
  const perm = shuffleArray(indices);
  state.shuffledOptMap[q.id] = perm;
  return perm;
}

function getQuestions() {
  // 搜索模式
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    return QUIZ_DATA.filter(item =>
      item.q.toLowerCase().includes(q) ||
      item.opts.some(o => o.toLowerCase().includes(q)) ||
      item.explain.toLowerCase().includes(q) ||
      item.chTitle.includes(q) ||
      item.kdTitle.includes(q)
    );
  }
  // 智能组卷
  if (state.customQuestions) return state.customQuestions;
  // 模考模式
  if (state.mode === "exam" && state.examQuestions.length > 0) return state.examQuestions;
  if (state.mode === "wrong") return QUIZ_DATA.filter(q => state.wrongSet.has(q.id));
  if (state.mode === "wrong-drill") return QUIZ_DATA.filter(q => state.wrongSet.has(q.id));
  if (state.mode === "fav") return QUIZ_DATA.filter(q => state.favSet.has(q.id));
  if (state.mode === "all") return QUIZ_DATA.slice();
  if (state.mode === "random") {
    // 随机练习：当前章节范围内打乱
    let pool = QUIZ_DATA.filter(q => q.ch === state.filterCh);
    if (pool.length === 0) pool = QUIZ_DATA.slice();
    return shuffleArray(pool);
  }
  if (state.mode === "quickcard") {
    let pool = QUIZ_DATA.filter(q => q.ch === state.filterCh);
    if (pool.length === 0) pool = QUIZ_DATA.slice();
    return pool;
  }
  // 默认按考点（支持"全部考点"）
  if (state.filterKd === "all") {
    return QUIZ_DATA.filter(q => q.ch === state.filterCh);
  }
  return QUIZ_DATA.filter(q => q.ch === state.filterCh && q.kd === state.filterKd);
}

function renderSidebar() {
  const nav = document.getElementById("sidebar-nav");
  let html = "";
  BOOK_TOC.forEach(part => {
    const partOpen = part.open ? "open" : "";
    let piansHtml = "";
    part.pians.forEach(pian => {
      const pianOpen = pian.open ? "open" : "";
      let chHtml = "";
      pian.chapters.forEach(ch => {
        const qCount = ch.hasQuestions ? QUIZ_DATA.filter(q => q.ch === ch.ch).length : 0;
        const isActive = state.filterCh === ch.ch ? "active" : "";
        const disabled = !ch.hasQuestions ? "disabled" : "";
        const chOpen = state.filterCh === ch.ch ? "open" : "";
        if (ch.hasQuestions) {
          // 获取该章节的所有考点
          const kds = [...new Set(QUIZ_DATA.filter(q => q.ch === ch.ch).map(q => q.kd))];
          const kdTitles = {};
          QUIZ_DATA.filter(q => q.ch === ch.ch).forEach(q => { kdTitles[q.kd] = q.kdTitle; });
          
          let kdHtml = "";
          // "全部题目"选项
          kdHtml += `<div class="kd-item ${state.filterKd === 'all' && state.filterCh === ch.ch ? 'active' : ''}" data-ch="${ch.ch}" data-kd="all">
            <span>全部题目</span><span class="kd-count">(${qCount})</span>
          </div>`;
          // 各考点
          kds.forEach(kd => {
            const kdCount = QUIZ_DATA.filter(q => q.ch === ch.ch && q.kd === kd).length;
            const kdActive = state.filterKd === kd && state.filterCh === ch.ch ? "active" : "";
            kdHtml += `<div class="kd-item ${kdActive}" data-ch="${ch.ch}" data-kd="${kd}">
              <span>${kd} ${kdTitles[kd]}</span><span class="kd-count">(${kdCount})</span>
            </div>`;
          });

          chHtml += `<div class="chapter-group ${chOpen}">
            <div class="chapter-item ${isActive}" data-ch="${ch.ch}">
              <span>${ch.title}</span>
              <span class="ch-count">${qCount}题</span>
            </div>
            <div class="kd-list">${kdHtml}</div>
          </div>`;
        } else {
          chHtml += `<div class="chapter-group">
            <div class="chapter-item disabled">
              <span>${ch.title}</span>
              <span class="coming-soon">待添加</span>
            </div>
          </div>`;
        }
      });
      piansHtml += `
        <div class="pian-group ${pianOpen}">
          <div class="pian-title" data-pian="${pian.pian}">
            <span>${pian.pianTitle}</span>
            <span class="arrow">▶</span>
          </div>
          <div class="pian-content">${chHtml}</div>
        </div>
      `;
    });
    html += `
      <div class="part-group ${partOpen}">
        <div class="part-title" data-part="${part.part}">
          <span>${part.partTitle}</span>
          <span class="arrow">▶</span>
        </div>
        <div class="part-content">${piansHtml}</div>
      </div>
    `;
  });
  nav.innerHTML = html;

  nav.querySelectorAll(".part-title").forEach(el => {
    el.addEventListener("click", () => {
      const group = el.closest(".part-group");
      group.classList.toggle("open");
    });
  });
  nav.querySelectorAll(".pian-title").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const group = el.closest(".pian-group");
      group.classList.toggle("open");
    });
  });
  // 章节点击 - 展开考点列表
  nav.querySelectorAll(".chapter-item").forEach(el => {
    if (el.classList.contains("disabled")) return;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const chId = el.dataset.ch;
      const chGroup = el.closest(".chapter-group");
      // 切换展开状态
      const wasOpen = chGroup.classList.contains("open");
      // 先关闭所有其他章节的展开
      nav.querySelectorAll(".chapter-group").forEach(g => g.classList.remove("open"));
      if (!wasOpen) {
        chGroup.classList.add("open");
      }
      // 加载该章节第一个考点
      state.filterCh = chId;
      const kds = [...new Set(QUIZ_DATA.filter(q => q.ch === chId).map(q => q.kd))];
      if (kds.length > 0) state.filterKd = kds[0];
      state.mode = "chapter";
      state.currentIdx = 0;
      state.selected = [];
      state.answered = false;
      closeSidebarDrawer();
      updateModeButtons();
      renderSidebar();
      renderQuestion();
    });
  });
  // 考点点击
  nav.querySelectorAll(".kd-item").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const chId = el.dataset.ch;
      const kd = el.dataset.kd;
      state.filterCh = chId;
      state.filterKd = kd;
      state.mode = "chapter";
      state.currentIdx = 0;
      state.selected = [];
      state.answered = false;
      closeSidebarDrawer();
      updateModeButtons();
      renderSidebar();
      renderQuestion();
    });
  });
}

function updateStats() {
  const total = QUIZ_DATA.length;
  const done = Object.keys(state.results).length;
  const correct = Object.values(state.results).filter(r => r.correct).length;
  const wrong = state.wrongSet.size;
  const fav = state.favSet.size;
  const rate = done > 0 ? Math.round(correct / done * 100) : 0;
  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-done").textContent = done;
  document.getElementById("stat-correct").textContent = correct;
  document.getElementById("stat-wrong").textContent = wrong;
  document.getElementById("stat-rate").textContent = rate + "%";
  document.getElementById("wrong-count").textContent = wrong;
  document.getElementById("fav-count").textContent = fav;
  document.getElementById("welcome-total").textContent = total;
}

function renderQuestion() {
  const questions = getQuestions();
  const card = document.getElementById("question-card");
  const welcome = document.getElementById("welcome-card");
  const dotsArea = document.getElementById("progress-dots");
  const examResult = document.getElementById("exam-result-card");
  const tagBar = document.getElementById("tag-filter-bar");
  const kdSwitcher = document.getElementById("kd-switcher");

  // 模考模式已结束
  if (examResult.classList.contains("show")) {
    card.style.display = "none";
    welcome.style.display = "none";
    dotsArea.innerHTML = "";
    kdSwitcher.classList.remove("show");
    return;
  }

  // 考点切换栏（仅在章节练习模式下显示）
  if (state.mode === "chapter" && state.filterCh) {
    const chQuestions = QUIZ_DATA.filter(q => q.ch === state.filterCh);
    const kds = [...new Set(chQuestions.map(q => q.kd))];
    const kdTitles = {};
    chQuestions.forEach(q => { kdTitles[q.kd] = q.kdTitle; });
    const chTotal = chQuestions.length;
    
    let kdSwitchHtml = `<button class="kd-switch-btn ${state.filterKd === 'all' ? 'active' : ''}" data-kd="all">全部 (${chTotal})</button>`;
    kds.forEach(kd => {
      const kdCount = chQuestions.filter(q => q.kd === kd).length;
      kdSwitchHtml += `<button class="kd-switch-btn ${state.filterKd === kd ? 'active' : ''}" data-kd="${kd}">${kd} ${kdTitles[kd]} (${kdCount})</button>`;
    });
    kdSwitcher.innerHTML = kdSwitchHtml;
    kdSwitcher.classList.add("show");
    kdSwitcher.querySelectorAll(".kd-switch-btn").forEach(b => {
      b.addEventListener("click", () => {
        state.filterKd = b.dataset.kd;
        state.currentIdx = 0;
        state.selected = [];
        state.answered = false;
        renderQuestion();
        renderSidebar();
      });
    });
  } else {
    kdSwitcher.classList.remove("show");
  }

  // 标签筛选栏
  if (settings.showTags && (state.mode === "chapter" || state.mode === "all" || state.mode === "random" || state.mode === "fav" || state.mode === "quickcard")) {
    tagBar.innerHTML = `
      <button class="tag-filter-btn ${state.tagFilter==='all'?'active':''}" data-tag="all">全部</button>
      <button class="tag-filter-btn ${state.tagFilter==='memory'?'active':''}" data-tag="memory">记忆题</button>
      <button class="tag-filter-btn ${state.tagFilter==='understanding'?'active':''}" data-tag="understanding">理解题</button>
      <button class="tag-filter-btn ${state.tagFilter==='application'?'active':''}" data-tag="application">应用题</button>
    `;
    tagBar.querySelectorAll(".tag-filter-btn").forEach(b => {
      b.addEventListener("click", () => {
        state.tagFilter = b.dataset.tag;
        state.currentIdx = 0;
        state.selected = [];
        state.answered = false;
        renderQuestion();
      });
    });
  } else {
    tagBar.innerHTML = "";
  }

  // 速查卡模式
  if (state.mode === "quickcard") {
    renderQuickCard(questions);
    return;
  }

  if (questions.length === 0) {
    card.style.display = "none";
    welcome.style.display = "block";
    dotsArea.innerHTML = "";
    return;
  }

  card.style.display = "block";
  welcome.style.display = "none";

  if (state.currentIdx >= questions.length) state.currentIdx = questions.length - 1;
  if (state.currentIdx < 0) state.currentIdx = 0;

  const q = questions[state.currentIdx];

  let dotsHtml = "";
  questions.forEach((qq, i) => {
    let cls = "progress-dot";
    const res = state.results[qq.id];
    if (res) cls += res.correct ? " correct" : " wrong";
    if (i === state.currentIdx) cls += " current";
    dotsHtml += `<div class="${cls}" data-idx="${i}" title="第${i+1}题"></div>`;
  });
  dotsArea.innerHTML = dotsHtml;
  dotsArea.querySelectorAll(".progress-dot").forEach(d => {
    d.addEventListener("click", () => {
      state.currentIdx = parseInt(d.dataset.idx);
      state.selected = [];
      state.answered = false;
      renderQuestion();
    });
  });

  const isFav = state.favSet.has(q.id);
  document.getElementById("breadcrumb").innerHTML =
    `<span class="accent">${q.chTitle}</span> > <span class="accent">${q.kd}</span> ${q.kdTitle}` +
    ` <button class="fav-btn ${isFav?'active':''}" id="fav-toggle" title="收藏/取消">${isFav?'★':'☆'}</button>`;

  const typeLabel = {single:"单选题", multiple:"多选题", judge:"判断题"}[q.type];
  const diffLabel = {basic:"基础", medium:"进阶", hard:"挑战"}[q.diff];
  let tagHtml = `
    <span class="tag type-${q.type}">${typeLabel}</span>
    <span class="tag difficulty-${q.diff}">${diffLabel}</span>`;
  // 自动推断标签
  if (q.q.length < 25 && q.opts.length <= 4) tagHtml += `<span class="tag" style="background:#f3e8ff;color:#7c3aed">记忆</span>`;
  else if (q.explain.length > 100) tagHtml += `<span class="tag" style="background:#fef3c7;color:#b45309">理解</span>`;
  else tagHtml += `<span class="tag" style="background:#dcfce7;color:#15803d">应用</span>`;

  document.getElementById("question-meta").innerHTML = `
    <div class="question-tags">${tagHtml}</div>
    <div class="question-num">第 ${state.currentIdx + 1} / ${questions.length} 题</div>
  `;

  document.getElementById("question-text").innerHTML = q.q;

  // 选项渲染（支持打乱）
  const optPerm = getShuffledOpts(q);
  const displayOpts = optPerm ? optPerm.map(i => ({origIdx: i, text: q.opts[i]})) : q.opts.map((o, i) => ({origIdx: i, text: o}));

  const optArea = document.getElementById("options-area");
  optArea.innerHTML = `
    <ul class="options-list" id="opts">
      ${displayOpts.map((o, i) => `
        <li class="option-item" data-orig-idx="${o.origIdx}">
          <div class="option-label">${String.fromCharCode(65+i)}</div>
          <div class="option-text">${o.text}</div>
        </li>
      `).join("")}
    </ul>
  `;

  optArea.querySelectorAll(".option-item").forEach(el => {
    el.addEventListener("click", () => {
      if (state.answered) return;
      const origIdx = parseInt(el.dataset.origIdx);
      if (q.type === "multiple") {
        el.classList.toggle("selected");
        if (!state.selected.includes(origIdx)) state.selected.push(origIdx);
        else state.selected = state.selected.filter(x => x !== origIdx);
      } else {
        optArea.querySelectorAll(".option-item").forEach(e => e.classList.remove("selected"));
        el.classList.add("selected");
        state.selected = [origIdx];
      }
      document.getElementById("submit-btn").disabled = state.selected.length === 0;
    });
  });

  const feedback = document.getElementById("feedback");
  feedback.className = "feedback";
  feedback.innerHTML = "";

  if (state.results[q.id]) {
    const r = state.results[q.id];
    state.selected = r.selected.slice();
    state.answered = true;
    showResult(q, r.correct);
  } else {
    state.selected = [];
    state.answered = false;
  }

  // 收藏按钮事件
  const favBtn = document.getElementById("fav-toggle");
  if (favBtn) {
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.favSet.has(q.id)) {
        state.favSet.delete(q.id);
        favBtn.textContent = "☆";
        favBtn.classList.remove("active");
      } else {
        state.favSet.add(q.id);
        favBtn.textContent = "★";
        favBtn.classList.add("active");
      }
      saveState();
      updateStats();
    });
  }

  document.getElementById("prev-btn").disabled = state.currentIdx === 0;
  document.getElementById("submit-btn").disabled = state.selected.length === 0 || state.answered;
  document.getElementById("next-btn").disabled = state.currentIdx === questions.length - 1;
  if (state.answered) {
    document.getElementById("submit-btn").textContent = "已作答";
    document.getElementById("submit-btn").disabled = true;
  } else {
    document.getElementById("submit-btn").textContent = "提交答案";
  }
}

function renderQuickCard(questions) {
  const card = document.getElementById("question-card");
  const welcome = document.getElementById("welcome-card");
  const dotsArea = document.getElementById("progress-dots");
  if (questions.length === 0) {
    card.style.display = "none";
    welcome.style.display = "block";
    return;
  }
  card.style.display = "block";
  welcome.style.display = "none";
  if (state.currentIdx >= questions.length) state.currentIdx = 0;

  const q = questions[state.currentIdx];
  const correctAns = Array.isArray(q.ans) ? q.ans : [q.ans];
  const correctText = correctAns.map(i => String.fromCharCode(65+i) + ". " + q.opts[i]).join("; ");

  document.getElementById("breadcrumb").innerHTML =
    `<span class="accent">${q.chTitle}</span> > <span class="accent">${q.kd}</span> ${q.kdTitle} <span style="color:var(--muted);font-size:12px">[速查卡]</span>`;
  document.getElementById("question-meta").innerHTML = `
    <div class="question-tags">
      <span class="tag type-${q.type}">${{single:"单选",multiple:"多选",judge:"判断"}[q.type]}</span>
    </div>
    <div class="question-num">第 ${state.currentIdx + 1} / ${questions.length} 题</div>
  `;
  document.getElementById("question-text").innerHTML = q.q;
  document.getElementById("options-area").innerHTML = `
    <div class="quick-card">
      <div class="qc-answer">✓ 正确答案：${correctText}</div>
      <div class="feedback-explanation">${q.explain}</div>
    </div>
  `;
  document.getElementById("feedback").innerHTML = "";
  document.getElementById("feedback").className = "feedback";

  // 进度点
  let dotsHtml = "";
  questions.forEach((qq, i) => {
    let cls = "progress-dot";
    if (i === state.currentIdx) cls += " current";
    dotsHtml += `<div class="${cls}" data-idx="${i}"></div>`;
  });
  dotsArea.innerHTML = dotsHtml;
  dotsArea.querySelectorAll(".progress-dot").forEach(d => {
    d.addEventListener("click", () => {
      state.currentIdx = parseInt(d.dataset.idx);
      renderQuestion();
    });
  });

  document.getElementById("prev-btn").disabled = state.currentIdx === 0;
  document.getElementById("submit-btn").style.display = "none";
  document.getElementById("next-btn").disabled = state.currentIdx === questions.length - 1;
}

function showResult(q, isCorrect) {
  const opts = document.querySelectorAll("#opts .option-item");
  const correctAns = Array.isArray(q.ans) ? q.ans : [q.ans];

  opts.forEach(el => {
    const origIdx = parseInt(el.dataset.origIdx);
    el.classList.add("disabled");
    if (correctAns.includes(origIdx)) {
      el.classList.add("correct");
    } else if (state.selected.includes(origIdx)) {
      el.classList.add("wrong");
    }
  });

  const feedback = document.getElementById("feedback");
  feedback.className = "feedback show " + (isCorrect ? "correct" : "wrong");
  const correctText = correctAns.map(i => String.fromCharCode(65+i)).join("、");

  // 解析分级展示：默认简版，点击展开
  const briefExplain = q.explain.substring(0, 60) + (q.explain.length > 60 ? "..." : "");
  const isExpanded = settings.explainExpand;

  feedback.innerHTML = `
    <div class="feedback-title">${isCorrect ? "✓ 回答正确" : "✗ 回答错误"}</div>
    <div class="feedback-answer">正确答案：${correctText}</div>
    <div class="feedback-explanation">
      ${isExpanded ? q.explain : briefExplain}
      ${q.explain.length > 60 ? `<div class="explain-detail-toggle" id="explain-toggle">${isExpanded ? '收起' : '展开详情'}</div>` : ''}
    </div>
  `;

  const toggle = document.getElementById("explain-toggle");
  if (toggle) {
    let expanded = isExpanded;
    const explainDiv = toggle.parentElement;
    const briefText = briefExplain;
    const fullText = q.explain;
    const updateExplain = () => {
      explainDiv.innerHTML = expanded
        ? `${fullText}<div class="explain-detail-toggle" id="explain-toggle">收起</div>`
        : `${briefText}<div class="explain-detail-toggle" id="explain-toggle">展开详情</div>`;
      const newToggle = document.getElementById("explain-toggle");
      newToggle.addEventListener("click", () => {
        expanded = !expanded;
        updateExplain();
      });
    };
    toggle.addEventListener("click", () => {
      expanded = !expanded;
      updateExplain();
    });
  }
}

function submitAnswer() {
  const questions = getQuestions();
  const q = questions[state.currentIdx];
  if (state.answered || state.selected.length === 0) return;

  const correctAns = Array.isArray(q.ans) ? q.ans : [q.ans];
  const isCorrect = q.type === "multiple"
    ? state.selected.length === correctAns.length && state.selected.every(s => correctAns.includes(s))
    : state.selected.length === 1 && correctAns.includes(state.selected[0]);

  state.results[q.id] = { correct: isCorrect, selected: state.selected.slice() };
  if (!isCorrect) {
    state.wrongSet.add(q.id);
    state.wrongCorrectCount[q.id] = 0;
  } else {
    // 错题强化模式：连续答对2次自动移出错题本
    if (state.mode === "wrong-drill") {
      state.wrongCorrectCount[q.id] = (state.wrongCorrectCount[q.id] || 0) + 1;
      if (state.wrongCorrectCount[q.id] >= 2) {
        state.wrongSet.delete(q.id);
        delete state.wrongCorrectCount[q.id];
      }
    } else {
      state.wrongSet.delete(q.id);
    }
  }
  state.answered = true;
  saveState();
  updateStats();
  showResult(q, isCorrect);

  document.getElementById("submit-btn").textContent = "已作答";
  document.getElementById("submit-btn").disabled = true;

  // 自动跳下一题
  if (settings.autoNext && isCorrect) {
    setTimeout(() => {
      if (state.currentIdx < questions.length - 1) nextQuestion();
    }, settings.autoDelay);
  }
}

function nextQuestion() {
  const questions = getQuestions();
  if (state.currentIdx < questions.length - 1) {
    state.currentIdx++;
    state.selected = [];
    state.answered = false;
    renderQuestion();
  }
}
function prevQuestion() {
  if (state.currentIdx > 0) {
    state.currentIdx--;
    state.selected = [];
    state.answered = false;
    renderQuestion();
  }
}

function updateModeButtons() {
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === state.mode);
  });
  const wp = document.getElementById("wrong-panel");
  wp.classList.toggle("show", state.mode === "wrong" || state.mode === "wrong-drill");
  if (state.mode === "wrong" || state.mode === "wrong-drill") {
    renderWrongPanel();
  }
  // 模考计时器
  const timerBar = document.getElementById("exam-timer-bar");
  timerBar.classList.toggle("show", state.mode === "exam");
  // 速查卡模式隐藏提交按钮
  const submitBtn = document.getElementById("submit-btn");
  submitBtn.style.display = state.mode === "quickcard" ? "none" : "";
  // 模考结果卡片隐藏
  if (state.mode !== "exam") {
    document.getElementById("exam-result-card").classList.remove("show");
  }
}

function renderWrongPanel() {
  const list = document.getElementById("wrong-list");
  const count = document.getElementById("wrong-panel-count");
  const wrongIds = Array.from(state.wrongSet);
  count.textContent = `(${wrongIds.length}题)`;
  if (wrongIds.length === 0) {
    list.innerHTML = '<li class="empty-state">暂无错题，继续保持！</li>';
    return;
  }
  list.innerHTML = wrongIds.map(qid => {
    const q = QUIZ_DATA.find(x => x.id === qid);
    if (!q) return "";
    const typeLabel = {single:"单选", multiple:"多选", judge:"判断"}[q.type];
    return `
      <li class="wrong-list-item">
        <div>
          <div class="wrong-q">${q.q.substring(0, 40)}${q.q.length > 40 ? "..." : ""}</div>
          <div class="wrong-meta">${q.chTitle.replace(/第.+?章\s*/, "")} · ${q.kd} · ${typeLabel}</div>
        </div>
        <button class="retry-btn" data-qid="${qid}">重做</button>
      </li>
    `;
  }).join("");
  list.querySelectorAll(".retry-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const qid = parseInt(btn.dataset.qid);
      const q = QUIZ_DATA.find(x => x.id === qid);
      state.mode = "chapter";
      state.filterCh = q.ch;
      state.filterKd = q.kd;
      const qList = getQuestions();
      state.currentIdx = qList.findIndex(x => x.id === qid);
      state.selected = [];
      state.answered = false;
      updateModeButtons();
      renderSidebar();
      renderQuestion();
    });
  });
}

// ====== 侧边栏抽屉控制 ======
function openSidebarDrawer() {
  document.getElementById("sidebar").classList.add("show");
  document.getElementById("sidebar-overlay").classList.add("show");
}
function closeSidebarDrawer() {
  document.getElementById("sidebar").classList.remove("show");
  document.getElementById("sidebar-overlay").classList.remove("show");
}

// ====== 新功能函数 ======

function doSearch(query) {
  state.searchQuery = query.trim();
  state.currentIdx = 0;
  state.selected = [];
  state.answered = false;
  const count = state.searchQuery ? getQuestions().length : 0;
  document.getElementById("search-count").textContent = state.searchQuery ? `找到 ${count} 道相关题目` : "";
  if (state.searchQuery) {
    state.mode = "all";
    state.customQuestions = null;
  }
  updateModeButtons();
  renderQuestion();
}

function toggleDarkMode() {
  settings.darkMode = !settings.darkMode;
  if (settings.darkMode) {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("EclassQuizTheme", "dark");
    document.getElementById("dark-mode-btn").textContent = "☀ 亮色";
  } else {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("EclassQuizTheme", "light");
    document.getElementById("dark-mode-btn").textContent = "🌙 暗色";
  }
  saveSettings();
  syncSettingsUI();
}

function openSettings() {
  document.getElementById("settings-panel").classList.add("show");
  document.getElementById("settings-overlay").classList.add("show");
  syncSettingsUI();
}
function closeSettings() {
  document.getElementById("settings-panel").classList.remove("show");
  document.getElementById("settings-overlay").classList.remove("show");
}

function syncSettingsUI() {
  // Toggle switches
  const toggles = document.querySelectorAll(".toggle-switch");
  toggles.forEach(t => {
    const key = t.dataset.key;
    const val = settings[key];
    t.classList.toggle("on", !!val);
  });
  // Selects
  document.querySelectorAll(".setting-select").forEach(sel => {
    const key = sel.dataset.key;
    sel.value = settings[key];
  });
  // Dark mode button text
  document.getElementById("dark-mode-btn").textContent = settings.darkMode ? "☀ 亮色" : "🌙 暗色";
}

function initSettingsEvents() {
  // Toggle switches
  document.querySelectorAll(".toggle-switch").forEach(t => {
    t.addEventListener("click", () => {
      const key = t.dataset.key;
      settings[key] = !settings[key];
      t.classList.toggle("on");
      saveSettings();
      // 特殊处理
      if (key === "darkMode") {
        if (settings.darkMode) {
          document.documentElement.setAttribute("data-theme", "dark");
          localStorage.setItem("EclassQuizTheme", "dark");
        } else {
          document.documentElement.removeAttribute("data-theme");
          localStorage.setItem("EclassQuizTheme", "light");
        }
        syncSettingsUI();
      }
    });
  });
  // Selects
  document.querySelectorAll(".setting-select").forEach(sel => {
    sel.addEventListener("change", () => {
      const key = sel.dataset.key;
      const val = sel.value;
      settings[key] = key === "examTime" || key === "examCount" || key === "autoDelay" ? parseInt(val) : val;
      saveSettings();
    });
  });
}

// ====== 模考功能 ======
function startExam() {
  const count = settings.examCount || 50;
  let pool = QUIZ_DATA.slice();
  let questions = shuffleArray(pool);
  if (count > 0) questions = questions.slice(0, count);
  state.examQuestions = questions;
  state.mode = "exam";
  state.currentIdx = 0;
  state.selected = [];
  state.answered = false;
  state.examTimeLimit = settings.examTime;
  state.examStartTime = Date.now();
  document.getElementById("exam-result-card").classList.remove("show");
  updateModeButtons();
  startExamTimer();
  renderQuestion();
}

function startExamTimer() {
  if (state.examTimer) clearInterval(state.examTimer);
  const timerBar = document.getElementById("exam-timer-bar");
  const display = document.getElementById("timer-display");
  state.examTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.examStartTime) / 1000);
    const remaining = state.examTimeLimit - elapsed;
    if (remaining <= 0) {
      finishExam();
      return;
    }
    const min = Math.floor(remaining / 60);
    const sec = remaining % 60;
    display.textContent = `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    if (remaining <= 60) timerBar.classList.add("urgent");
    else timerBar.classList.remove("urgent");
  }, 1000);
}

function finishExam() {
  if (state.examTimer) clearInterval(state.examTimer);
  const questions = state.examQuestions;
  let answered = 0, correct = 0;
  questions.forEach(q => {
    const r = state.results[q.id];
    if (r) {
      answered++;
      if (r.correct) correct++;
    }
  });
  const score = questions.length > 0 ? Math.round(correct / questions.length * 100) : 0;
  const card = document.getElementById("exam-result-card");
  card.innerHTML = `
    <div class="score">${score}<span style="font-size:24px">分</span></div>
    <div class="score-label">模考成绩</div>
    <div class="score-detail">
      <div class="score-detail-item"><div class="num">${questions.length}</div><div class="label">总题数</div></div>
      <div class="score-detail-item"><div class="num" style="color:var(--success)">${correct}</div><div class="label">答对</div></div>
      <div class="score-detail-item"><div class="num" style="color:var(--danger)">${answered - correct}</div><div class="label">答错</div></div>
      <div class="score-detail-item"><div class="num" style="color:var(--muted)">${questions.length - answered}</div><div class="label">未答</div></div>
    </div>
    <button class="action-btn primary" id="exam-back-btn" style="margin-top:16px">返回练习</button>
  `;
  card.classList.add("show");
  document.getElementById("question-card").style.display = "none";
  document.getElementById("exam-timer-bar").classList.remove("show", "urgent");
  document.getElementById("exam-back-btn").addEventListener("click", () => {
    card.classList.remove("show");
    state.mode = "chapter";
    state.examQuestions = [];
    updateModeButtons();
    renderQuestion();
  });
}

// ====== 智能组卷 ======
function startSmartTest(strategy) {
  let questions = [];
  if (strategy === "weak") {
    // 优先错题+未做过
    const wrongQs = QUIZ_DATA.filter(q => state.wrongSet.has(q.id));
    const undoneQs = QUIZ_DATA.filter(q => !state.results[q.id]);
    questions = shuffleArray([...wrongQs, ...undoneQs]).slice(0, 50);
    if (questions.length < 20) {
      questions = questions.concat(shuffleArray(QUIZ_DATA).slice(0, 20 - questions.length));
    }
  } else if (strategy === "random") {
    questions = shuffleArray(QUIZ_DATA).slice(0, 50);
  } else if (strategy === "chapter-balanced") {
    // 按章节均匀抽取
    const chapters = {};
    QUIZ_DATA.forEach(q => {
      if (!chapters[q.ch]) chapters[q.ch] = [];
      chapters[q.ch].push(q);
    });
    const perCh = Math.max(3, Math.floor(50 / Object.keys(chapters).length));
    Object.values(chapters).forEach(chQs => {
      questions = questions.concat(shuffleArray(chQs).slice(0, perCh));
    });
    questions = shuffleArray(questions).slice(0, 50);
  }
  state.customQuestions = questions;
  state.mode = "all";
  state.searchQuery = "";
  state.currentIdx = 0;
  state.selected = [];
  state.answered = false;
  document.getElementById("smart-test-modal").classList.remove("show");
  updateModeButtons();
  renderQuestion();
}

// ====== 手势操作 ======
function initSwipe() {
  const main = document.querySelector(".main-content");
  let startX = 0, startY = 0;
  main.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  main.addEventListener("touchend", (e) => {
    if (e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
      if (dx > 0 && !document.getElementById("prev-btn").disabled) prevQuestion();
      if (dx < 0 && !document.getElementById("next-btn").disabled) nextQuestion();
    }
  }, { passive: true });
}

// ====== 初始化 ======
async function init() {
  // Load external data
  try {
    const [qRes, tRes] = await Promise.all([
      fetch('./questions.json'),
      fetch('./toc.json')
    ]);
    QUIZ_DATA = await qRes.json();
    BOOK_TOC = await tRes.json();
  } catch(e) {
    console.error('Failed to load data:', e);
    document.getElementById('welcome-card').innerHTML = '<h2>数据加载失败</h2><p>请确保通过本地服务器访问（如 python3 -m http.server）</p>';
    return;
  }

  loadState();
  syncSettingsUI();

  // ===== 侧边栏抽屉控制 =====
  document.getElementById("sidebar-toggle-btn").addEventListener("click", openSidebarDrawer);
  document.getElementById("close-sidebar").addEventListener("click", closeSidebarDrawer);
  document.getElementById("sidebar-overlay").addEventListener("click", closeSidebarDrawer);

  // 模式按钮
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      // 清除搜索和自定义组卷
      state.searchQuery = "";
      state.customQuestions = null;
      document.getElementById("search-count").textContent = "";
      document.getElementById("search-input").value = "";

      if (mode === "exam") {
        startExam();
        return;
      }
      state.mode = mode;
      state.examQuestions = [];
      if (state.examTimer) { clearInterval(state.examTimer); state.examTimer = null; }
      document.getElementById("exam-timer-bar").classList.remove("show", "urgent");
      document.getElementById("exam-result-card").classList.remove("show");
      state.currentIdx = 0;
      state.selected = [];
      state.answered = false;
      updateModeButtons();
      renderSidebar();
      renderQuestion();
    });
  });

  document.getElementById("submit-btn").addEventListener("click", submitAnswer);
  document.getElementById("next-btn").addEventListener("click", nextQuestion);
  document.getElementById("prev-btn").addEventListener("click", prevQuestion);

  // 错题本
  document.getElementById("wrong-book-btn").addEventListener("click", () => {
    state.mode = "wrong";
    state.searchQuery = "";
    state.customQuestions = null;
    state.currentIdx = 0;
    state.selected = [];
    state.answered = false;
    closeSidebarDrawer();
    updateModeButtons();
    renderSidebar();
    renderQuestion();
  });

  // 收藏夹
  document.getElementById("fav-book-btn").addEventListener("click", () => {
    state.mode = "fav";
    state.searchQuery = "";
    state.customQuestions = null;
    state.currentIdx = 0;
    state.selected = [];
    state.answered = false;
    closeSidebarDrawer();
    updateModeButtons();
    renderSidebar();
    renderQuestion();
  });

  // 搜索（搜索时不关闭侧边栏，方便查看搜索结果数量）
  let searchTimer;
  document.getElementById("search-input").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    const val = e.target.value;
    searchTimer = setTimeout(() => {
      doSearch(val);
      if (val.trim()) closeSidebarDrawer();
    }, 300);
  });

  // 暗色模式
  document.getElementById("dark-mode-btn").addEventListener("click", toggleDarkMode);

  // 设置面板
  document.getElementById("settings-btn").addEventListener("click", openSettings);
  document.getElementById("settings-close").addEventListener("click", closeSettings);
  document.getElementById("settings-overlay").addEventListener("click", closeSettings);
  initSettingsEvents();

  // 智能组卷
  document.getElementById("smart-test-btn").addEventListener("click", () => {
    closeSidebarDrawer();
    document.getElementById("smart-test-modal").classList.add("show");
  });
  document.getElementById("smart-cancel").addEventListener("click", () => {
    document.getElementById("smart-test-modal").classList.remove("show");
  });
  document.getElementById("smart-start").addEventListener("click", () => {
    const strategy = document.querySelector('input[name="strategy"]:checked').value;
    startSmartTest(strategy);
  });

  // 模考提前交卷
  document.getElementById("exam-submit-btn").addEventListener("click", finishExam);

  // 重置
  // 重置进度（侧边栏按钮 + 顶部按钮共用）
  function doReset() {
    const choice = confirm(
      "选择重置方式：\n\n" +
      "「确定」= 清除全部答题进度（所有记录归零）\n" +
      "「取消」= 取消操作\n\n" +
      "提示：仅清除之前答案有误的错题记录，可手动重做那几道题即可。"
    );
    if (choice) {
      closeSidebarDrawer();
      state.results = {};
      state.wrongSet = new Set();
      state.favSet = new Set();
      state.wrongCorrectCount = {};
      state.currentIdx = 0;
      state.selected = [];
      state.answered = false;
      state.searchQuery = "";
      state.customQuestions = null;
      saveState();
      updateStats();
      renderSidebar();
      renderQuestion();
    }
  }
  document.getElementById("reset-btn").addEventListener("click", doReset);
  document.getElementById("header-reset-btn").addEventListener("click", doReset);

  // 键盘快捷键
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "ArrowRight" && !document.getElementById("next-btn").disabled) nextQuestion();
    if (e.key === "ArrowLeft" && !document.getElementById("prev-btn").disabled) prevQuestion();
    if (e.key === "Enter" && !document.getElementById("submit-btn").disabled) submitAnswer();
  });

  // 手势操作
  initSwipe();

  // 初始化
  renderSidebar();
  updateModeButtons();
  updateStats();
  renderQuestion();
}

// 启动
init();

// PWA Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}