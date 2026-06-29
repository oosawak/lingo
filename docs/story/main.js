const storyLog = document.getElementById('story-log');
const chapterLabel = document.getElementById('chapter-label');
const sceneLabel = document.getElementById('scene-label');
const lineInput = document.getElementById('line-input');
const statusBadge = document.getElementById('status-badge');
const nextBeatBadge = document.getElementById('next-beat-badge');
const llmStatusBadge = document.getElementById('llm-status-badge');
const storyLoading = document.getElementById('story-loading');
const storyLoadingTitle = document.getElementById('story-loading-title');
const storyLoadingText = document.getElementById('story-loading-text');
const storyResultTitle = document.getElementById('story-result-title');
const storyResultNarration = document.getElementById('story-result-narration');
const storyResultNextBeat = document.getElementById('story-result-next-beat');
const storyResultLoreHits = document.getElementById('story-result-lore-hits');
const storyResultDialogueHint = document.getElementById('story-result-dialogue-hint');
const storyResultRaw = document.getElementById('story-result-raw');
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
const characterImageInputs = [
  document.getElementById('character-0-image'),
  document.getElementById('character-1-image'),
];
const loreKeywordInputs = [
  document.getElementById('lore-0-keyword'),
  document.getElementById('lore-1-keyword'),
  document.getElementById('lore-2-keyword'),
];
const loreDescriptionInputs = [
  document.getElementById('lore-0-description'),
  document.getElementById('lore-1-description'),
  document.getElementById('lore-2-description'),
];
const loreTriggerInputs = [
  document.getElementById('lore-0-trigger'),
  document.getElementById('lore-1-trigger'),
  document.getElementById('lore-2-trigger'),
];
const loreSharedInputs = [
  document.getElementById('lore-0-shared'),
  document.getElementById('lore-1-shared'),
  document.getElementById('lore-2-shared'),
];
const loreFreeTitleInput = document.getElementById('lore-free-title');
const loreFreeTextInput = document.getElementById('lore-free-text');
const styleToneInput = document.getElementById('style-tone');
const styleViewpointInput = document.getElementById('style-viewpoint');
const styleTempoInput = document.getElementById('style-tempo');
const styleLengthInput = document.getElementById('style-length');
const introOpeningInput = document.getElementById('intro-opening');
const introSituationInput = document.getElementById('intro-situation');
const introFirstCharacterInput = document.getElementById('intro-first-character');
const introDirectionInput = document.getElementById('intro-direction');
const endingSummaryInput = document.getElementById('ending-summary');
const endingStateInput = document.getElementById('ending-state');
const endingLineInput = document.getElementById('ending-line');
const summaryTitleInput = document.getElementById('summary-title');
const summaryDescriptionInput = document.getElementById('summary-description');
const summaryTagsInput = document.getElementById('summary-tags');
const summaryCopyInput = document.getElementById('summary-copy');
const flowTitleInput = document.getElementById('flow-title');
const flowDescriptionInput = document.getElementById('flow-description');
const flowShowCharactersInput = document.getElementById('flow-show-characters');
const flowShowImagesInput = document.getElementById('flow-show-images');
const detailForbiddenInput = document.getElementById('detail-forbidden');
const detailAutocorrectInput = document.getElementById('detail-autocorrect');
const detailTriggerInput = document.getElementById('detail-trigger');
const detailSaveInput = document.getElementById('detail-save');
const tabButtons = [...document.querySelectorAll('[data-story-tab]')];
const tabPanels = [...document.querySelectorAll('[data-story-panel]')];
const STORY_TABS = new Set(tabButtons.map((button) => button.dataset.storyTab).filter(Boolean));

const STORAGE_KEY = 'lingo.story.state';
const STORY_MODEL_CANDIDATES = [
  { modelId: 'microsoft/Phi-3-mini-4k-instruct-onnx-web', task: 'text-generation' },
  { modelId: 'Xenova/TinyLlama-1.1B-Chat-v1.0', task: 'text-generation' },
  { modelId: 'Xenova/Qwen2.5-0.5B-Instruct', task: 'text-generation' },
  { modelId: 'Xenova/mt5-small', task: 'text2text-generation' },
  { modelId: 'Xenova/flan-t5-small', task: 'text2text-generation' },
];

let storyWorker = null;
let storyInitPromise = null;
let storyRequestSeq = 0;
let storyPending = new Map();
let storyReadyModel = null;
let storyIsBusy = false;

function setStoryBusy(isBusy, title = '読み込み中', text = 'LLM を初期化しています。') {
  storyIsBusy = isBusy;

  if (storyLoading) {
    storyLoading.hidden = !isBusy;
  }
  if (storyLoadingTitle) {
    storyLoadingTitle.textContent = title;
  }
  if (storyLoadingText) {
    storyLoadingText.textContent = text;
  }
  if (lineInput) {
    lineInput.disabled = isBusy;
  }
  if (addLineBtn) {
    addLineBtn.disabled = isBusy;
  }
}

function createDefaultStorySettings() {
  return {
    characters: [
      {
        name: 'ユウ',
        personality: '落ち着いていて、状況を観察してから動く',
        voice: '短く、穏やかに話す',
        relation: '主人公',
        imageUrl: '',
      },
      {
        name: '相手',
        personality: '言葉の端々に本音がにじむ',
        voice: '少し砕けた口調',
        relation: '会話相手',
        imageUrl: '',
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
      {
        keyword: '世界の掟',
        description: '物語全体にかかる大きなルールや背景設定をまとめる。',
        trigger: '常時参照',
        shared: true,
      },
    ],
    loreFree: {
      title: '',
      text: '',
    },
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
    ending: {
      summary: '',
      state: '',
      line: '',
    },
    summary: {
      title: '',
      description: '',
      tags: '',
      copy: '',
    },
    flow: {
      title: '登場人物',
      description: '会話中に参照する人物情報をまとめる',
      showCharacters: true,
      showImages: true,
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
        imageUrl: typeof item?.imageUrl === 'string' ? item.imageUrl : fallback.imageUrl || '',
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
    loreFree: {
      title: typeof source.loreFree?.title === 'string' ? source.loreFree.title : defaults.loreFree.title,
      text: typeof source.loreFree?.text === 'string' ? source.loreFree.text : defaults.loreFree.text,
    },
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
    ending: {
      summary: typeof source.ending?.summary === 'string' ? source.ending.summary : defaults.ending.summary,
      state: typeof source.ending?.state === 'string' ? source.ending.state : defaults.ending.state,
      line: typeof source.ending?.line === 'string' ? source.ending.line : defaults.ending.line,
    },
    summary: {
      title: typeof source.summary?.title === 'string' ? source.summary.title : defaults.summary.title,
      description: typeof source.summary?.description === 'string' ? source.summary.description : defaults.summary.description,
      tags: typeof source.summary?.tags === 'string' ? source.summary.tags : defaults.summary.tags,
      copy: typeof source.summary?.copy === 'string' ? source.summary.copy : defaults.summary.copy,
    },
    flow: {
      title: typeof source.flow?.title === 'string' ? source.flow.title : defaults.flow.title,
      description: typeof source.flow?.description === 'string' ? source.flow.description : defaults.flow.description,
      showCharacters: typeof source.flow?.showCharacters === 'boolean' ? source.flow.showCharacters : defaults.flow.showCharacters,
      showImages: typeof source.flow?.showImages === 'boolean' ? source.flow.showImages : defaults.flow.showImages,
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
  const title = '失われた街';
  const description = '物語の説明をここに入力してください。';
  return {
    chapter: 1,
    scene: 1,
    pov: 'You',
    theme: title,
    description,
    lines: [],
    entries: [],
    activeTab: 'basic',
    plot: createPlot(title, description),
    storySettings: createDefaultStorySettings(),
    storyPrompt: '',
  };
}

function createPlot(title, description) {
  const plotTitle = title || '失われた街';
  const premise = description?.trim()
    ? description.trim()
    : `${plotTitle} を舞台に、会話で状況が進む物語をローカルで進行する。`;
  return {
    title: plotTitle,
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
      description: typeof parsed.description === 'string'
        ? parsed.description
        : (typeof parsed.plot?.premise === 'string' ? parsed.plot.premise : ''),
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
      storyPrompt: typeof parsed.storyPrompt === 'string' ? parsed.storyPrompt : '',
      plot: parsed.plot && typeof parsed.plot === 'object'
        ? {
            title: typeof parsed.plot.title === 'string' && parsed.plot.title.trim()
              ? parsed.plot.title.trim()
              : (typeof parsed.theme === 'string' && parsed.theme.trim() ? parsed.theme.trim() : '失われた街'),
            premise: typeof parsed.plot.premise === 'string' && parsed.plot.premise.trim()
              ? parsed.plot.premise.trim()
              : (typeof parsed.description === 'string' && parsed.description.trim()
                ? parsed.description.trim()
                : `${typeof parsed.theme === 'string' && parsed.theme.trim() ? parsed.theme.trim() : '物語'} を舞台に、会話で状況が進む。`),
            rules: Array.isArray(parsed.plot.rules) && parsed.plot.rules.length > 0
              ? parsed.plot.rules.filter((rule) => typeof rule === 'string')
              : createPlot(parsed.theme || '失われた街', parsed.description || '').rules,
            cast: Array.isArray(parsed.plot.cast) && parsed.plot.cast.length > 0
              ? parsed.plot.cast.filter((name) => typeof name === 'string')
              : createPlot(parsed.theme || '失われた街', parsed.description || '').cast,
            currentBeat: typeof parsed.plot.currentBeat === 'string' && parsed.plot.currentBeat.trim()
              ? parsed.plot.currentBeat.trim()
              : '導入',
            nextBeat: typeof parsed.plot.nextBeat === 'string' && parsed.plot.nextBeat.trim()
              ? parsed.plot.nextBeat.trim()
              : '未定',
          }
        : createPlot(
            typeof parsed.theme === 'string' && parsed.theme.trim() ? parsed.theme.trim() : '失われた街',
            typeof parsed.description === 'string' ? parsed.description : '',
          ),
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
  setStoryBusy(true, '読み込み中', 'LLM を初期化しています。');
  storyInitPromise = postStoryMessage({
    type: 'init',
    candidates: STORY_MODEL_CANDIDATES,
  })
    .then((msg) => {
      storyReadyModel = msg.modelId;
      setStoryBusy(false);
      return msg.modelId;
    })
    .catch((error) => {
      setLlmStatus('llm: unavailable');
      setStoryBusy(false);
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

  const prompt = buildStoryPrompt(state.lines[state.lines.length - 1] ?? '');
  promptPreview.value = prompt;
  state.storyPrompt = prompt;
  saveState();
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
  const title = state.theme || '失われた街';
  const description = state.description || state.plot?.premise || '';
  const plot = state.plot || createPlot(title, description);
  const opening = settings.intro.opening?.trim() || 'なし';
  const situation = settings.intro.situation?.trim() || 'なし';
  const summaryTitle = settings.summary.title?.trim() || 'なし';
  const summaryDescription = settings.summary.description?.trim() || 'なし';
  const summaryTags = settings.summary.tags?.trim() || 'なし';
  const summaryCopy = settings.summary.copy?.trim() || 'なし';
  const flowTitle = settings.flow?.title?.trim() || '登場人物';
  const flowDescription = settings.flow?.description?.trim() || 'なし';
  const flowCharacters = settings.flow?.showCharacters ? '有効' : '無効';
  const flowImages = settings.flow?.showImages ? '有効' : '無効';
  const endingSummary = settings.ending?.summary?.trim() || 'なし';
  const endingState = settings.ending?.state?.trim() || 'なし';
  const endingLine = settings.ending?.line?.trim() || 'なし';
  const loreFreeTitle = settings.loreFree?.title?.trim() || 'なし';
  const loreFreeText = settings.loreFree?.text?.trim() || 'なし';
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
    `タイトル: ${title}`,
    `説明: ${description || 'なし'}`,
    `章: ${state.chapter}`,
    `シーン: ${state.scene}`,
    `主人公: ${protagonist}`,
    `相手役: ${counterpart}`,
    `PLOTタイトル: ${plot.title}`,
    `PLOT説明: ${plot.premise}`,
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
    '【自由記述の裏設定】',
    `タイトル: ${loreFreeTitle}`,
    `本文: ${loreFreeText}`,
    '',
    '【開始条件】',
    `開始文: ${opening}`,
    `開始時の状況: ${situation}`,
    `導入の方向性: ${settings.intro.direction || '会話から始める'}`,
    '',
    '【エンディング】',
    `方向性: ${endingSummary}`,
    `最終状態: ${endingState}`,
    `締めのひと言: ${endingLine}`,
    '',
    '【紹介】',
    `公開タイトル: ${summaryTitle}`,
    `短い紹介文: ${summaryDescription}`,
    `タグ: ${summaryTags}`,
    `一言コピー: ${summaryCopy}`,
    '',
    '【FLOW】',
    `表示タイトル: ${flowTitle}`,
    `説明: ${flowDescription}`,
    `登場人物: ${flowCharacters}`,
    `画像: ${flowImages}`,
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
      imageUrl: characterImageInputs[index]?.value.trim() || '',
    })),
    loreEntries: loreKeywordInputs.map((keywordInput, index) => ({
      keyword: keywordInput?.value.trim() || '',
      description: loreDescriptionInputs[index]?.value.trim() || '',
      trigger: loreTriggerInputs[index]?.value.trim() || '',
      shared: Boolean(loreSharedInputs[index]?.checked),
    })),
    loreFree: {
      title: loreFreeTitleInput?.value.trim() || '',
      text: loreFreeTextInput?.value || '',
    },
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
    ending: {
      summary: endingSummaryInput?.value || '',
      state: endingStateInput?.value || '',
      line: endingLineInput?.value || '',
    },
    summary: {
      title: summaryTitleInput?.value.trim() || '',
      description: summaryDescriptionInput?.value || '',
      tags: summaryTagsInput?.value.trim() || '',
      copy: summaryCopyInput?.value.trim() || '',
    },
    flow: {
      title: flowTitleInput?.value.trim() || '',
      description: flowDescriptionInput?.value || '',
      showCharacters: Boolean(flowShowCharactersInput?.checked),
      showImages: Boolean(flowShowImagesInput?.checked),
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
    if (characterImageInputs[index]) characterImageInputs[index].value = character.imageUrl || '';
  });
  settings.loreEntries.forEach((entry, index) => {
    if (loreKeywordInputs[index]) loreKeywordInputs[index].value = entry.keyword;
    if (loreDescriptionInputs[index]) loreDescriptionInputs[index].value = entry.description;
    if (loreTriggerInputs[index]) loreTriggerInputs[index].value = entry.trigger;
    if (loreSharedInputs[index]) loreSharedInputs[index].checked = entry.shared;
  });
  if (loreFreeTitleInput) loreFreeTitleInput.value = settings.loreFree?.title || '';
  if (loreFreeTextInput) loreFreeTextInput.value = settings.loreFree?.text || '';

  if (styleToneInput) styleToneInput.value = settings.style.tone;
  if (styleViewpointInput) styleViewpointInput.value = settings.style.viewpoint;
  if (styleTempoInput) styleTempoInput.value = settings.style.tempo;
  if (styleLengthInput) styleLengthInput.value = settings.style.length;

  if (introOpeningInput) introOpeningInput.value = settings.intro.opening;
  if (introSituationInput) introSituationInput.value = settings.intro.situation;
  if (introFirstCharacterInput) introFirstCharacterInput.value = settings.intro.firstCharacter;
  if (introDirectionInput) introDirectionInput.value = settings.intro.direction;

  if (endingSummaryInput) endingSummaryInput.value = settings.ending?.summary || '';
  if (endingStateInput) endingStateInput.value = settings.ending?.state || '';
  if (endingLineInput) endingLineInput.value = settings.ending?.line || '';

  if (summaryTitleInput) summaryTitleInput.value = settings.summary.title;
  if (summaryDescriptionInput) summaryDescriptionInput.value = settings.summary.description;
  if (summaryTagsInput) summaryTagsInput.value = settings.summary.tags;
  if (summaryCopyInput) summaryCopyInput.value = settings.summary.copy;

  if (flowTitleInput) flowTitleInput.value = settings.flow?.title || '';
  if (flowDescriptionInput) flowDescriptionInput.value = settings.flow?.description || '';
  if (flowShowCharactersInput) flowShowCharactersInput.checked = Boolean(settings.flow?.showCharacters);
  if (flowShowImagesInput) flowShowImagesInput.checked = Boolean(settings.flow?.showImages);

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
  if (kind === 'system') {
    return 'System';
  }
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
  if (chapterLabel) {
    chapterLabel.value = state.theme || '';
  }
  if (sceneLabel) {
    sceneLabel.value = state.description || '';
  }
  statusBadge.textContent = state.plot?.currentBeat ? `beat: ${state.plot.currentBeat}` : 'beat: idle';
  if (nextBeatBadge) {
    nextBeatBadge.textContent = state.plot?.nextBeat ? `next: ${state.plot.nextBeat}` : 'next: -';
  }
}

function renderPlot() {
  const plot = state.plot || createPlot(state.theme, state.description);
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
  if (!storyLog) {
    return;
  }

  storyLog.innerHTML = '';

  for (const entry of state.entries) {
    const row = document.createElement('div');
    const side = entry.kind === 'user' ? 'right' : 'left';
    row.className = `bubble-row ${side}`;

    const bubble = document.createElement('article');
    bubble.className = `bubble ${side}`;

    const meta = document.createElement('span');
    meta.className = 'bubble-meta';
    meta.textContent = getSpeakerName(entry.kind);

    const body = document.createElement('div');
    body.textContent = entry.text;
    bubble.append(meta, body);
    row.appendChild(bubble);
    storyLog.appendChild(row);
  }

  storyLog.scrollTop = storyLog.scrollHeight;
}

function renderStoryResult(result) {
  if (storyResultTitle) {
    storyResultTitle.textContent = state.theme || '物語';
  }
  if (storyResultNarration) {
    storyResultNarration.textContent = result?.narration || result?.raw || '会話を送るとここに物語本文が出ます。';
  }
  if (storyResultNextBeat) {
    storyResultNextBeat.textContent = result?.nextBeat || '未定';
  }
  if (storyResultLoreHits) {
    storyResultLoreHits.textContent = result?.loreHits?.length ? result.loreHits.join(' / ') : '-';
  }
  if (storyResultDialogueHint) {
    storyResultDialogueHint.textContent = result?.dialogueHint || '-';
  }
  if (storyResultRaw) {
    storyResultRaw.textContent = result?.raw || '-';
  }
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
  setStoryBusy(true, '生成中', 'Story を生成しています。');

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
    renderStoryResult(generated);
    renderHeader();
    renderPromptPreview();
    setStoryBusy(false);
    setLlmStatus(`llm: ready ${storyReadyModel || 'browser'}`);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '物語の生成に失敗しました。';
    console.error('[lingo] Story generation failed:', error);
    setLlmStatus('llm: error');
    setStoryBusy(false);
    addLog(`物語の生成に失敗しました。${message}`, 'system');
    renderStoryResult({
      narration: '生成に失敗しました。',
      nextBeat: '',
      loreHits: [],
      dialogueHint: message,
      raw: '',
    });
  }
}

async function addLine() {
  if (!lineInput) {
    return;
  }

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
  const title = chapterLabel?.value.trim() || '失われた街';
  const description = sceneLabel?.value.trim() || '';
  state.chapter = 1;
  state.scene = 1;
  state.pov = 'You';
  state.theme = title;
  state.description = description;
  state.lines = [];
  state.entries = [];
  state.plot = createPlot(title, description);
  renderLog();
  addLog('物語の開始地点に戻りました。', 'story');
  renderPlot();
  renderHeader();
  saveState();
}

function regeneratePlot() {
  const title = chapterLabel?.value.trim() || state.theme || '失われた街';
  const description = sceneLabel?.value.trim() || state.description || '';
  state.theme = title;
  state.description = description;
  state.plot = createPlot(title, description);
  state.plot.currentBeat = '導入';
  state.plot.nextBeat = '未定';
  renderPlot();
  renderHeader();
  saveState();
}

chapterLabel?.addEventListener('input', () => {
  state.theme = chapterLabel.value.trim();
  if (state.plot) {
    state.plot.title = state.theme || '失われた街';
    if (!state.description?.trim()) {
      state.plot.premise = `${state.plot.title} を舞台に、会話で状況が進む物語をローカルで進行する。`;
    }
  }
  renderPlot();
  renderHeader();
  saveState();
});

sceneLabel?.addEventListener('input', () => {
  state.description = sceneLabel.value;
  if (state.plot) {
    state.plot.premise = state.description?.trim()
      ? state.description.trim()
      : `${state.theme || '失われた街'} を舞台に、会話で状況が進む物語をローカルで進行する。`;
  }
  renderPlot();
  renderHeader();
  saveState();
});

addLineBtn?.addEventListener('click', () => {
  void addLine();
});
nextSceneBtn?.addEventListener('click', nextScene);
resetBtn?.addEventListener('click', resetStory);
plotResetBtn?.addEventListener('click', regeneratePlot);

[
  ...characterNameInputs,
  ...characterPersonalityInputs,
  ...characterVoiceInputs,
  ...characterRelationInputs,
  ...characterImageInputs,
  ...loreKeywordInputs,
  ...loreDescriptionInputs,
  ...loreTriggerInputs,
  ...loreSharedInputs,
  loreFreeTitleInput,
  loreFreeTextInput,
  styleToneInput,
  styleViewpointInput,
  styleTempoInput,
  styleLengthInput,
  introOpeningInput,
  introSituationInput,
  introFirstCharacterInput,
  introDirectionInput,
  endingSummaryInput,
  endingStateInput,
  endingLineInput,
  summaryTitleInput,
  summaryDescriptionInput,
  summaryTagsInput,
  summaryCopyInput,
  flowTitleInput,
  flowDescriptionInput,
  flowShowCharactersInput,
  flowShowImagesInput,
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

lineInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    void addLine();
  }
});

renderPlot();
renderHeader();
renderFormState();
setActiveTab(state.activeTab);
if (state.entries.length === 0) {
  addLog('このページは翻訳モードとは別の URL です。', 'system');
  addLog('会話を積み重ねて物語を進めます。', 'system');
} else {
  renderLog();
}
renderStoryResult();
renderPromptPreview();
setStoryBusy(false);
void ensureStoryModelReady();
saveState();
