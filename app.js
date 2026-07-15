// ---- storage helpers ----
// iOS Safari throws on localStorage access when a page is opened from a
// local file (file://), so every call is wrapped and falls back to an
// in-memory store for the duration of the page session.
const STORAGE = {
  progress: 'wlc.progress',
  history: 'wlc.history',
  lang: 'wlc.lang',
  timerMinutes: 'wlc.timerMinutes',
  submitterName: 'wlc.submitterName'
};

const memoryStore = {};

function storageAvailable() {
  try {
    const testKey = '__wlc_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}
const STORAGE_OK = storageAvailable();

function storageGet(key) {
  if (STORAGE_OK) {
    try { return localStorage.getItem(key); } catch (e) { /* fall through */ }
  }
  return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
}
function storageSet(key, value) {
  if (STORAGE_OK) {
    try { localStorage.setItem(key, value); return; } catch (e) { /* fall through */ }
  }
  memoryStore[key] = value;
}

function loadProgress() {
  try { return JSON.parse(storageGet(STORAGE.progress)) || { nextIndex: 0 }; }
  catch(e) { return { nextIndex: 0 }; }
}
function saveProgress(p) { storageSet(STORAGE.progress, JSON.stringify(p)); }

function loadHistory() {
  try { return JSON.parse(storageGet(STORAGE.history)) || []; }
  catch(e) { return []; }
}
function appendHistory(entry) {
  const h = loadHistory();
  h.push(entry);
  storageSet(STORAGE.history, JSON.stringify(h));
}

function getLang() { return storageGet(STORAGE.lang) || 'ja'; }
function setLang(l) { storageSet(STORAGE.lang, l); }

function getTimerMinutes() {
  return parseInt(storageGet(STORAGE.timerMinutes), 10) || 5;
}
function setTimerMinutes(m) { storageSet(STORAGE.timerMinutes, String(m)); }

function getSubmitterName() { return storageGet(STORAGE.submitterName) || ''; }
function setSubmitterName(n) { storageSet(STORAGE.submitterName, n); }

const DATA = CATECHISM_DATA.slice().sort((a, b) => a.id - b.id);

// ---- view navigation ----
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + name).classList.remove('hidden');
}

// ---- home ----
function refreshHome() {
  const total = DATA.length;
  const progress = loadProgress();
  const nextIndex = Math.min(progress.nextIndex || 0, total);
  const progressText = document.getElementById('progress-text');
  const progressBar = document.getElementById('progress-bar-inner');
  const isComplete = nextIndex >= total;

  document.getElementById('home-celebrate').classList.toggle('hidden', !isComplete);

  if (isComplete) {
    progressText.textContent = `${total} / ${total} 問 完了`;
    progressBar.style.width = '100%';
  } else {
    progressText.textContent = `${nextIndex} / ${total} 問 完了（次は 第${DATA[nextIndex].id}問から）`;
    progressBar.style.width = Math.round((nextIndex / total) * 100) + '%';
  }

  document.getElementById('timer-minutes').value = getTimerMinutes();
  const lang = getLang();
  document.getElementById('lang-ja').classList.toggle('active', lang === 'ja');
  document.getElementById('lang-en').classList.toggle('active', lang === 'en');
}

// ---- study session state ----
let sessionQueue = [];
let sessionIndex = 0;
let sessionAnswerTexts = [];
let sessionStartIndex = 0;
let timerInterval = null;
let timerRemaining = 0;
let timerPaused = false;
let lastSessionRecords = [];

function startSession() {
  const progress = loadProgress();
  let nextIndex = progress.nextIndex || 0;
  if (nextIndex >= DATA.length) nextIndex = 0;

  sessionQueue = DATA.slice(nextIndex, nextIndex + 3);
  sessionIndex = 0;
  sessionAnswerTexts = sessionQueue.map(() => '');
  sessionStartIndex = nextIndex;

  showView('study');
  renderStudyQuestion();

  clearInterval(timerInterval);
  timerRemaining = getTimerMinutes() * 60;
  timerPaused = false;
  document.getElementById('btn-timer-toggle').textContent = '一時停止';
  updateTimerDisplay();
  timerInterval = setInterval(tick, 1000);
}

function formatMMSS(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function renderStudyQuestion() {
  const entry = sessionQueue[sessionIndex];
  const lang = getLang();
  document.getElementById('study-progress-label').textContent =
    `${sessionIndex + 1} / ${sessionQueue.length}（全体 第${entry.id}問）`;
  document.getElementById('study-question').textContent =
    (lang === 'en' && entry.questionEn) ? entry.questionEn : entry.question;
  document.getElementById('user-answer').value = sessionAnswerTexts[sessionIndex];

  document.getElementById('btn-prev').classList.toggle('hidden', sessionIndex === 0);
  const isLast = sessionIndex === sessionQueue.length - 1;
  document.getElementById('btn-next').classList.toggle('hidden', isLast);
  document.getElementById('btn-finish').classList.toggle('hidden', !isLast);
}

function updateTimerDisplay() {
  const el = document.getElementById('timer-display');
  el.textContent = formatMMSS(Math.max(timerRemaining, 0));
  el.classList.toggle('warning', timerRemaining <= 30);
}

function tick() {
  if (timerPaused) return;
  timerRemaining--;
  updateTimerDisplay();
  if (timerRemaining <= 0) {
    clearInterval(timerInterval);
    finishSession();
  }
}

function refsHtml(refs) {
  if (!refs || refs.length === 0) return '(該当なし)';
  return refs.map(segs => segs.map(seg =>
    seg.url
      ? `<a href="${escapeHtml(seg.url)}" target="_blank" rel="noopener">${escapeHtml(seg.text)}</a>`
      : escapeHtml(seg.text)
  ).join('')).join('　');
}

function finishSession() {
  clearInterval(timerInterval);
  sessionAnswerTexts[sessionIndex] = document.getElementById('user-answer').value;

  const lang = getLang();
  const records = sessionQueue.map((entry, i) => {
    const question = (lang === 'en' && entry.questionEn) ? entry.questionEn : entry.question;
    const answer = (lang === 'en' && entry.answerEn) ? entry.answerEn : entry.answer;
    const refs = (lang === 'en' && entry.refsEn && entry.refsEn.length) ? entry.refsEn : entry.refs;
    return {
      id: entry.id,
      question,
      userAnswer: sessionAnswerTexts[i],
      officialAnswer: answer,
      refs,
      date: new Date().toISOString()
    };
  });
  records.forEach(appendHistory);
  lastSessionRecords = records;

  let newIndex = sessionStartIndex + sessionQueue.length;
  if (newIndex >= DATA.length) newIndex = DATA.length;
  saveProgress({ nextIndex: newIndex });

  renderSummary(records);
  document.getElementById('summary-celebrate').classList.toggle('hidden', newIndex < DATA.length);

  const statusEl = document.getElementById('submit-status');
  statusEl.classList.add('hidden');
  statusEl.textContent = '';
  const fallbackEl = document.getElementById('submit-fallback');
  fallbackEl.classList.add('hidden');
  fallbackEl.value = '';

  showView('summary');
}

function buildSubmissionText(name, records) {
  const lines = [
    'ウェストミンスター小教理問答 学習アプリ - 解答提出',
    '名前: ' + name,
    '提出日時: ' + new Date().toLocaleString('ja-JP'),
    ''
  ];
  records.forEach(r => {
    lines.push(`第${r.id}問　${r.question}`);
    lines.push('あなたの答え: ' + (r.userAnswer || '(未記入)'));
    lines.push('');
  });
  return lines.join('\n');
}

function renderSummary(records) {
  const container = document.getElementById('summary-list');
  container.innerHTML = '';
  records.forEach(a => {
    const div = document.createElement('div');
    div.className = 'summary-item';
    div.innerHTML = `
      <div class="q">第${a.id}問　${escapeHtml(a.question)}</div>
      <div class="a-official"><b>模範解答:</b> ${escapeHtml(a.officialAnswer || '(データなし)')}</div>
      <button class="btn btn-small" onclick="handleToggleRefs(this)">根拠聖句を見る</button>
      <p class="refs hidden">${refsHtml(a.refs)}</p>
      <div class="a-user"><b>あなたの答え:</b> ${escapeHtml(a.userAnswer || '(未記入)')}</div>
    `;
    container.appendChild(div);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ---- history view ----
function renderHistory() {
  const container = document.getElementById('history-list');
  const hist = loadHistory().slice().reverse();
  container.innerHTML = '';
  if (hist.length === 0) {
    container.textContent = 'まだ学習履歴がありません。';
    return;
  }
  hist.forEach(h => {
    const div = document.createElement('div');
    div.className = 'history-entry';
    const d = new Date(h.date);
    div.innerHTML = `
      <div class="date">${d.toLocaleString('ja-JP')}</div>
      <div><b>第${h.id}問</b>　${escapeHtml(h.question)}</div>
      <div>あなたの答え: ${escapeHtml(h.userAnswer || '(未記入)')}</div>
    `;
    container.appendChild(div);
  });
}

// ---- event handlers ----
// Called directly from onclick="" / onchange="" attributes in index.html
// rather than wired up via addEventListener + DOMContentLoaded. Some
// restrictive in-app webviews (e.g. Dropbox's iOS file previewer) don't
// reliably fire DOMContentLoaded or deliver addEventListener-bound events,
// but do execute inline event-handler attributes.
function handleLangJa() {
  setLang('ja'); refreshHome();
  if (!document.getElementById('view-study').classList.contains('hidden')) renderStudyQuestion();
}
function handleLangEn() {
  setLang('en'); refreshHome();
  if (!document.getElementById('view-study').classList.contains('hidden')) renderStudyQuestion();
}
function handleTimerMinutesChange(el) {
  const v = Math.max(1, Math.min(30, parseInt(el.value, 10) || 5));
  setTimerMinutes(v);
  el.value = v;
}
function handleStart() { startSession(); }
function handleHistoryOpen() { renderHistory(); showView('history'); }
function handleReset() {
  if (confirm('学習の進捗（次に始める問題番号）をリセットします。よろしいですか？')) {
    saveProgress({ nextIndex: 0 });
    refreshHome();
  }
}
function handleGoHome() { showView('home'); refreshHome(); }
function handleTimerToggle() {
  timerPaused = !timerPaused;
  document.getElementById('btn-timer-toggle').textContent = timerPaused ? '再開' : '一時停止';
}
function handleTimerAdd() {
  timerRemaining += 60;
  updateTimerDisplay();
}
function handleToggleRefs(btn) {
  const refsEl = btn.nextElementSibling;
  const nowHidden = refsEl.classList.toggle('hidden');
  btn.textContent = nowHidden ? '根拠聖句を見る' : '根拠聖句を隠す';
}
function handleAnswerInput() {
  sessionAnswerTexts[sessionIndex] = document.getElementById('user-answer').value;
}
function handlePrev() {
  if (sessionIndex === 0) return;
  sessionAnswerTexts[sessionIndex] = document.getElementById('user-answer').value;
  sessionIndex--;
  renderStudyQuestion();
}
function handleNext() {
  if (sessionIndex >= sessionQueue.length - 1) return;
  sessionAnswerTexts[sessionIndex] = document.getElementById('user-answer').value;
  sessionIndex++;
  renderStudyQuestion();
}
function handleFinish() { finishSession(); }

function showSubmitFallback(text, message) {
  const statusEl = document.getElementById('submit-status');
  statusEl.classList.remove('hidden');
  statusEl.textContent = message;
  const fallbackEl = document.getElementById('submit-fallback');
  fallbackEl.value = text;
  fallbackEl.classList.remove('hidden');
}

function handleSubmit() {
  const name = prompt('お名前を入力してください:', getSubmitterName());
  if (name === null) return;
  const trimmedName = name.trim();
  if (!trimmedName) {
    alert('名前を入力してください。');
    return;
  }
  setSubmitterName(trimmedName);

  const text = buildSubmissionText(trimmedName, lastSessionRecords);
  const statusEl = document.getElementById('submit-status');

  if (navigator.share) {
    navigator.share({ title: 'ウェストミンスター小教理問答 提出', text: text }).then(() => {
      statusEl.classList.remove('hidden');
      statusEl.textContent = '提出内容を送信しました。';
    }).catch(() => { /* user cancelled the share sheet - not an error */ });
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      statusEl.classList.remove('hidden');
      statusEl.textContent = '提出内容をクリップボードにコピーしました。LINEなどに貼り付けて送信してください。';
    }).catch(() => {
      showSubmitFallback(text, 'コピーに失敗しました。下のテキストを手動で選択してコピーしてください。');
    });
    return;
  }

  showSubmitFallback(text, '下のテキストを手動で選択してコピーし、LINEなどに貼り付けて送信してください。');
}

// ---- initialize ----
refreshHome();