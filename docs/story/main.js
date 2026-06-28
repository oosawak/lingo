const storyLog = document.getElementById('story-log');
const themeInput = document.getElementById('theme-input');
const lineInput = document.getElementById('line-input');
const chapterLabel = document.getElementById('chapter-label');
const sceneLabel = document.getElementById('scene-label');
const povLabel = document.getElementById('pov-label');
const statusBadge = document.getElementById('status-badge');
const nextBeatBadge = document.getElementById('next-beat-badge');
const llmStatusBadge = document.getElementById('llm-status-badge');
const nextSceneBtn = document.getElementById('next-scene-btn');
const addLineBtn = document.getElementById('add-line-btn');
const resetBtn = document.getElementById('reset-btn');
const plotResetBtn = document.getElementById('plot-reset-btn');
const plotTitle = document.getElementById('plot-title');
const plotPremise = document.getElementById('plot-premise');
const plotRules = document.getElementById('plot-rules');
const promptPreview = document.getElementById('prompt-preview');
const characterNameInputs = [
  document.getElementById('character-0-name'),
  document.getElementById('character-1-name'),
];
const characterPersonalityInputs = [
  document.getElementById('character-0-personality'),
  document.getElementById('character-1-personality'),
];
const characterVoiceInputs = [
  document.getElementById('character-0-voice'),
  document.getElementById('character-1-voice'),
];
const characterRelationInputs = [
  document.getElementById('character-0-relation'),
  document.getElementById('character-1-relation'),
];
const loreKeywordInputs = [
  document.getElementById('lore-0-keyword'),
  document.getElementById('lore-1-keyword'),
];
const loreDescriptionInputs = [
  document.getElementById('lore-0-description'),
  document.getElementById('lore-1-description'),
];
const loreTriggerInputs = [
  document.getElementById('lore-0-trigger'),
  document.getElementById('lore-1-trigger'),
];
const loreSharedInputs = [
  document.getElementById('lore-0-shared'),
  document.getElementById('lore-1-shared'),
];
const styleToneInput = document.getElementById('style-tone');
const styleViewpointInput = document.getElementById('style-viewpoint');
const styleTempoInput = document.getElementById('style-tempo');
const styleLengthInput = document.getElementById('style-length');
const introOpeningInput = document.getElementById('intro-opening');
const introSituationInput = document.getElementById('intro-situation');
const introFirstCharacterInput = document.getElementById('intro-first-character');
const introDirectionInput = document.getElementById('intro-direction');
const summaryTitleInput = document.getElementById('summary-title');
const summaryDescriptionInput = document.getElementById('summary-description');
const summaryTagsInput = document.getElementById('summary-tags');
const summaryCopyInput = document.getElementById('summary-copy');
const detailForbiddenInput = document.getElementById('detail-forbidden');
const detailAutocorrectInput = document.getElementById('detail-autocorrect');
const detailTriggerInput = document.getElementById('detail-trigger');
const detailSaveInput = document.getElementById('detail-save');
const tabButtons = [...document.querySelectorAll('[data-story-tab]')];
const tabPanels = [...document.querySelectorAll('[data-story-panel]')];
const STORY_TABS = new Set(tabButtons.map((button) => button.dataset.storyTab).filter(Boolean));

const STORAGE_KEY = 'lingo.story.state';
const STORY_MODEL_CANDIDATES = [
  { modelId: 'Xenova/Qwen2.5-0.5B-Instruct', task: 'text-generation' },
  { modelId: 'Xenova/mt5-small', task: 'text2text-generation' },
  { modelId: 'Xenova/flan-t5-small', task: 'text2text-generation' },
];

let storyWorker = null;
let storyInitPromise = null;
let storyRequestSeq = 0;
let storyPending = new Map();
let storyReadyModel = null;

function createDefaultStorySettings() {
  return {
    characters: [
      {
        name: 'ユウ',
        personality: '落ち着いていて、状況を観察してから動く',
        voice: '短く、穏やかに話す',
        relation: '主人公',
      },
      {
        name: '相手',
        personality: '言葉の端々に本音がにじむ',
        voice: '少し砕けた口調',
        relation: '会話相手',
      },
    ],
    loreEntries: [
      {
        keyword: 'マギア王国',
        description: '危険な裏設定は必要な時だけ呼び出す。',
        trigger: '会話に固有名詞が出た時',
        shared: true,
      },
      {
        keyword: '暗黒魔法の書',
        description: '歴史や専門用語は短く、会話に必要な分だけ参照する。',
        trigger: 'キーワード一致時',
        shared: true,
      },
    ],
    style: {
      tone: '落ち着いた',
      viewpoint: '三人称',
      tempo: '自然',
      length: '自動',
    },
    intro: {
      opening: '',
      situation: '',
      firstCharacter: 'ユウ',
      direction: '会話から始める',
    },
    summary: {
      title: '',
      description: '',
      tags: '',
      copy: '',
    },
    detail: {
      forbidden: '',
      autocorrect: true,
      trigger: '',
      save: true,
    },
  };
}

function normalizeStorySettings(raw) {
  const defaults = createDefaultStorySettings();
  const source = raw && typeof raw === 'object' ? raw : {};

  return {
    characters: defaults.characters.map((fallback, index) => {
      const item = Array.isArray(source.characters) ? source.characters[index] : null;
      return {
        name: typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : fallback.name,
        personality: typeof item?.personality === 'string' ? item.personality : fallback.personality,
        voice: typeof item?.voice === 'string' ? item.voice : fallback.voice,
        relation: typeof item?.relation === 'string' ? item.relation : fallback.relation,
      };
    }),
    loreEntries: defaults.loreEntries.map((fallback, index) => {
      const item = Array.isArray(source.loreEntries) ? source.loreEntries[index] : null;
      return {
        keyword: typeof item?.keyword === 'string' && item.keyword.trim() ? item.keyword.trim() : fallback.keyword,
        description: typeof item?.description === 'string' ? item.description : fallback.description,
        trigger: typeof item?.trigger === 'string' ? item.trigger : fallback.trigger,
        shared: typeof item?.shared === 'boolean' ? item.shared : fallback.shared,
      };
    }),
    style: {
      tone: typeof source.style?.tone === 'string' ? source.style.tone : defaults.style.tone,
      viewpoint: typeof source.style?.viewpoint === 'string' ? source.style.viewpoint : defaults.style.viewpoint,
      tempo: typeof source.style?.tempo === 'string' ? source.style.tempo : defaults.style.tempo,
      length: typeof source.style?.length === 'string' ? source.style.length : defaults.style.length,
    },
    intro: {
      opening: typeof source.intro?.opening === 'string' ? source.intro.opening : defaults.intro.opening,
      situation: typeof source.intro?.situation === 'string' ? source.intro.situation : defaults.intro.situation,
      firstCharacter: typeof source.intro?.firstCharacter === 'string' && source.intro.firstCharacter.trim()
        ? source.intro.firstCharacter.trim()
        : defaults.intro.firstCharacter,
      direction: typeof source.intro?.direction === 'string' ? source.intro.direction : defaults.intro.direction,
    },
    summary: {
      title: typeof source.summary?.title === 'string' ? source.summary.title : defaults.summary.title,
      description: typeof source.summary?.description === 'string' ? source.summary.description : defaults.summary.description,
      tags: typeof source.summary?.tags === 'string' ? source.summary.tags : defaults.summary.tags,
      copy: typeof source.summary?.copy === 'string' ? source.summary.copy : defaults.summary.copy,
    },
    detail: {
      forbidden: typeof source.detail?.forbidden === 'string' ? source.detail.forbidden : defaults.detail.forbidden,
      autocorrect: typeof source.detail?.autocorrect === 'boolean' ? source.detail.autocorrect : defaults.detail.autocorrect,
      trigger: typeof source.detail?.trigger === 'string' ? source.detail.trigger : defaults.detail.trigger,
      save: typeof source.detail?.save === 'boolean' ? source.detail.save : defaults.detail.save,
    },
  };
}

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
    storySettings: createDefaultStorySettings(),
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
    nextBeat: '未定',
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
      storySettings: normalizeStorySettings(parsed.storySettings ?? parsed.settings ?? parsed),
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
            nextBeat: typeof parsed.plot.nextBeat === 'string' && parsed.plot.nextBeat.trim()
              ? parsed.plot.nextBeat.trim()
              : '未定',
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

function setLlmStatus(text) {
  if (llmStatusBadge) {
    llmStatusBadge.textContent = text;
  }
}

function ensureStoryWorker() {
  if (storyWorker) {
    return storyWorker;
  }

  const worker = new Worker(new URL('./story.worker.js', import.meta.url), {
    type: 'module',
  });

  worker.onmessage = (event) => {
    const msg = event.data;
    const pending = storyPending.get(msg.requestId);

    if (pending) {
      storyPending.delete(msg.requestId);
    }

    if (msg.type === 'ready') {
      storyReadyModel = msg.modelId;
      setLlmStatus(`llm: ready ${msg.modelId}`);
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
        pending.reject(new Error(msg.error || 'Story worker failed'));
      }
      setLlmStatus('llm: error');
    }
  };

  worker.onerror = (event) => {
    const error = event.error ?? new Error(event.message || 'Story worker failed');
    console.error('[lingo] Story worker error:', error);
    setLlmStatus('llm: error');
    for (const [, pending] of storyPending) {
      pending.reject(error);
    }
    storyPending.clear();
  };

  storyWorker = worker;
  return worker;
}

function postStoryMessage(message) {
  const worker = ensureStoryWorker();
  const requestId = ++storyRequestSeq;

  return new Promise((resolve, reject) => {
    storyPending.set(requestId, { resolve, reject });
    worker.postMessage({ ...message, requestId });
  });
}

async function ensureStoryModelReady() {
  if (storyReadyModel) {
    return storyReadyModel;
  }

  if (storyInitPromise) {
    return storyInitPromise;
  }

  setLlmStatus('llm: loading...');
  storyInitPromise = postStoryMessage({
    type: 'init',
    candidates: STORY_MODEL_CANDIDATES,
  })
    .then((msg) => {
      storyReadyModel = msg.modelId;
      return msg.modelId;
    })
    .catch((error) => {
      setLlmStatus('llm: unavailable');
      throw error;
    })
    .finally(() => {
      storyInitPromise = null;
    });

  return storyInitPromise;
}

function renderPromptPreview() {
  if (!promptPreview) {
    return;
  }

  promptPreview.value = buildStoryPrompt(state.lines[state.lines.length - 1] ?? '');
}

function formatSettingList(items) {
  return items
    .map((item, index) => {
      const label = index + 1;
      const keyword = item.keyword?.trim() || `項目 ${label}`;
      const description = item.description?.trim() || '説明なし';
      const trigger = item.trigger?.trim() || '条件なし';
      return `${label}. ${keyword}\n   - 説明: ${description}\n   - 条件: ${trigger}\n   - 共有: ${item.shared ? 'はい' : 'いいえ'}`;
    })
    .join('\n');
}

function formatConversationHistory(limit = 8) {
  const history = state.entries.slice(-limit);
  if (history.length === 0) {
    return 'まだ会話はありません。';
  }

  return history
    .map((entry) => {
      const speaker = getSpeakerName(entry.kind);
      return `${speaker}: ${entry.text}`;
    })
    .join('\n');
}

function buildStoryPrompt(userInput) {
  const settings = state.storySettings || createDefaultStorySettings();
  const protagonist = settings.characters[0]?.name?.trim() || '主人公';
  const counterpart = settings.characters[1]?.name?.trim() || '相手';
  const theme = state.theme || '失われた街';
  const plot = state.plot || createPlot(theme);
  const opening = settings.intro.opening?.trim() || 'なし';
  const situation = settings.intro.situation?.trim() || 'なし';
  const summaryTitle = settings.summary.title?.trim() || 'なし';
  const summaryDescription = settings.summary.description?.trim() || 'なし';
  const summaryTags = settings.summary.tags?.trim() || 'なし';
  const summaryCopy = settings.summary.copy?.trim() || 'なし';
  const forbidden = settings.detail.forbidden?.trim() || 'なし';
  const trigger = settings.detail.trigger?.trim() || 'なし';
  const tone = settings.style.tone?.trim() || '自然';
  const viewpoint = settings.style.viewpoint || '三人称';
  const tempo = settings.style.tempo || '自然';
  const length = settings.style.length || '自動';
  const recentConversation = formatConversationHistory();
  const loreSection = formatSettingList(settings.loreEntries);
  const currentInput = userInput || 'なし';

  return [
    'あなたはブラウザー内で動作する物語生成 LLM です。',
    '以下の設定と直前の会話を踏まえて、続きの物語を日本語で生成してください。',
    '出力は必ず JSON のみ。説明、箇条書き、前置き、コードフェンスは不要です。',
    '形式は次の通りです。',
    '{"narration":"本文","next_beat":"次の展開","lore_hits":["発動した裏設定"],"dialogue_hint":"次に話すべき相手の要点"}',
    `- 文体: ${tone}`,
    `- 視点: ${viewpoint}`,
    `- テンポ: ${tempo}`,
    `- 応答長: ${length}`,
    '',
    '【物語設定】',
    `テーマ: ${theme}`,
    `章: ${state.chapter}`,
    `シーン: ${state.scene}`,
    `主人公: ${protagonist}`,
    `相手役: ${counterpart}`,
    `タイトル: ${plot.title}`,
    `概要: ${plot.premise}`,
    '',
    '【キャラクター】',
    settings.characters
      .map((character, index) => {
        const label = index + 1;
        return `${label}. ${character.name || `キャラクター ${label}`}\n   - 性格: ${character.personality || 'なし'}\n   - 口調: ${character.voice || 'なし'}\n   - 関係性: ${character.relation || 'なし'}`;
      })
      .join('\n'),
    '',
    '【裏設定】',
    loreSection || 'なし',
    '',
    '【開始条件】',
    `開始文: ${opening}`,
    `開始時の状況: ${situation}`,
    `導入の方向性: ${settings.intro.direction || '会話から始める'}`,
    '',
    '【紹介】',
    `公開タイトル: ${summaryTitle}`,
    `短い紹介文: ${summaryDescription}`,
    `タグ: ${summaryTags}`,
    `一言コピー: ${summaryCopy}`,
    '',
    '【制御】',
    `禁止事項: ${forbidden}`,
    `発動条件: ${trigger}`,
    `自動補正: ${settings.detail.autocorrect ? '有効' : '無効'}`,
    `保存設定: ${settings.detail.save ? '保存する' : '保存しない'}`,
    '',
    '【直近の会話】',
    recentConversation,
    '',
    '【今回の入力】',
    currentInput,
    '',
    'この入力を受けて、上記 JSON を返してください。',
  ].join('\n');
}

function syncFormState() {
  const storySettings = {
    characters: characterNameInputs.map((nameInput, index) => ({
      name: nameInput?.value.trim() || `Character ${index + 1}`,
      personality: characterPersonalityInputs[index]?.value.trim() || '',
      voice: characterVoiceInputs[index]?.value.trim() || '',
      relation: characterRelationInputs[index]?.value.trim() || '',
    })),
    loreEntries: loreKeywordInputs.map((keywordInput, index) => ({
      keyword: keywordInput?.value.trim() || '',
      description: loreDescriptionInputs[index]?.value.trim() || '',
      trigger: loreTriggerInputs[index]?.value.trim() || '',
      shared: Boolean(loreSharedInputs[index]?.checked),
    })),
    style: {
      tone: styleToneInput?.value.trim() || '',
      viewpoint: styleViewpointInput?.value || '三人称',
      tempo: styleTempoInput?.value || '自然',
      length: styleLengthInput?.value || '自動',
    },
    intro: {
      opening: introOpeningInput?.value || '',
      situation: introSituationInput?.value || '',
      firstCharacter: introFirstCharacterInput?.value.trim() || '',
      direction: introDirectionInput?.value || '会話から始める',
    },
    summary: {
      title: summaryTitleInput?.value.trim() || '',
      description: summaryDescriptionInput?.value || '',
      tags: summaryTagsInput?.value.trim() || '',
      copy: summaryCopyInput?.value.trim() || '',
    },
    detail: {
      forbidden: detailForbiddenInput?.value || '',
      autocorrect: Boolean(detailAutocorrectInput?.checked),
      trigger: detailTriggerInput?.value.trim() || '',
      save: Boolean(detailSaveInput?.checked),
    },
  };

  state.storySettings = storySettings;
  saveState();
  renderPromptPreview();
}

function renderFormState() {
  const settings = state.storySettings || createDefaultStorySettings();
  settings.characters.forEach((character, index) => {
    if (characterNameInputs[index]) characterNameInputs[index].value = character.name;
    if (characterPersonalityInputs[index]) characterPersonalityInputs[index].value = character.personality;
    if (characterVoiceInputs[index]) characterVoiceInputs[index].value = character.voice;
    if (characterRelationInputs[index]) characterRelationInputs[index].value = character.relation;
  });
  settings.loreEntries.forEach((entry, index) => {
    if (loreKeywordInputs[index]) loreKeywordInputs[index].value = entry.keyword;
    if (loreDescriptionInputs[index]) loreDescriptionInputs[index].value = entry.description;
    if (loreTriggerInputs[index]) loreTriggerInputs[index].value = entry.trigger;
    if (loreSharedInputs[index]) loreSharedInputs[index].checked = entry.shared;
  });

  if (styleToneInput) styleToneInput.value = settings.style.tone;
  if (styleViewpointInput) styleViewpointInput.value = settings.style.viewpoint;
  if (styleTempoInput) styleTempoInput.value = settings.style.tempo;
  if (styleLengthInput) styleLengthInput.value = settings.style.length;

  if (introOpeningInput) introOpeningInput.value = settings.intro.opening;
  if (introSituationInput) introSituationInput.value = settings.intro.situation;
  if (introFirstCharacterInput) introFirstCharacterInput.value = settings.intro.firstCharacter;
  if (introDirectionInput) introDirectionInput.value = settings.intro.direction;

  if (summaryTitleInput) summaryTitleInput.value = settings.summary.title;
  if (summaryDescriptionInput) summaryDescriptionInput.value = settings.summary.description;
  if (summaryTagsInput) summaryTagsInput.value = settings.summary.tags;
  if (summaryCopyInput) summaryCopyInput.value = settings.summary.copy;

  if (detailForbiddenInput) detailForbiddenInput.value = settings.detail.forbidden;
  if (detailAutocorrectInput) detailAutocorrectInput.checked = settings.detail.autocorrect;
  if (detailTriggerInput) detailTriggerInput.value = settings.detail.trigger;
  if (detailSaveInput) detailSaveInput.checked = settings.detail.save;

  renderPromptPreview();
}

function getSpeakerName(kind) {
  const settings = state.storySettings || createDefaultStorySettings();
  const protagonist = settings.characters[0]?.name?.trim() || 'You';
  const counterpart = settings.characters[1]?.name?.trim() || 'Story';
  return kind === 'user' ? protagonist : counterpart;
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
  statusBadge.textContent = state.plot?.currentBeat ? `beat: ${state.plot.currentBeat}` : 'beat: idle';
  if (nextBeatBadge) {
    nextBeatBadge.textContent = state.plot?.nextBeat ? `next: ${state.plot.nextBeat}` : 'next: -';
  }
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

  renderPromptPreview();
}

function renderLog() {
  storyLog.innerHTML = '';

  for (const entry of state.entries) {
    const item = document.createElement('article');
    item.className = `log-item ${entry.kind}`;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = getSpeakerName(entry.kind);
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
  renderPromptPreview();
  saveState();
}

function extractGeneratedText(result) {
  if (Array.isArray(result) && result.length > 0) {
    const first = result[0];
    if (typeof first === 'string') {
      return first.trim();
    }
    if (first && typeof first === 'object') {
      const generated = first.generated_text ?? first.text ?? first.translation_text ?? '';
      if (typeof generated === 'string') {
        return generated.trim();
      }
    }
  }

  if (result && typeof result === 'object') {
    const generated = result.generated_text ?? result.text ?? result.translation_text ?? '';
    if (typeof generated === 'string') {
      return generated.trim();
    }
  }

  return typeof result === 'string' ? result.trim() : String(result ?? '').trim();
}

function cleanGeneratedStory(prompt, generatedText) {
  const trimmedPrompt = prompt.trim();
  let text = generatedText.trim();

  if (trimmedPrompt && text.startsWith(trimmedPrompt)) {
    text = text.slice(trimmedPrompt.length).trim();
  }

  if (text.startsWith('【今回の入力】')) {
    const splitIndex = text.indexOf('\n');
    text = splitIndex >= 0 ? text.slice(splitIndex + 1).trim() : text;
  }

  return text.replace(/^[:：\-\s]+/, '').trim();
}

function parseStoryGeneration(prompt, generatedText) {
  const cleaned = cleanGeneratedStory(prompt, generatedText);
  const unwrapped = cleaned
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(unwrapped);
    if (parsed && typeof parsed === 'object') {
      return {
        narration: typeof parsed.narration === 'string' && parsed.narration.trim() ? parsed.narration.trim() : '',
        nextBeat: typeof parsed.next_beat === 'string' && parsed.next_beat.trim() ? parsed.next_beat.trim() : '',
        loreHits: Array.isArray(parsed.lore_hits)
          ? parsed.lore_hits.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
          : [],
        dialogueHint: typeof parsed.dialogue_hint === 'string' && parsed.dialogue_hint.trim() ? parsed.dialogue_hint.trim() : '',
        raw: unwrapped,
      };
    }
  } catch {
    // Fall back to plain text below.
  }

  return {
    narration: unwrapped,
    nextBeat: '',
    loreHits: [],
    dialogueHint: '',
    raw: unwrapped,
  };
}

async function generateStoryResponse(input) {
  const prompt = buildStoryPrompt(input);
  renderPromptPreview();
  setLlmStatus('llm: generating...');

  try {
    await ensureStoryModelReady();
    const result = await postStoryMessage({
      type: 'generate',
      prompt,
      maxNewTokens: 220,
    });
    const generated = parseStoryGeneration(prompt, extractGeneratedText(result.generatedText));
    const storyText = generated.narration || generated.raw || '……';
    const plot = state.plot || createPlot(state.theme);
    plot.currentBeat = '進行';
    plot.nextBeat = generated.nextBeat || '未定';
    state.plot = plot;
    addLog(storyText, 'story');
    if (generated.nextBeat) {
      addLog(`次の展開: ${generated.nextBeat}`, 'story');
    }
    if (generated.dialogueHint) {
      addLog(`次の指針: ${generated.dialogueHint}`, 'story');
    }
    renderHeader();
    renderPromptPreview();
    setLlmStatus(`llm: ready ${storyReadyModel || 'browser'}`);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '物語の生成に失敗しました。';
    console.error('[lingo] Story generation failed:', error);
    setLlmStatus('llm: error');
    addLog(`物語の生成に失敗しました。${message}`, 'story');
  }
}

async function addLine() {
  const text = lineInput.value.trim();
  if (!text) {
    return;
  }

  state.lines.push(text);
  addLog(text, 'user');
  lineInput.value = '';
  await generateStoryResponse(text);
  saveState();
}

function nextScene() {
  state.scene += 1;
  if (state.scene > 3) {
    state.chapter += 1;
    state.scene = 1;
  }
  state.plot.currentBeat = '展開';
  state.plot.nextBeat = '未定';
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
  state.plot.nextBeat = '未定';
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

addLineBtn.addEventListener('click', () => {
  void addLine();
});
nextSceneBtn.addEventListener('click', nextScene);
resetBtn.addEventListener('click', resetStory);
plotResetBtn.addEventListener('click', regeneratePlot);

[
  ...characterNameInputs,
  ...characterPersonalityInputs,
  ...characterVoiceInputs,
  ...characterRelationInputs,
  ...loreKeywordInputs,
  ...loreDescriptionInputs,
  ...loreTriggerInputs,
  ...loreSharedInputs,
  styleToneInput,
  styleViewpointInput,
  styleTempoInput,
  styleLengthInput,
  introOpeningInput,
  introSituationInput,
  introFirstCharacterInput,
  introDirectionInput,
  summaryTitleInput,
  summaryDescriptionInput,
  summaryTagsInput,
  summaryCopyInput,
  detailForbiddenInput,
  detailAutocorrectInput,
  detailTriggerInput,
  detailSaveInput,
]
  .filter(Boolean)
  .forEach((element) => {
    element.addEventListener(element.type === 'checkbox' || element.tagName === 'SELECT' ? 'change' : 'input', () => {
      syncFormState();
      renderLog();
    });
  });

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
renderFormState();
setActiveTab(state.activeTab);
if (state.entries.length === 0) {
  addLog('このページは翻訳モードとは別の URL です。', 'story');
  addLog('会話を積み重ねて物語を進めます。', 'story');
} else {
  renderLog();
}
renderPromptPreview();
void ensureStoryModelReady();
saveState();
