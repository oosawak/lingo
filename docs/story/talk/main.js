import { getStoryStateKey } from '../catalog.js';

const talkLog = document.getElementById('talk-log');
const talkInput = document.getElementById('talk-input');
const sendTalkBtn = document.getElementById('send-talk-btn');
const talkStoryTitle = document.getElementById('talk-story-title');
const talkStoryDescription = document.getElementById('talk-story-description');
const talkLlmStatusBadge = document.getElementById('talk-llm-status-badge');
const talkFlowLayer = document.getElementById('talk-flow-layer');
const talkFlowBtn = document.getElementById('talk-flow-btn');
const talkFlowCloseBtn = document.getElementById('talk-flow-close-btn');
const talkFlowTitle = document.getElementById('talk-flow-title');
const talkFlowDescription = document.getElementById('talk-flow-description');
const talkFlowGrid = document.getElementById('talk-flow-grid');
const talkEngineButtons = [...document.querySelectorAll('[data-talk-engine]')];
const talkStartBtn = document.getElementById('talk-start-btn');
const talkResetBtn = document.getElementById('talk-reset-btn');
const talkProgressText = document.getElementById('talk-progress-text');
const talkOllamaBaseUrlInput = document.getElementById('talk-ollama-base-url');
const talkOllamaSaveBtn = document.getElementById('talk-ollama-save');
const talkOllamaModelSelect = document.getElementById('talk-ollama-model');
const STORAGE_KEY = 'lingo.story.talk.log';
const DEBUG_STORAGE_KEY = 'lingo.story.talk.debug';
const ENGINE_STORAGE_KEY = 'lingo.story.talk.engine';
const OLLAMA_BASE_URL_STORAGE_KEY = 'lingo.story.talk.ollama.baseUrl';
const OLLAMA_MODEL_STORAGE_KEY = 'lingo.story.talk.ollama.model';
const STORY_STORAGE_KEY = 'lingo.story.state';
const OLLAMA_MODEL_CANDIDATES = [
  'phi4:latest',
  'qwen2.5:7b',
  'fuukeidaisuki/nvidia-nemotron-nano-9b-v2-japanese:latest',
  'gemma4:e2b',
  'llama3.2:latest',
];
const TALK_MODEL_CANDIDATES = [
  { modelId: 'onnx-community/Phi-4-mini-instruct-ONNX-GQA', task: 'text-generation' },
  { modelId: 'Xenova/TinyLlama-1.1B-Chat-v1.0', task: 'text-generation' },
  { modelId: 'Xenova/distilgpt2', task: 'text-generation' },
];
const BUILTIN_TALK_MODEL_LABEL = 'Chrome 内蔵AI (Gemini Nano)';
const TALK_BACKEND_ORDER = ['ollama', 'builtin', 'worker'];
const TALK_GENERATION_TOKEN_LIMIT = 512;

const builtinAi = globalThis.ai ?? window.ai ?? null;

let talkWorker = null;
let talkInitPromise = null;
let talkRequestSeq = 0;
let talkPending = new Map();
let talkReadyModel = null;
let talkBackend = null;
let talkBuiltinSession = null;
let talkBuiltinInitPromise = null;
let talkOllamaModel = null;
let talkOllamaInitPromise = null;
let talkOllamaAvailableModels = [];
let talkOllamaContext = null;
let talkOpeningSeedPromise = null;
let talkDebugState = null;
let talkEnginePreference = 'auto';
let talkSessionStarted = false;
let talkConversationContextCache = { key: '', text: '' };
let talkOpeningContextCache = { key: '', text: '' };
let talkCurrentPhase = 'idle';

function setTalkPhase(phase) {
  talkCurrentPhase = phase;
  const isStarting = phase === 'starting';
  const isOpening = phase === 'opening';
  const isGenerating = phase === 'generating';
  const isBusy = isStarting || isOpening || isGenerating;

  if (talkStartBtn) {
    talkStartBtn.classList.toggle('is-active', isStarting);
    talkStartBtn.classList.toggle('is-busy', isBusy);
    talkStartBtn.disabled = isBusy;
  }

  if (sendTalkBtn) {
    sendTalkBtn.classList.toggle('is-active', isGenerating || isOpening);
    sendTalkBtn.classList.toggle('is-busy', isGenerating || isOpening);
    sendTalkBtn.disabled = isBusy || !talkSessionStarted;
  }

  if (talkInput) {
    talkInput.disabled = isStarting || isOpening || isGenerating || !talkSessionStarted;
  }

  if (talkOllamaSaveBtn) {
    talkOllamaSaveBtn.disabled = isStarting || isOpening || isGenerating;
  }

  if (talkOllamaModelSelect) {
    talkOllamaModelSelect.disabled = (talkOllamaModelSelect.options.length === 0) || isStarting || isOpening || isGenerating;
  }

  if (talkEngineButtons.length > 0) {
    for (const button of talkEngineButtons) {
      button.disabled = isStarting || isOpening || isGenerating;
    }
  }

  updateTalkProgressText();
}

function updateTalkProgressText(text) {
  if (!talkProgressText) {
    return;
  }

  if (typeof text === 'string') {
    talkProgressText.textContent = text;
    return;
  }

  const labels = {
    idle: '待機中',
    starting: 'TALK を起動中...',
    opening: 'オープニングを生成中...',
    generating: 'AI が応答を生成中...',
    ready: '準備完了',
    error: 'エラー',
  };

  const label = labels[talkCurrentPhase] || '待機中';
  talkProgressText.textContent = `AI 状況: ${label}`;
}

function updateTalkDialogueHint(text) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (talkInput && !talkInput.value.trim()) {
    talkInput.placeholder = value || '会話・行動を入力';
  }
}

function loadStorySummary() {
  const state = loadStoryState();
  const settings = state?.storySettings && typeof state.storySettings === 'object' ? state.storySettings : {};
  const title = (settings.summary?.title || state?.plot?.title || state?.theme || '失われた街').trim();
  const description = (settings.summary?.description || state?.plot?.premise || state?.description || '').trim();
  const opening = (settings.intro?.opening || settings.intro?.situation || '').trim();

  return {
    title,
    description,
    opening: opening || `${title} を舞台に、会話で状況が進む。`,
  };
}

function renderStoryContext() {
  const story = loadStorySummary();

  if (talkStoryTitle) {
    talkStoryTitle.textContent = story.title;
  }

  if (talkStoryDescription) {
    talkStoryDescription.textContent = story.description;
  }
}

function setTalkLlmStatus(text) {
  if (talkLlmStatusBadge) {
    talkLlmStatusBadge.textContent = text;
  }
}

function loadTalkEnginePreference() {
  try {
    const raw = window.localStorage.getItem(ENGINE_STORAGE_KEY);
    return raw === 'worker' || raw === 'builtin' || raw === 'ollama' ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

function saveTalkEnginePreference(preference) {
  window.localStorage.setItem(ENGINE_STORAGE_KEY, preference);
}

function getTalkBackendOrder() {
  if (talkEnginePreference === 'worker') {
    return ['worker'];
  }
  if (talkEnginePreference === 'builtin') {
    return ['builtin'];
  }
  return TALK_BACKEND_ORDER;
}

function syncTalkEngineSelect() {
  for (const button of talkEngineButtons) {
    const isActive = button.dataset.talkEngine === talkEnginePreference;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  }
}

function resetTalkBackendState() {
  talkReadyModel = null;
  talkBackend = null;
  talkInitPromise = null;
  talkOllamaModel = null;
  talkOllamaInitPromise = null;
  talkOllamaContext = null;
  talkSessionStarted = false;
}

function loadTalkOllamaBaseUrl() {
  try {
    const raw = window.localStorage.getItem(OLLAMA_BASE_URL_STORAGE_KEY);
    return typeof raw === 'string' && raw.trim() ? raw.trim().replace(/\/+$/, '') : 'http://localhost:11434';
  } catch {
    return 'http://localhost:11434';
  }
}

function saveTalkOllamaBaseUrl(nextUrl) {
  const normalized = String(nextUrl ?? '').trim().replace(/\/+$/, '');
  window.localStorage.setItem(OLLAMA_BASE_URL_STORAGE_KEY, normalized || 'http://localhost:11434');
  syncTalkOllamaBaseUrlInput();
}

function loadTalkOllamaModelPreference() {
  try {
    return window.localStorage.getItem(OLLAMA_MODEL_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function saveTalkOllamaModelPreference(modelName) {
  const normalized = String(modelName ?? '').trim();
  if (normalized) {
    window.localStorage.setItem(OLLAMA_MODEL_STORAGE_KEY, normalized);
  } else {
    window.localStorage.removeItem(OLLAMA_MODEL_STORAGE_KEY);
  }
  syncTalkOllamaModelSelect();
}

function syncTalkOllamaBaseUrlInput() {
  if (talkOllamaBaseUrlInput) {
    talkOllamaBaseUrlInput.value = loadTalkOllamaBaseUrl();
  }
}

function syncTalkOllamaModelSelect() {
  if (!talkOllamaModelSelect) {
    return;
  }

  const preferred = loadTalkOllamaModelPreference();
  const available = talkOllamaAvailableModels;
  const currentValue = available.includes(preferred)
    ? preferred
    : OLLAMA_MODEL_CANDIDATES.find((modelName) => available.includes(modelName)) || '';

  talkOllamaModelSelect.innerHTML = '';

  if (available.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '利用可能なモデルがありません';
    talkOllamaModelSelect.appendChild(option);
    talkOllamaModelSelect.value = '';
    talkOllamaModelSelect.disabled = true;
    return;
  }

  talkOllamaModelSelect.disabled = false;

  const autoOption = document.createElement('option');
  autoOption.value = '';
  autoOption.textContent = '自動選択';
  talkOllamaModelSelect.appendChild(autoOption);

  for (const modelName of available) {
    const option = document.createElement('option');
    option.value = modelName;
    option.textContent = modelName;
    talkOllamaModelSelect.appendChild(option);
  }

  talkOllamaModelSelect.value = currentValue;
}

async function loadTalkOllamaAvailableModels() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 4000);

  try {
    const baseUrl = loadTalkOllamaBaseUrl();
    const response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Ollama の接続確認に失敗しました (${response.status})`);
    }

    const payload = await response.json();
    const models = Array.isArray(payload?.models)
      ? payload.models.map(extractOllamaModelName).filter(Boolean)
      : [];

    talkOllamaAvailableModels = Array.from(new Set(models));
    syncTalkOllamaModelSelect();
    return talkOllamaAvailableModels;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function extractOllamaModelName(item) {
  if (!item || typeof item !== 'object') {
    return '';
  }

  return String(item.name || item.model || item.model_id || item.modelId || '').trim();
}

function extractOllamaResponse(result) {
  if (typeof result === 'string') {
    return result;
  }

  if (result && typeof result === 'object') {
    return result.response ?? result.message?.content ?? result.text ?? '';
  }

  return String(result ?? '');
}

function getOllamaGenerationOptions() {
  return {
    temperature: 0.8,
    top_p: 0.9,
    repeat_penalty: 1.06,
    num_predict: TALK_GENERATION_TOKEN_LIMIT,
    stop: ['```'],
  };
}

function buildTalkFollowupPrompt(userInput) {
  return [
    'あなたはブラウザー内で動作する物語進行 LLM です。',
    '返答は JSON のみで、narration / next_beat / lore_hits / dialogue_hint を含めてください。',
    'チャットに表示するのは narration だけです。コードフェンスや説明文は不要です。',
    'narration は 3〜6 文で書いてください。1 文だけで終わらせないでください。',
    'ユーザーの入力をただ言い換えるだけではなく、必ず次の展開を1歩進めてください。',
    '',
    '【今回の発言】',
    `ユーザー: ${userInput}`,
    '',
    '返答は JSON のみです。',
  ].join('\n');
}

function isLikelyOllamaError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Ollama|11434|Failed to fetch|fetch|network|CORS|connect/i.test(message);
}

function getTalkScopeKey() {
  try {
    return window.localStorage.getItem('lingo.story.active') || 'default';
  } catch {
    return 'default';
  }
}

function getTalkEntriesStorageKey() {
  return `${STORAGE_KEY}:${getTalkScopeKey()}`;
}

function getTalkDebugStorageKey() {
  return `${DEBUG_STORAGE_KEY}:${getTalkScopeKey()}`;
}

function getTalkStoryStateKey() {
  return getStoryStateKey(getTalkScopeKey());
}

function loadTalkEntries() {
  try {
    const raw = window.localStorage.getItem(getTalkEntriesStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.text === 'string')
      : [];
  } catch {
    return [];
  }
}

function saveTalkEntries(entries) {
  window.localStorage.setItem(getTalkEntriesStorageKey(), JSON.stringify(entries));
}

function loadTalkDebugState() {
  try {
    const raw = window.localStorage.getItem(getTalkDebugStorageKey());
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function saveTalkDebugState(debugState) {
  if (debugState && typeof debugState === 'object') {
    window.localStorage.setItem(getTalkDebugStorageKey(), JSON.stringify(debugState));
  } else {
    window.localStorage.removeItem(getTalkDebugStorageKey());
  }
}

function loadStoryState() {
  try {
    const raw = window.localStorage.getItem(getTalkStoryStateKey()) || window.localStorage.getItem(STORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function formatTalkHistory(limit = 8) {
  return talkEntries
    .slice(-limit)
    .map((entry) => `${entry.side === 'right' ? '入力' : '応答'}: ${entry.text}`)
    .join('\n') || 'まだ会話はありません。';
}

function formatCharacterList(settings) {
  const characters = Array.isArray(settings.characters) ? settings.characters : [];

  return characters
    .map((character, index) => {
      const label = index + 1;
      const name = typeof character?.name === 'string' && character.name.trim() ? character.name.trim() : `Character ${label}`;
      const personality = typeof character?.personality === 'string' ? character.personality.trim() : '';
      const voice = typeof character?.voice === 'string' ? character.voice.trim() : '';
      const relation = typeof character?.relation === 'string' ? character.relation.trim() : '';
      return `${label}. ${name}\n   - 性格: ${personality || 'なし'}\n   - 口調: ${voice || 'なし'}\n   - 関係性: ${relation || 'なし'}`;
    })
    .join('\n');
}

function getTalkStorySettings() {
  const state = loadStoryState();
  const settings = state?.storySettings && typeof state.storySettings === 'object' ? state.storySettings : {};
  const storyPrompt = typeof state?.storyPrompt === 'string' ? state.storyPrompt.trim() : '';
  const title = (settings.summary?.title || state?.plot?.title || state?.theme || '失われた街').trim();
  const description = (settings.summary?.description || state?.plot?.premise || state?.description || '').trim();
  const opening = (settings.intro?.opening || settings.intro?.situation || '').trim() || `${title} を舞台に、会話で状況が進む。`;
  const protagonist = typeof settings.characters?.[0]?.name === 'string' && settings.characters[0].name.trim()
    ? settings.characters[0].name.trim()
    : '';
  const counterpart = typeof settings.characters?.[1]?.name === 'string' && settings.characters[1].name.trim()
    ? settings.characters[1].name.trim()
    : '';

  return {
    state,
    settings,
    storyPrompt,
    title,
    description,
    opening,
    protagonist,
    counterpart,
  };
}

function createTalkContextKey(story, mode) {
  const settings = story.settings || {};
  return JSON.stringify({
    mode,
    title: story.title,
    description: story.description,
    opening: story.opening,
    storyPrompt: story.storyPrompt,
    protagonist: story.protagonist,
    counterpart: story.counterpart,
    style: settings.style || {},
    intro: settings.intro || {},
    chapter: Number.isInteger(story.state?.chapter) ? story.state.chapter : 1,
    scene: Number.isInteger(story.state?.scene) ? story.state.scene : 1,
    currentBeat: typeof story.state?.plot?.currentBeat === 'string' ? story.state.plot.currentBeat : '',
    nextBeat: typeof story.state?.plot?.nextBeat === 'string' ? story.state.plot.nextBeat : '',
    loreEntries: Array.isArray(settings.loreEntries) ? settings.loreEntries.slice(0, 3) : [],
  });
}

function formatTalkStaticSummary(story) {
  const settings = story.settings || {};
  const styleTone = typeof settings.style?.tone === 'string' ? settings.style.tone.trim() : '';
  const viewpoint = typeof settings.style?.viewpoint === 'string' ? settings.style.viewpoint.trim() : '';
  const tempo = typeof settings.style?.tempo === 'string' ? settings.style.tempo.trim() : '';
  const length = typeof settings.style?.length === 'string' ? settings.style.length.trim() : '';
  const introDirection = typeof settings.intro?.direction === 'string' ? settings.intro.direction.trim() : '';
  const introOpening = typeof settings.intro?.opening === 'string' ? settings.intro.opening.trim() : '';
  const introSituation = typeof settings.intro?.situation === 'string' ? settings.intro.situation.trim() : '';
  const introFirstCharacter = typeof settings.intro?.firstCharacter === 'string' ? settings.intro.firstCharacter.trim() : '';
  const loreEntries = Array.isArray(settings.loreEntries) ? settings.loreEntries.slice(0, 3) : [];

  const loreText = loreEntries
    .map((item, index) => {
      const label = index + 1;
      const keyword = typeof item?.keyword === 'string' && item.keyword.trim() ? item.keyword.trim() : `項目 ${label}`;
      const description = typeof item?.description === 'string' ? item.description.trim() : '';
      const trigger = typeof item?.trigger === 'string' ? item.trigger.trim() : '';
      return `${label}. ${keyword} - ${description || 'なし'} / ${trigger || 'なし'}`;
    })
    .join('\n');

  return [
    `タイトル: ${story.title}`,
    `説明: ${story.description || 'なし'}`,
    `出だし: ${story.opening}`,
    `主人公: ${story.protagonist || '未設定'}`,
    `相手役: ${story.counterpart || '未設定'}`,
    `文体: ${styleTone || '自然'}`,
    `視点: ${viewpoint || '三人称'}`,
    `テンポ: ${tempo || '自然'}`,
    `応答長: ${length || '自動'}`,
    `始め方: ${introDirection || '会話から始める'}`,
    `冒頭文: ${introOpening || 'なし'}`,
    `開始時の状況: ${introSituation || 'なし'}`,
    `最初に出すキャラ: ${introFirstCharacter || 'なし'}`,
    `現在のビート: ${typeof story.state?.plot?.currentBeat === 'string' ? story.state.plot.currentBeat : '導入'}`,
    `次のビート: ${typeof story.state?.plot?.nextBeat === 'string' ? story.state.plot.nextBeat : '未定'}`,
    '【キャラクター】',
    formatCharacterList(settings) || 'なし',
    '【裏設定(抜粋)】',
    loreText || 'なし',
    '【STORYプロンプト】',
    story.storyPrompt || 'なし',
  ].join('\n');
}

function getTalkConversationContext(story) {
  const key = createTalkContextKey(story, 'conversation');
  if (talkConversationContextCache.key === key) {
    return talkConversationContextCache.text;
  }

  const text = formatTalkStaticSummary(story);
  talkConversationContextCache = { key, text };
  return text;
}

function getTalkOpeningContext(story) {
  const key = createTalkContextKey(story, 'opening');
  if (talkOpeningContextCache.key === key) {
    return talkOpeningContextCache.text;
  }

  const text = formatTalkStaticSummary(story);
  talkOpeningContextCache = { key, text };
  return text;
}

function buildTalkPrompt(userInput) {
  const story = getTalkStorySettings();
  const endingSummary = typeof story.settings?.ending?.summary === 'string' ? story.settings.ending.summary.trim() : '';
  const lastNarration = talkEntries.length > 0
    ? talkEntries[talkEntries.length - 1]?.text || ''
    : '';
  const staticContext = getTalkConversationContext(story);

  return [
    'あなたはブラウザー内で動作する物語進行 LLM です。',
    `この画面では、${story.protagonist || '物語の人物'} が返答役です。`,
    `ユーザーの入力に対して、${story.protagonist || '物語の人物'} として自然に返してください。`,
    '会話は物語の一部です。状況・行動・感情のいずれかを、必ず次の展開に進めてください。',
    '入力の言い換えだけで終わらせないでください。返答には新しい出来事、判断、移動、会話の進展のどれかを必ず含めてください。',
    'ユーザーの文を要約して返すだけの応答は禁止です。別の情報を1つ以上追加してください。',
    '相手の問いに答えるだけで止めず、次に何が起きるかを具体的に1歩進めてください。',
    '同じ表現や同じ結論を繰り返さず、前回より少しでも状況を動かしてください。',
    '返答本文の narration は 3〜6 文で書いてください。1 文だけで終わらせないでください。',
    '各返答には、少なくとも「新しい観察 1 つ」「行動 1 つ」「次のきっかけ 1 つ」を含めてください。',
    'ユーザーの直前の文章をそのまま言い換えるのは禁止です。似た描写で埋めるのではなく、会話を前に進めてください。',
    `この会話の最終目的は、${endingSummary || story.state?.plot?.nextBeat || story.description || '物語を前進させること'} です。`,
    '起承転転転結を意識し、今は「承」から「転」を何度か重ねて、最後に結末へ向かうつもりで返答してください。',
    'ひとつの返答で大きく終わらせず、小さな変化・誤解・発見・揺さぶりを複数回挟んでください。',
    '応答には narration / next_beat / lore_hits / dialogue_hint を含めてください。チャットに表示するのは narration だけです。コードフェンスや説明文は不要です。',
    '次の応答は、会話の進行に必要な最小限の情報だけを使ってください。',
    '同じ描写の繰り返しは避け、直前の応答の続きを1歩進めてください。',
    '',
    '【コンテキスト】',
    staticContext,
    '',
    '【最近の会話】',
    formatTalkHistory(3),
    '',
    '【直前の応答】',
    lastNarration || 'なし',
    '',
    '【今回の発言】',
    `ユーザー: ${userInput}`,
    '',
    '返答は JSON のみで、コードフェンスは不要です。',
  ].join('\n');
}

function buildTalkOpeningPrompt() {
  const story = getTalkStorySettings();
  const settings = story.settings;
  const introDirection = typeof settings.intro?.direction === 'string' ? settings.intro.direction.trim() : '';
  const introOpening = typeof settings.intro?.opening === 'string' ? settings.intro.opening.trim() : '';
  const introSituation = typeof settings.intro?.situation === 'string' ? settings.intro.situation.trim() : '';
  const introFirstCharacter = typeof settings.intro?.firstCharacter === 'string' ? settings.intro.firstCharacter.trim() : '';
  const staticContext = getTalkOpeningContext(story);

  return [
    'あなたはブラウザー内で動作する物語進行 LLM です。',
    `この画面では、${story.protagonist || '物語の人物'} が返答役です。`,
    `会話の開始として、${story.protagonist || '物語の人物'} の最初の一言を自然に返してください。`,
    'ここではユーザー発言はまだありません。物語の出だしを返してください。',
    '出だしは 3〜4 文で、場面説明・感情・次の動きを含めてください。',
    '応答には narration / next_beat / lore_hits / dialogue_hint を含めてください。チャットに表示するのは narration だけです。コードフェンスや説明文は不要です。',
    '次の応答は、会話の開始に必要な最小限の情報だけを使ってください。',
    '',
    '【コンテキスト】',
    staticContext,
    '',
    '【開始設定】',
    `始め方: ${introDirection || '会話から始める'}`,
    `冒頭文: ${introOpening || 'なし'}`,
    `開始時の状況: ${introSituation || 'なし'}`,
    `最初に出すキャラ: ${introFirstCharacter || 'なし'}`,
    '',
    '返答は JSON のみで、コードフェンスは不要です。',
  ].join('\n');
}

function parseTalkStructuredReply(text) {
  const rawText = String(text ?? '').trim();
  if (!rawText) {
    return null;
  }

  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const source = (fencedMatch?.[1] ?? rawText).trim();
  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');
  const jsonText = firstBrace >= 0 && lastBrace > firstBrace ? source.slice(firstBrace, lastBrace + 1) : source;

  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      narration: typeof parsed.narration === 'string' ? parsed.narration.trim() : '',
      nextBeat: typeof parsed.next_beat === 'string' ? parsed.next_beat.trim() : '',
      loreHits: Array.isArray(parsed.lore_hits)
        ? parsed.lore_hits.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
        : [],
      dialogueHint: typeof parsed.dialogue_hint === 'string' ? parsed.dialogue_hint.trim() : '',
      raw: rawText,
    };
  } catch {
    return null;
  }
}

function extractNarrationFromRawText(text) {
  const rawText = String(text ?? '').trim();
  if (!rawText) {
    return '';
  }

  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const source = (fencedMatch?.[1] ?? rawText).trim();

  const narrationMatch = source.match(/"narration"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
  if (narrationMatch?.[1]) {
    try {
      return JSON.parse(`"${narrationMatch[1]}"`).trim();
    } catch {
      return narrationMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\n/g, '\n')
        .trim();
    }
  }

  const partialNarrationMatch = source.match(/"narration"\s*:\s*"([\s\S]*)/i);
  if (partialNarrationMatch?.[1]) {
    return partialNarrationMatch[1]
      .replace(/"[,\s]*$/, '')
      .replace(/\}\s*$/, '')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .trim();
  }

  const lineMatch = source.match(/narration\s*[:=]\s*(.+)$/im);
  if (lineMatch?.[1]) {
    return lineMatch[1]
      .replace(/^\s*"\s*/, '')
      .replace(/\s*"\s*,?\s*$/, '')
      .replace(/\}\s*$/, '')
      .trim();
  }

  return source
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractGeneratedText(result) {
  if (Array.isArray(result) && result.length > 0) {
    const first = result[0];
    if (typeof first === 'string') {
      return first;
    }
    if (first && typeof first === 'object') {
      return first.generated_text ?? first.text ?? '';
    }
  }

  if (result && typeof result === 'object') {
    return result.generated_text ?? result.text ?? '';
  }

  return typeof result === 'string' ? result : String(result ?? '');
}

function sanitizeTalkText(text) {
  return String(text ?? '')
    .replace(/<extraid_\d+>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasJapaneseCharacters(text) {
  return /[ぁ-んァ-ヶ一-龠々]/.test(text);
}

function buildFallbackTalkReply(userInput) {
  const story = getTalkStorySettings();
  const snippet = sanitizeTalkText(userInput).slice(0, 30);

  if (snippet) {
    return `${story.protagonist || '登場人物'} は相手の言葉を受け、視線を少しだけ奥へ向けた。空気は静かなままだが、何かを見つけたように足取りが変わる。次の一歩で、この場所に眠る手がかりが見え始める。`;
  }

  return `${story.protagonist || '登場人物'} は周囲の気配を確かめながら、ゆっくりと次の行動を選んだ。静かな場面のままでは終わらず、まだ語られていない出来事が一つ、すぐ近くまで来ている。`;
}

function setTalkDebugState(nextState) {
  talkDebugState = nextState && typeof nextState === 'object' ? nextState : null;
  saveTalkDebugState(talkDebugState);
  updateTalkDialogueHint(talkDebugState?.dialogueHint || '');
  renderFlowDrawer();
}

function pushTalkPendingEntry(text, side = 'left') {
  return talkEntries.push({
    text,
    side,
    label: '',
    pending: true,
  }) - 1;
}

function replaceTalkEntry(index, entry) {
  if (Number.isInteger(index) && index >= 0 && index < talkEntries.length) {
    talkEntries[index] = entry;
    return true;
  }

  talkEntries.push(entry);
  return false;
}

function logTalkDebugState(context, prompt, rawReply, debugState) {
  const payload = {
    context,
    prompt: typeof prompt === 'string' ? prompt : String(prompt ?? ''),
    rawReply: typeof rawReply === 'string' ? rawReply : String(rawReply ?? ''),
    debugState,
  };

  console.groupCollapsed(`[lingo] TALK debug: ${context}`);
  console.log('prompt:', payload.prompt);
  console.log('raw reply:', payload.rawReply);
  console.log('parsed debug:', payload.debugState);
  console.groupEnd();
}

function normalizeTalkReply(text, userInput) {
  const structured = parseTalkStructuredReply(text);
  const narration = structured?.narration || extractNarrationFromRawText(text);
  const cleaned = sanitizeTalkText(narration || text);

  if (!cleaned || cleaned.includes('<extraid_') || !hasJapaneseCharacters(cleaned)) {
    return buildFallbackTalkReply(userInput);
  }

  return cleaned;
}

function getNextBeatFromText(text) {
  const structured = parseTalkStructuredReply(text);
  if (structured?.nextBeat) {
    return sanitizeTalkText(structured.nextBeat);
  }

  const rawText = String(text ?? '').trim();
  const lineMatch = rawText.match(/"next_beat"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
  if (lineMatch?.[1]) {
    try {
      return JSON.parse(`"${lineMatch[1]}"`).trim();
    } catch {
      return lineMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
    }
  }

  return '';
}

function isTalkReplyTooSimilar(reply, userInput) {
  const normalizedReply = sanitizeTalkText(reply);
  const normalizedInput = sanitizeTalkText(userInput);

  if (!normalizedReply || !normalizedInput) {
    return false;
  }

  if (normalizedReply === normalizedInput) {
    return true;
  }

  return normalizedReply.includes(normalizedInput.slice(0, Math.min(8, normalizedInput.length)));
}

function hasBuiltinTalkModel() {
  return Boolean(window.isSecureContext && builtinAi?.languageModel?.create);
}

function getBuiltinTalkAvailabilityReason() {
  if (!window.isSecureContext) {
    return 'Chrome 内蔵AI は HTTPS / localhost でのみ使えます';
  }

  if (!builtinAi) {
    return 'この Chrome では built-in AI API が見つかりません';
  }

  if (!builtinAi.languageModel) {
    return 'languageModel API が見つかりません';
  }

  if (typeof builtinAi.languageModel.create !== 'function') {
    return 'languageModel.create が利用できません';
  }

  return '';
}

async function ensureBuiltinTalkModelReady() {
  if (talkBuiltinSession) {
    talkBackend = 'builtin';
    talkReadyModel = BUILTIN_TALK_MODEL_LABEL;
    return talkBuiltinSession;
  }

  if (talkBuiltinInitPromise) {
    return talkBuiltinInitPromise;
  }

  if (!hasBuiltinTalkModel()) {
    throw new Error(getBuiltinTalkAvailabilityReason() || 'Chrome 内蔵AI (Gemini Nano) is not available in this browser');
  }

  setTalkLlmStatus('llm: loading Chrome 内蔵AI...');

  talkBuiltinInitPromise = (async () => {
    try {
      const session = await builtinAi.languageModel.create();
      talkBuiltinSession = session;
      talkBackend = 'builtin';
      talkReadyModel = BUILTIN_TALK_MODEL_LABEL;
      setTalkLlmStatus(`llm: ready ${BUILTIN_TALK_MODEL_LABEL}`);
      return session;
    } catch (error) {
      talkBuiltinSession = null;
      throw error;
    }
  })().finally(() => {
    talkBuiltinInitPromise = null;
  });

  return talkBuiltinInitPromise;
}

async function ensureOllamaTalkModelReady() {
  if (talkOllamaModel) {
    talkBackend = 'ollama';
    talkReadyModel = `ollama:${talkOllamaModel}`;
    return talkOllamaModel;
  }

  if (talkOllamaInitPromise) {
    return talkOllamaInitPromise;
  }

  const baseUrl = loadTalkOllamaBaseUrl();
  setTalkLlmStatus('llm: loading ollama...');

  talkOllamaInitPromise = (async () => {
    const models = await loadTalkOllamaAvailableModels();
    const preferredModel = loadTalkOllamaModelPreference();
    const selectedModel = (preferredModel && models.includes(preferredModel) && preferredModel)
      || OLLAMA_MODEL_CANDIDATES.find((candidate) => models.includes(candidate))
      || models[0];

    if (!selectedModel) {
      throw new Error('Ollama に利用可能なモデルが見つかりません');
    }

    talkOllamaModel = selectedModel;
    talkBackend = 'ollama';
    talkReadyModel = `ollama:${selectedModel}`;
    setTalkLlmStatus(`llm: ready ollama:${selectedModel}`);
    return selectedModel;
  })().finally(() => {
    talkOllamaInitPromise = null;
  });

  return talkOllamaInitPromise;
}

function ensureTalkWorker() {
  if (talkWorker) {
    return talkWorker;
  }

  const worker = new Worker(new URL('./talk.worker.js', import.meta.url), {
    type: 'module',
  });

  worker.onmessage = (event) => {
    const msg = event.data;
    const pending = talkPending.get(msg.requestId);

    if (pending) {
      talkPending.delete(msg.requestId);
    }

    if (msg.type === 'ready') {
      talkReadyModel = msg.modelId;
      setTalkLlmStatus(`llm: ready ${msg.modelId}`);
      if (pending) {
        pending.resolve(msg);
      }
      return;
    }

    if (msg.type === 'result') {
      if (pending) {
        pending.resolve(msg);
      }
      return;
    }

    if (msg.type === 'error') {
      if (pending) {
        pending.reject(new Error(msg.error || 'Talk worker failed'));
      }
      setTalkLlmStatus('llm: error');
    }
  };

  worker.onerror = (event) => {
    const error = event.error ?? new Error(event.message || 'Talk worker failed');
    console.error('[lingo] Talk worker error:', error);
    setTalkLlmStatus('llm: error');
    for (const [, pending] of talkPending) {
      pending.reject(error);
    }
    talkPending.clear();
  };

  talkWorker = worker;
  return worker;
}

function postTalkMessage(message) {
  const worker = ensureTalkWorker();
  const requestId = ++talkRequestSeq;

  return new Promise((resolve, reject) => {
    talkPending.set(requestId, { resolve, reject });
    worker.postMessage({ ...message, requestId });
  });
}

async function ensureTalkModelReady() {
  if (talkReadyModel) {
    return talkReadyModel;
  }

  if (talkInitPromise) {
    return talkInitPromise;
  }

  setTalkLlmStatus('llm: loading...');
  console.groupCollapsed('[lingo] TALK ensureTalkModelReady');
  console.log('preference:', talkEnginePreference);
  console.log('backend order:', getTalkBackendOrder());

  talkInitPromise = (async () => {
    for (const backend of getTalkBackendOrder()) {
      if (backend === 'ollama') {
        try {
          console.log('trying backend:', 'ollama');
          await ensureOllamaTalkModelReady();
          console.log('backend ready:', 'ollama', talkReadyModel);
          return talkReadyModel;
        } catch (error) {
          console.warn('[lingo] Ollama unavailable:', error);
        }
      }

      if (backend === 'worker') {
        try {
          console.log('trying backend:', 'worker');
          const msg = await postTalkMessage({
            type: 'init',
            candidates: TALK_MODEL_CANDIDATES,
          });
          talkReadyModel = msg.modelId;
          talkBackend = 'worker';
          setTalkLlmStatus(`llm: ready ${msg.modelId}`);
          console.log('backend ready:', 'worker', talkReadyModel);
          return msg.modelId;
        } catch (error) {
          console.warn('[lingo] Talk worker unavailable:', error);
        }
      }

      if (backend === 'builtin' && hasBuiltinTalkModel()) {
        try {
          console.log('trying backend:', 'builtin');
          await ensureBuiltinTalkModelReady();
          console.log('backend ready:', 'builtin', talkReadyModel);
          return talkReadyModel;
        } catch (error) {
          console.warn('[lingo] Chrome built-in AI unavailable:', error);
        }
      }
    }

    if (talkEnginePreference === 'builtin') {
      throw new Error(getBuiltinTalkAvailabilityReason() || 'Chrome 内蔵AI is not available in this browser');
    }

    if (talkEnginePreference === 'ollama') {
      throw new Error(`Ollama が利用できません。${loadTalkOllamaBaseUrl()} を確認してください。`);
    }

    throw new Error('No talk model available');
  })()
    .catch((error) => {
      setTalkLlmStatus('llm: unavailable');
      throw error;
    })
    .finally(() => {
      talkInitPromise = null;
      console.groupEnd();
    });

  return talkInitPromise;
}

function applyTalkEnginePreference(nextPreference) {
  const preference = nextPreference === 'worker' || nextPreference === 'builtin' || nextPreference === 'ollama'
    ? nextPreference
    : 'auto';
  talkEnginePreference = preference;
  saveTalkEnginePreference(preference);
  syncTalkEngineSelect();
  resetTalkBackendState();
  setTalkLlmStatus('llm: idle');
}

function applyTalkOllamaModelPreference(nextModel) {
  saveTalkOllamaModelPreference(nextModel);
  resetTalkBackendState();
}

async function generateTalkReply(userInput, pendingIndex = -1) {
  if (!talkSessionStarted) {
    throw new Error('先に TALK を起動してください');
  }

  const useCompactPrompt = talkBackend === 'ollama' && Array.isArray(talkOllamaContext) && talkOllamaContext.length > 0;
  const prompt = useCompactPrompt ? buildTalkFollowupPrompt(userInput) : buildTalkPrompt(userInput);
  setTalkPhase('generating');
  setTalkLlmStatus('llm: generating...');

  try {
    await ensureTalkModelReady();
    let reply = '';
    let debug = null;

    if (talkBackend === 'builtin' && talkBuiltinSession) {
      reply = await talkBuiltinSession.prompt(prompt);
    } else if (talkBackend === 'ollama') {
      const baseUrl = loadTalkOllamaBaseUrl();
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: talkOllamaModel,
          prompt,
          stream: false,
          format: 'json',
          options: getOllamaGenerationOptions(),
          context: useCompactPrompt && Array.isArray(talkOllamaContext) ? talkOllamaContext : undefined,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(detail ? `Ollama 生成に失敗しました (${response.status}): ${detail}` : `Ollama 生成に失敗しました (${response.status})`);
      }

      const result = await response.json();
      reply = extractOllamaResponse(result);
      if (Array.isArray(result?.context) && result.context.length > 0) {
        talkOllamaContext = result.context;
      }
    } else {
      const result = await postTalkMessage({
        type: 'generate',
        prompt,
        maxNewTokens: TALK_GENERATION_TOKEN_LIMIT,
      });
      reply = extractGeneratedText(result.generatedText);
    }

    const structured = parseTalkStructuredReply(reply);
    debug = structured || {
      narration: normalizeTalkReply(reply, userInput),
      nextBeat: getNextBeatFromText(reply),
      loreHits: [],
      dialogueHint: '',
      raw: String(reply ?? ''),
    };
    logTalkDebugState('generate', prompt, reply, debug);
    reply = normalizeTalkReply(structured?.narration || reply, userInput);
    if (reply && isTalkReplyTooSimilar(reply, userInput)) {
      reply = buildFallbackTalkReply(userInput);
    }
    const story = getTalkStorySettings();
    const resultEntry = {
      text: reply,
      side: 'left',
      label: story.protagonist,
    };
    if (pendingIndex >= 0 && pendingIndex < talkEntries.length) {
      talkEntries[pendingIndex] = resultEntry;
    } else {
      talkEntries.push(resultEntry);
    }
    setTalkDebugState(debug);
    saveTalkEntries(talkEntries);
    renderTalkEntries();
    setTalkLlmStatus(`llm: ready ${talkReadyModel || 'browser'}`);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '会話の生成に失敗しました。';
    console.error('[lingo] Talk generation failed:', error);
    setTalkLlmStatus('llm: error');
    const story = getTalkStorySettings();
    const errorEntry = {
      text: normalizeTalkReply(`会話の生成に失敗しました。${message}`, userInput),
      side: 'left',
      label: story.protagonist,
    };
    if (pendingIndex >= 0 && pendingIndex < talkEntries.length) {
      talkEntries[pendingIndex] = errorEntry;
    } else {
      talkEntries.push(errorEntry);
    }
    setTalkDebugState(null);
    saveTalkEntries(talkEntries);
    renderTalkEntries();
  } finally {
    setTalkPhase('idle');
  }
}

async function seedTalkOpeningReply(pendingIndex = -1) {
  if (!talkSessionStarted || talkOpeningSeedPromise) {
    return talkOpeningSeedPromise;
  }

  talkOpeningSeedPromise = (async () => {
    setTalkPhase('opening');
    await ensureTalkModelReady();

    const prompt = buildTalkOpeningPrompt();
    let reply = '';
    let debug = null;

    if (talkBackend === 'builtin' && talkBuiltinSession) {
      reply = await talkBuiltinSession.prompt(prompt);
    } else if (talkBackend === 'ollama') {
      const baseUrl = loadTalkOllamaBaseUrl();
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: talkOllamaModel,
          prompt,
          stream: false,
          format: 'json',
          options: getOllamaGenerationOptions(),
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(detail ? `Ollama 生成に失敗しました (${response.status}): ${detail}` : `Ollama 生成に失敗しました (${response.status})`);
      }

      const result = await response.json();
      reply = extractOllamaResponse(result);
      if (Array.isArray(result?.context) && result.context.length > 0) {
        talkOllamaContext = result.context;
      }
    } else {
      const result = await postTalkMessage({
        type: 'generate',
        prompt,
        maxNewTokens: TALK_GENERATION_TOKEN_LIMIT,
      });
      reply = extractGeneratedText(result.generatedText);
    }

    const structured = parseTalkStructuredReply(reply);
    debug = structured || {
      narration: normalizeTalkReply(reply, ''),
      nextBeat: getNextBeatFromText(reply),
      loreHits: [],
      dialogueHint: '',
      raw: String(reply ?? ''),
    };
    logTalkDebugState('opening', prompt, reply, debug);
    reply = normalizeTalkReply(structured?.narration || reply, '');
    if (!reply) {
      return;
    }

    const story = getTalkStorySettings();
    replaceTalkEntry(pendingIndex, {
      text: reply,
      side: 'left',
      label: story.protagonist,
    });
    setTalkDebugState(debug);
    saveTalkEntries(talkEntries);
    renderTalkEntries();
  })()
    .catch((error) => {
      console.warn('[lingo] Talk opening seed failed:', error);
    })
    .finally(() => {
      talkOpeningSeedPromise = null;
      setTalkPhase(talkSessionStarted ? 'idle' : 'error');
    });

  return talkOpeningSeedPromise;
}

async function startTalkSession() {
  console.groupCollapsed('[lingo] TALK startTalkSession');
  console.log('started:', talkSessionStarted);
  console.log('entries:', talkEntries.length);
  console.groupEnd();

  if (talkSessionStarted && (talkEntries.length > 0 || talkReadyModel)) {
    setTalkLlmStatus(`llm: ready ${talkReadyModel || 'browser'}`);
    return;
  }

  setTalkPhase('starting');
  setTalkLlmStatus('llm: loading...');

  try {
    await ensureTalkModelReady();
    talkSessionStarted = true;

    if (talkEntries.length === 0) {
      const pendingIndex = pushTalkPendingEntry('オープニングを生成中...', 'left');
      renderTalkEntries();
      await seedTalkOpeningReply(pendingIndex);
    } else {
      setTalkLlmStatus(`llm: ready ${talkReadyModel || 'browser'}`);
    }
  } catch (error) {
    talkSessionStarted = false;
    const message = error instanceof Error && error.message ? error.message : 'TALK の起動に失敗しました。';
    console.error('[lingo] Talk start failed:', error);
    setTalkLlmStatus('llm: error');
    talkEntries.push({
      text: `TALK の起動に失敗しました。${message}`,
      side: 'left',
      label: 'System',
    });
    saveTalkEntries(talkEntries);
    renderTalkEntries();
  }
}

function getFlowSettings() {
  const state = loadStoryState();
  const settings = state?.storySettings && typeof state.storySettings === 'object' ? state.storySettings : {};
  const characters = Array.isArray(settings.characters) ? settings.characters : [];
  const flow = settings.flow && typeof settings.flow === 'object' ? settings.flow : {};

  return {
    title: typeof flow.title === 'string' && flow.title.trim() ? flow.title.trim() : '登場人物',
    description: typeof flow.description === 'string' ? flow.description : 'TALK で参照する人物情報を表示します。',
    showCharacters: flow.showCharacters !== false,
    showImages: flow.showImages !== false,
    characters,
  };
}

function renderFlowDrawer() {
  if (!talkFlowGrid) {
    return;
  }

  const flow = getFlowSettings();

  if (talkFlowTitle) {
    talkFlowTitle.textContent = flow.title;
  }

  if (talkFlowDescription) {
    talkFlowDescription.textContent = flow.description;
  }

  talkFlowGrid.innerHTML = '';

  if (!flow.showCharacters) {
    const empty = document.createElement('div');
    empty.className = 'talk-flow-empty';
    empty.textContent = 'STORY 側で FLOW の人物表示がオフです。';
    talkFlowGrid.appendChild(empty);
  } else if (flow.characters.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'talk-flow-empty';
    empty.textContent = '表示できる人物がまだありません。';
    talkFlowGrid.appendChild(empty);
  } else {
    for (const character of flow.characters) {
      const card = document.createElement('article');
      card.className = 'talk-flow-card';

      const avatar = document.createElement('div');
      avatar.className = 'talk-flow-avatar';

      const imageUrl = typeof character?.imageUrl === 'string' ? character.imageUrl.trim() : '';
      const name = typeof character?.name === 'string' && character.name.trim() ? character.name.trim() : 'Character';
      const initials = name.slice(0, 1).toUpperCase();

      if (flow.showImages && imageUrl) {
        avatar.classList.add('has-image');
        avatar.style.backgroundImage = `url("${imageUrl.replaceAll('"', '\\"')}")`;
        avatar.textContent = '';
      } else {
        avatar.textContent = initials;
      }

      const body = document.createElement('div');
      body.className = 'talk-flow-card-body';

      const head = document.createElement('div');
      head.className = 'talk-flow-card-head';

      const nameEl = document.createElement('strong');
      nameEl.textContent = name;

      const relation = document.createElement('span');
      relation.className = 'talk-flow-relation';
      relation.textContent = typeof character?.relation === 'string' && character.relation.trim() ? character.relation.trim() : '関係性未設定';

      head.append(nameEl, relation);

      const detail = document.createElement('p');
      const personality = typeof character?.personality === 'string' ? character.personality.trim() : '';
      const voice = typeof character?.voice === 'string' ? character.voice.trim() : '';
      detail.textContent = [personality, voice].filter(Boolean).join(' / ') || '設定を STORY 側で入力してください。';

      body.append(head, detail);
      card.append(avatar, body);
      talkFlowGrid.appendChild(card);
    }
  }

  const rawCard = document.createElement('article');
  rawCard.className = 'talk-flow-card talk-flow-debug';

  const rawBody = document.createElement('div');
  rawBody.className = 'talk-flow-card-body';

  const rawHead = document.createElement('div');
  rawHead.className = 'talk-flow-card-head';

  const rawTitle = document.createElement('strong');
  rawTitle.textContent = 'DEBUG LOG';

  const rawTag = document.createElement('span');
  rawTag.className = 'talk-flow-relation';
  rawTag.textContent = '受信データそのまま';

  rawHead.append(rawTitle, rawTag);

  const rawText = document.createElement('pre');
  rawText.className = 'talk-flow-raw';
  rawText.textContent = talkDebugState
    ? (typeof talkDebugState.raw === 'string'
      ? talkDebugState.raw
      : JSON.stringify(talkDebugState, null, 2))
    : 'まだ受信データはありません。TALK を起動して会話を送ると、ここに素の応答が表示されます。';

  rawBody.append(rawHead, rawText);
  rawCard.append(rawBody);
  talkFlowGrid.appendChild(rawCard);

  const debugCard = document.createElement('article');
  debugCard.className = 'talk-flow-card talk-flow-debug';

  const debugBody = document.createElement('div');
  debugBody.className = 'talk-flow-card-body';

  const debugHead = document.createElement('div');
  debugHead.className = 'talk-flow-card-head';

  const debugTitle = document.createElement('strong');
  debugTitle.textContent = 'DEBUG';

  const debugTag = document.createElement('span');
  debugTag.className = 'talk-flow-relation';
  debugTag.textContent = 'next_beat / lore_hits / dialogue_hint';

  debugHead.append(debugTitle, debugTag);

  const debugText = document.createElement('p');
  const debugLines = [];
  debugLines.push(`next_beat: ${talkDebugState?.nextBeat || 'なし'}`);
  debugLines.push(`lore_hits: ${Array.isArray(talkDebugState?.loreHits) && talkDebugState.loreHits.length > 0 ? talkDebugState.loreHits.join(' / ') : 'なし'}`);
  debugLines.push(`dialogue_hint: ${talkDebugState?.dialogueHint || 'なし'}`);
  debugText.textContent = debugLines.join(' / ');

  debugBody.append(debugHead, debugText);
  debugCard.append(debugBody);
  talkFlowGrid.appendChild(debugCard);
}

function openFlowDrawer() {
  renderFlowDrawer();
  document.body.classList.add('talk-flow-open');
  talkFlowLayer?.setAttribute('aria-hidden', 'false');
}

function closeFlowDrawer() {
  document.body.classList.remove('talk-flow-open');
  talkFlowLayer?.setAttribute('aria-hidden', 'true');
}

let talkEntries = loadTalkEntries();
talkDebugState = loadTalkDebugState();
updateTalkDialogueHint(talkDebugState?.dialogueHint || '');

function reloadTalkConversation() {
  talkEntries = loadTalkEntries();
  talkDebugState = loadTalkDebugState();
  talkSessionStarted = false;
  renderStoryContext();
  renderTalkEntries();
  renderFlowDrawer();
}

function resetTalkConversation() {
  talkEntries = [];
  talkDebugState = null;
  talkSessionStarted = false;
  talkOpeningSeedPromise = null;
  saveTalkEntries(talkEntries);
  saveTalkDebugState(null);

  if (talkInput) {
    talkInput.value = '';
  }

  setTalkLlmStatus('llm: idle');
  renderTalkEntries();
  renderFlowDrawer();
}

function renderTalkEntries() {
  if (!talkLog) {
    return;
  }

  talkLog.innerHTML = '';

  if (talkEntries.length === 0) {
    const opening = loadStorySummary().opening;

    const intro = document.createElement('div');
    intro.className = 'talk-open-card';

    const introLabel = document.createElement('span');
    introLabel.className = 'bubble-meta';
    introLabel.textContent = 'Opening';

    const introText = document.createElement('div');
    introText.textContent = opening;

    intro.append(introLabel, introText);
    talkLog.appendChild(intro);

    const empty = document.createElement('div');
    empty.className = 'talk-empty';
    empty.textContent = 'TALK を起動してから会話を始めてください。';
    talkLog.appendChild(empty);
    return;
  }

  for (const item of talkEntries) {
    const row = document.createElement('div');
    row.className = `bubble-row ${item.side || 'left'}`;

    const bubble = document.createElement('div');
    bubble.className = `bubble ${item.side || 'left'}`;
    if (item.pending) {
      bubble.classList.add('bubble-pending');
    }

    const meta = document.createElement('span');
    meta.className = 'bubble-meta';
    meta.textContent = item.pending ? 'GENERATING' : '';
    meta.hidden = !item.pending;

    const body = document.createElement('div');
    body.textContent = item.pending ? item.text || '生成中...' : item.text;

    bubble.append(meta, body);
    row.appendChild(bubble);
    talkLog.appendChild(row);
  }

  const spacer = document.createElement('div');
  spacer.className = 'talk-spacer';
  spacer.setAttribute('aria-hidden', 'true');
  talkLog.appendChild(spacer);

  requestAnimationFrame(() => {
    talkLog.scrollTop = talkLog.scrollHeight;
  });
}

async function sendTalk() {
  if (!talkSessionStarted) {
    await startTalkSession();
    if (!talkSessionStarted) {
      setTalkLlmStatus('llm: idle');
      return;
    }
  }

  const currentText = talkInput?.value.trim() || '';
  const text = currentText || talkDebugState?.dialogueHint?.trim() || '';
  if (!text) {
    return;
  }

  if (talkInput && !currentText && text) {
    talkInput.value = text;
  }

  talkEntries.push({
    text,
    side: 'right',
    label: '',
  });

  const responseIndex = pushTalkPendingEntry('生成中...', 'left');
  talkInput.value = '';
  saveTalkEntries(talkEntries);
  renderTalkEntries();
  await generateTalkReply(text, responseIndex);
}

sendTalkBtn?.addEventListener('click', () => {
  void sendTalk();
});
talkInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    void sendTalk();
  }
});

talkFlowBtn?.addEventListener('click', () => {
  if (document.body.classList.contains('talk-flow-open')) {
    closeFlowDrawer();
    return;
  }
  openFlowDrawer();
});

talkFlowCloseBtn?.addEventListener('click', closeFlowDrawer);
talkFlowLayer?.addEventListener('click', (event) => {
  const target = event.target;
  if (target instanceof Element && target.hasAttribute('data-flow-close')) {
    closeFlowDrawer();
  }
});

talkOllamaSaveBtn?.addEventListener('click', () => {
  if (!talkOllamaBaseUrlInput) {
    return;
  }

  saveTalkOllamaBaseUrl(talkOllamaBaseUrlInput.value);
  resetTalkBackendState();
  void loadTalkOllamaAvailableModels().catch((error) => {
    console.warn('[lingo] Ollama model list reload failed:', error);
  });
});

talkOllamaModelSelect?.addEventListener('change', () => {
  applyTalkOllamaModelPreference(talkOllamaModelSelect.value);
});

for (const button of talkEngineButtons) {
  button.addEventListener('click', () => {
    applyTalkEnginePreference(button.dataset.talkEngine || 'auto');
  });
}

talkStartBtn?.addEventListener('click', () => {
  void startTalkSession();
});

talkResetBtn?.addEventListener('click', () => {
  resetTalkConversation();
});

window.addEventListener('storage', (event) => {
  if (
    event.key === STORY_STORAGE_KEY
    || event.key === 'lingo.story.active'
    || (typeof event.key === 'string' && event.key.startsWith('lingo.story.state:'))
  ) {
    setTalkDebugState(null);
    reloadTalkConversation();
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('talk-flow-open')) {
    closeFlowDrawer();
  }
});

renderStoryContext();
renderTalkEntries();
renderFlowDrawer();
syncTalkOllamaBaseUrlInput();
syncTalkOllamaModelSelect();
applyTalkEnginePreference(loadTalkEnginePreference());
