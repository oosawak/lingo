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

const state = {
  chapter: 1,
  scene: 1,
  pov: 'You',
  theme: '',
  lines: [],
};

function renderHeader() {
  chapterLabel.textContent = `Chapter ${state.chapter}`;
  sceneLabel.textContent = `Scene ${state.scene}`;
  povLabel.textContent = state.pov;
  statusBadge.textContent = state.theme ? `theme: ${state.theme}` : 'idle';
}

function addLog(text, kind) {
  const item = document.createElement('article');
  item.className = `log-item ${kind}`;
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = kind === 'user' ? 'User' : 'Story';
  const body = document.createElement('div');
  body.textContent = text;
  item.append(meta, body);
  storyLog.appendChild(item);
  storyLog.scrollTop = storyLog.scrollHeight;
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
}

function nextScene() {
  state.scene += 1;
  if (state.scene > 3) {
    state.chapter += 1;
    state.scene = 1;
  }
  addLog(`Scene advanced to Chapter ${state.chapter} Scene ${state.scene}.`, 'story');
  renderHeader();
}

function resetStory() {
  state.chapter = 1;
  state.scene = 1;
  state.pov = 'You';
  state.theme = themeInput.value.trim();
  state.lines = [];
  storyLog.innerHTML = '';
  addLog('物語の開始地点に戻りました。', 'story');
  renderHeader();
}

themeInput.addEventListener('input', () => {
  state.theme = themeInput.value.trim();
  renderHeader();
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

themeInput.value = '失われた街';
state.theme = themeInput.value;
renderHeader();
addLog('このページは翻訳モードとは別の URL です。', 'story');
addLog('会話を積み重ねて物語を進めます。', 'story');
