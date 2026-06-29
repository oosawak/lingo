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
const STORAGE_KEY = 'lingo.story.talk.log';
const STORY_STORAGE_KEY = 'lingo.story.state';
const TALK_MODEL_CANDIDATES = [
  { modelId: 'Xenova/TinyLlama-1.1B-Chat-v1.0', task: 'text-generation' },
  { modelId: 'Xenova/distilgpt2', task: 'text-generation' },
];
const BUILTIN_TALK_MODEL_LABEL = 'Gemini Nano';

const builtinAi = globalThis.ai ?? null;

let talkWorker = null;
let talkInitPromise = null;
let talkRequestSeq = 0;
let talkPending = new Map();
let talkReadyModel = null;
let talkBackend = null;
let talkBuiltinSession = null;
let talkBuiltinInitPromise = null;

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

function loadTalkEntries() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.text === 'string')
      : [];
  } catch {
    return [];
  }
}

function saveTalkEntries(entries) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function loadStoryState() {
  try {
    const raw = window.localStorage.getItem(STORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function formatTalkHistory(limit = 8) {
  return talkEntries
    .slice(-limit)
    .map((entry) => `${entry.label || (entry.side === 'right' ? 'You' : 'Story')}: ${entry.text}`)
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
  const title = (settings.summary?.title || state?.plot?.title || state?.theme || '失われた街').trim();
  const description = (settings.summary?.description || state?.plot?.premise || state?.description || '').trim();
  const opening = (settings.intro?.opening || settings.intro?.situation || '').trim() || `${title} を舞台に、会話で状況が進む。`;
  const protagonist = typeof settings.characters?.[0]?.name === 'string' && settings.characters[0].name.trim()
    ? settings.characters[0].name.trim()
    : 'You';
  const counterpart = typeof settings.characters?.[1]?.name === 'string' && settings.characters[1].name.trim()
    ? settings.characters[1].name.trim()
    : 'Story';

  return {
    state,
    settings,
    title,
    description,
    opening,
    protagonist,
    counterpart,
  };
}

function buildTalkPrompt(userInput) {
  const story = getTalkStorySettings();
  const settings = story.settings;
  const styleTone = typeof settings.style?.tone === 'string' ? settings.style.tone.trim() : '';
  const viewpoint = typeof settings.style?.viewpoint === 'string' ? settings.style.viewpoint.trim() : '';
  const tempo = typeof settings.style?.tempo === 'string' ? settings.style.tempo.trim() : '';
  const length = typeof settings.style?.length === 'string' ? settings.style.length.trim() : '';
  const introDirection = typeof settings.intro?.direction === 'string' ? settings.intro.direction.trim() : '';
  const endingSummary = typeof settings.ending?.summary === 'string' ? settings.ending.summary.trim() : '';
  const summaryCopy = typeof settings.summary?.copy === 'string' ? settings.summary.copy.trim() : '';
  const flowTitle = typeof settings.flow?.title === 'string' ? settings.flow.title.trim() : '';
  const flowDescription = typeof settings.flow?.description === 'string' ? settings.flow.description.trim() : '';
  const detailForbidden = typeof settings.detail?.forbidden === 'string' ? settings.detail.forbidden.trim() : '';
  const detailTrigger = typeof settings.detail?.trigger === 'string' ? settings.detail.trigger.trim() : '';
  const loreEntries = Array.isArray(settings.loreEntries) ? settings.loreEntries : [];
  const loreText = loreEntries
    .map((item, index) => {
      const label = index + 1;
      const keyword = typeof item?.keyword === 'string' && item.keyword.trim() ? item.keyword.trim() : `項目 ${label}`;
      const description = typeof item?.description === 'string' ? item.description.trim() : '';
      const trigger = typeof item?.trigger === 'string' ? item.trigger.trim() : '';
      return `${label}. ${keyword}\n   - 説明: ${description || 'なし'}\n   - 条件: ${trigger || 'なし'}`;
    })
    .join('\n');

  return [
    'あなたはブラウザー内で動作する物語進行 LLM です。',
    'この画面は会話のやり取りではなく、ユーザーの入力を受けて物語を1段階進めるためのものです。',
    'STORY の設定と直前の会話を踏まえ、状況・行動・感情のいずれかを少しだけ前進させる短い日本語を 1〜3 文で返してください。',
    '毎回、何かが一歩進む内容にしてください。説明だけで終わらせず、次の変化が見える返答にしてください。',
    '余計な説明や箇条書きは不要です。返答本文のみを出してください。',
    `- 文体: ${styleTone || '自然'}`,
    `- 視点: ${viewpoint || '三人称'}`,
    `- テンポ: ${tempo || '自然'}`,
    `- 応答長: ${length || '自動'}`,
    '',
    '【物語】',
    `タイトル: ${story.title}`,
    `説明: ${story.description || 'なし'}`,
    `出だし: ${story.opening}`,
    `始め方: ${introDirection || '会話から始める'}`,
    '',
    '【キャラクター】',
    formatCharacterList(settings) || 'なし',
    '',
    '【裏設定】',
    loreText || 'なし',
    '',
    '【エンディング】',
    `方向性: ${endingSummary || 'なし'}`,
    '',
    '【紹介】',
    `一言コピー: ${summaryCopy || 'なし'}`,
    '',
    '【FLOW】',
    `表示タイトル: ${flowTitle || '登場人物'}`,
    `説明: ${flowDescription || 'なし'}`,
    '',
    '【制御】',
    `禁止事項: ${detailForbidden || 'なし'}`,
    `発動条件: ${detailTrigger || 'なし'}`,
    '',
    '【最近の会話】',
    formatTalkHistory(),
    '',
    '【今回の発言】',
    `${story.protagonist}: ${userInput}`,
    '',
    `${story.counterpart}:`,
  ].join('\n');
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
    return `「${snippet}」を受けて、${story.title} の流れが少し進んだ。${story.counterpart} は次の展開へ動き出す。`;
  }

  return `${story.opening} ここから物語が少し進む。`;
}

function normalizeTalkReply(text, userInput) {
  const cleaned = sanitizeTalkText(text);

  if (!cleaned || cleaned.includes('<extraid_') || !hasJapaneseCharacters(cleaned)) {
    return buildFallbackTalkReply(userInput);
  }

  return cleaned;
}

function hasBuiltinTalkModel() {
  return Boolean(window.isSecureContext && builtinAi?.languageModel?.create);
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
    throw new Error('Gemini Nano is not available in this browser');
  }

  setTalkLlmStatus('llm: loading Gemini Nano...');

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
  talkInitPromise = (async () => {
    if (hasBuiltinTalkModel()) {
      try {
        await ensureBuiltinTalkModelReady();
        return talkReadyModel;
      } catch (error) {
        console.warn('[lingo] Gemini Nano unavailable, falling back to worker:', error);
      }
    }

    const msg = await postTalkMessage({
      type: 'init',
      candidates: TALK_MODEL_CANDIDATES,
    });
    talkReadyModel = msg.modelId;
    talkBackend = 'worker';
    setTalkLlmStatus(`llm: ready ${msg.modelId}`);
    return msg.modelId;
  })()
    .catch((error) => {
      setTalkLlmStatus('llm: unavailable');
      throw error;
    })
    .finally(() => {
      talkInitPromise = null;
    });

  return talkInitPromise;
}

async function generateTalkReply(userInput) {
  const prompt = buildTalkPrompt(userInput);
  setTalkLlmStatus('llm: generating...');

  try {
    await ensureTalkModelReady();
    let reply = '';

    if (talkBackend === 'builtin' && talkBuiltinSession) {
      reply = await talkBuiltinSession.prompt(prompt);
    } else {
      const result = await postTalkMessage({
        type: 'generate',
        prompt,
        maxNewTokens: 128,
      });
      reply = extractGeneratedText(result.generatedText);
    }

    reply = normalizeTalkReply(reply, userInput);
    const story = getTalkStorySettings();

    talkEntries.push({
      text: reply,
      side: 'left',
      label: story.counterpart,
    });
    saveTalkEntries(talkEntries);
    renderTalkEntries();
    setTalkLlmStatus(`llm: ready ${talkReadyModel || 'browser'}`);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '会話の生成に失敗しました。';
    console.error('[lingo] Talk generation failed:', error);
    setTalkLlmStatus('llm: error');
    const story = getTalkStorySettings();
    talkEntries.push({
      text: normalizeTalkReply(`会話の生成に失敗しました。${message}`, userInput),
      side: 'left',
      label: story.counterpart,
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
    return;
  }

  if (flow.characters.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'talk-flow-empty';
    empty.textContent = '表示できる人物がまだありません。';
    talkFlowGrid.appendChild(empty);
    return;
  }

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

function openFlowDrawer() {
  renderFlowDrawer();
  document.body.classList.add('talk-flow-open');
  talkFlowLayer?.setAttribute('aria-hidden', 'false');
}

function closeFlowDrawer() {
  document.body.classList.remove('talk-flow-open');
  talkFlowLayer?.setAttribute('aria-hidden', 'true');
}

const talkEntries = loadTalkEntries();

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
    empty.textContent = 'ここから会話を始めてください。';
    talkLog.appendChild(empty);
    return;
  }

  for (const item of talkEntries) {
    const row = document.createElement('div');
    row.className = `bubble-row ${item.side || 'left'}`;

    const bubble = document.createElement('div');
    bubble.className = `bubble ${item.side || 'left'}`;

    const meta = document.createElement('span');
    meta.className = 'bubble-meta';
    meta.textContent = item.label || 'Talk';

    const body = document.createElement('div');
    body.textContent = item.text;

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
  const text = talkInput?.value.trim();
  if (!text) {
    return;
  }

  talkEntries.push({
    text,
    side: 'right',
    label: 'You・Talk',
  });
  talkInput.value = '';
  saveTalkEntries(talkEntries);
  renderTalkEntries();
  await generateTalkReply(text);
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

window.addEventListener('storage', (event) => {
  if (event.key === STORY_STORAGE_KEY) {
    renderStoryContext();
    renderFlowDrawer();
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
void ensureTalkModelReady();
