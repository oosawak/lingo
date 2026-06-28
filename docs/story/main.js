const storyLog = document.getElementById('story-log');
const themeInput = document.getElementById('theme-input');
const lineInput = document.getElementById('line-input');
const chapterLabel = document.getElementById('chapter-label');
const sceneLabel = document.getElementById('scene-label');
const povLabel = document.getElementById('pov-label');
const statusBadge = document.getElementById('status-badge');
const nextSceneBtn = document.getElementById('next-scene-btn');
const addLineBtn = document.getElementById('add-line-btn');
const resetBtn = document.getElementById('reset-btn');
const plotResetBtn = document.getElementById('plot-reset-btn');
const plotTitle = document.getElementById('plot-title');
const plotPremise = document.getElementById('plot-premise');
const plotRules = document.getElementById('plot-rules');
const tabButtons = [...document.querySelectorAll('[data-story-tab]')];
const tabPanels = [...document.querySelectorAll('[data-story-panel]')];
const STORY_TABS = new Set(tabButtons.map((button) => button.dataset.storyTab).filter(Boolean));

const STORAGE_KEY = 'lingo.story.state';

function createDefaultState() {
  const plot = createPlot('失われた街');
  return {
    chapter: 1,
    scene: 1,
    pov: 'You',
    theme: '失われた街',
    lines: [],
    entries: [],
    activeTab: 'basic',
    plot,
  };
}

function createPlot(theme) {
  const title = theme || '失われた街';
  const premise = `${title} を舞台に、会話で状況が進む物語をローカルで進行する。`;
  return {
    title,
    premise,
    rules: [
      '会話1回につき、物語は1段階だけ進む',
      '章とシーンは保存され、再読込後も復元される',
      '応答はプロットに沿って簡潔に返す',
    ],
    cast: ['You', 'Narrator'],
    currentBeat: '導入',
  };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultState();
    }

    const parsed = JSON.parse(raw);
    return {
      chapter: Number.isInteger(parsed.chapter) && parsed.chapter > 0 ? parsed.chapter : 1,
      scene: Number.isInteger(parsed.scene) && parsed.scene > 0 ? parsed.scene : 1,
      pov: typeof parsed.pov === 'string' && parsed.pov.trim() ? parsed.pov : 'You',
      theme: typeof parsed.theme === 'string' && parsed.theme.trim() ? parsed.theme.trim() : '失われた街',
      lines: Array.isArray(parsed.lines) ? parsed.lines.filter((line) => typeof line === 'string') : [],
      entries: Array.isArray(parsed.entries)
        ? parsed.entries
            .filter((entry) => entry && typeof entry.text === 'string')
            .map((entry) => ({
              kind: entry.kind === 'story' ? 'story' : 'user',
              text: entry.text,
            }))
        : [],
      activeTab: typeof parsed.activeTab === 'string' && parsed.activeTab.trim()
        ? parsed.activeTab.trim()
        : 'basic',
      plot: parsed.plot && typeof parsed.plot === 'object'
        ? {
            title: typeof parsed.plot.title === 'string' && parsed.plot.title.trim() ? parsed.plot.title.trim() : (typeof parsed.theme === 'string' && parsed.theme.trim() ? parsed.theme.trim() : '失われた街'),
            premise: typeof parsed.plot.premise === 'string' && parsed.plot.premise.trim()
              ? parsed.plot.premise.trim()
              : `${typeof parsed.theme === 'string' && parsed.theme.trim() ? parsed.theme.trim() : '物語'} を舞台に、会話で状況が進む。`,
            rules: Array.isArray(parsed.plot.rules) && parsed.plot.rules.length > 0
              ? parsed.plot.rules.filter((rule) => typeof rule === 'string')
              : createPlot(parsed.theme || '失われた街').rules,
            cast: Array.isArray(parsed.plot.cast) && parsed.plot.cast.length > 0
              ? parsed.plot.cast.filter((name) => typeof name === 'string')
              : createPlot(parsed.theme || '失われた街').cast,
            currentBeat: typeof parsed.plot.currentBeat === 'string' && parsed.plot.currentBeat.trim()
              ? parsed.plot.currentBeat.trim()
              : '導入',
          }
        : createPlot(typeof parsed.theme === 'string' && parsed.theme.trim() ? parsed.theme.trim() : '失われた街'),
    };
  } catch {
    return createDefaultState();
  }
}

const state = {
  ...loadState(),
};

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setActiveTab(tabName) {
  const nextTab = STORY_TABS.has(tabName) ? tabName : 'basic';
  state.activeTab = nextTab;

  for (const button of tabButtons) {
    const isActive = button.dataset.storyTab === nextTab;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  }

  for (const panel of tabPanels) {
    panel.classList.toggle('active', panel.dataset.storyPanel === nextTab);
  }

  saveState();
}

function renderHeader() {
  chapterLabel.textContent = `Chapter ${state.chapter}`;
  sceneLabel.textContent = `Scene ${state.scene}`;
  povLabel.textContent = state.pov;
  statusBadge.textContent = state.plot?.currentBeat ? `beat: ${state.plot.currentBeat}` : 'idle';
}

function renderPlot() {
  const plot = state.plot || createPlot(state.theme);
  plotTitle.textContent = plot.title;
  plotPremise.textContent = plot.premise;
  plotRules.innerHTML = '';

  for (const rule of plot.rules) {
    const li = document.createElement('li');
    li.textContent = rule;
    plotRules.appendChild(li);
  }
}

function renderLog() {
  storyLog.innerHTML = '';

  for (const entry of state.entries) {
    const item = document.createElement('article');
    item.className = `log-item ${entry.kind}`;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = entry.kind === 'user' ? 'User' : 'Story';
    const body = document.createElement('div');
    body.textContent = entry.text;
    item.append(meta, body);
    storyLog.appendChild(item);
  }

  storyLog.scrollTop = storyLog.scrollHeight;
}

function addLog(text, kind) {
  state.entries.push({ text, kind });
  renderLog();
  saveState();
}

function appendStoryResponse(input) {
  const plot = state.plot || createPlot(state.theme);
  const beat = state.lines.length % 3 === 0 ? '転換' : state.lines.length % 2 === 0 ? '進行' : '観察';
  plot.currentBeat = beat;
  const responses = [
    `${plot.title} の ${beat} が進む。`,
    `${input || '沈黙'} を受けて、${plot.cast[1] ?? 'Narrator'} が次の動きを示す。`,
    `Chapter ${state.chapter} Scene ${state.scene} の流れが維持される。`,
  ];
  addLog(responses[state.lines.length % responses.length], 'story');
  state.plot = plot;
  renderHeader();
}

function addLine() {
  const text = lineInput.value.trim();
  if (!text) {
    return;
  }

  state.lines.push(text);
  addLog(text, 'user');
  appendStoryResponse(text);
  lineInput.value = '';
  saveState();
}

function nextScene() {
  state.scene += 1;
  if (state.scene > 3) {
    state.chapter += 1;
    state.scene = 1;
  }
  state.plot.currentBeat = '展開';
  addLog(`Scene advanced to Chapter ${state.chapter} Scene ${state.scene}.`, 'story');
  renderHeader();
  saveState();
}

function resetStory() {
  const theme = themeInput.value.trim() || '失われた街';
  state.chapter = 1;
  state.scene = 1;
  state.pov = 'You';
  state.theme = theme;
  state.lines = [];
  state.entries = [];
  state.plot = createPlot(theme);
  renderLog();
  addLog('物語の開始地点に戻りました。', 'story');
  renderPlot();
  renderHeader();
  saveState();
}

function regeneratePlot() {
  const theme = themeInput.value.trim() || state.theme || '失われた街';
  state.theme = theme;
  state.plot = createPlot(theme);
  state.plot.currentBeat = '導入';
  renderPlot();
  renderHeader();
  saveState();
}

themeInput.addEventListener('input', () => {
  state.theme = themeInput.value.trim();
  if (state.plot) {
    state.plot.title = state.theme || '失われた街';
    state.plot.premise = `${state.plot.title} を舞台に、会話で状況が進む物語をローカルで進行する。`;
  }
  renderPlot();
  renderHeader();
  saveState();
});

addLineBtn.addEventListener('click', addLine);
nextSceneBtn.addEventListener('click', nextScene);
resetBtn.addEventListener('click', resetStory);
plotResetBtn.addEventListener('click', regeneratePlot);

for (const button of tabButtons) {
  button.addEventListener('click', () => {
    setActiveTab(button.dataset.storyTab || 'basic');
  });
}

lineInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    addLine();
  }
});

themeInput.value = state.theme;
renderPlot();
renderHeader();
setActiveTab(state.activeTab);
if (state.entries.length === 0) {
  addLog('このページは翻訳モードとは別の URL です。', 'story');
  addLog('会話を積み重ねて物語を進めます。', 'story');
} else {
  renderLog();
}
saveState();
