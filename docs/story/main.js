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

const STORAGE_KEY = 'lingo.story.state';

function createDefaultState() {
  return {
    chapter: 1,
    scene: 1,
    pov: 'You',
    theme: '失われた街',
    lines: [],
    entries: [],
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

function renderHeader() {
  chapterLabel.textContent = `Chapter ${state.chapter}`;
  sceneLabel.textContent = `Scene ${state.scene}`;
  povLabel.textContent = state.pov;
  statusBadge.textContent = state.theme ? `theme: ${state.theme}` : 'idle';
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
  const theme = state.theme || '物語';
  const responses = [
    `${theme} の場面が少し進む。`,
    `${input || '沈黙'} をきっかけに、状況が変わる。`,
    `Chapter ${state.chapter} Scene ${state.scene} の続きが描かれる。`,
  ];
  addLog(responses[state.lines.length % responses.length], 'story');
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
  renderLog();
  addLog('物語の開始地点に戻りました。', 'story');
  renderHeader();
  saveState();
}

themeInput.addEventListener('input', () => {
  state.theme = themeInput.value.trim();
  renderHeader();
  saveState();
});

addLineBtn.addEventListener('click', addLine);
nextSceneBtn.addEventListener('click', nextScene);
resetBtn.addEventListener('click', resetStory);

lineInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    addLine();
  }
});

themeInput.value = state.theme;
renderHeader();
if (state.entries.length === 0) {
  addLog('このページは翻訳モードとは別の URL です。', 'story');
  addLog('会話を積み重ねて物語を進めます。', 'story');
} else {
  renderLog();
}
saveState();
