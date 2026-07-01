import { createStoryListItem, getStoryCatalog, setActiveStory } from './catalog.js';

const feed = document.getElementById('story-list-feed');
const talkEngineButtons = [...document.querySelectorAll('[data-talk-engine]')];
const talkOllamaBaseUrlInput = document.getElementById('talk-ollama-base-url');
const talkOllamaSaveBtn = document.getElementById('talk-ollama-save');
const talkOllamaModelSelect = document.getElementById('talk-ollama-model');
const target = document.body.dataset.listTarget === 'story' ? 'story' : 'talk';
const targetLabel = target === 'story' ? 'STORYへ進む' : 'TALKへ進む';
const targetFile = target === 'story' ? 'story.html' : 'talk.html';
const ENGINE_STORAGE_KEY = 'lingo.story.talk.engine';
const OLLAMA_BASE_URL_STORAGE_KEY = 'lingo.story.talk.ollama.baseUrl';
const OLLAMA_MODEL_STORAGE_KEY = 'lingo.story.talk.ollama.model';
const OLLAMA_MODEL_CANDIDATES = [
  'phi4:latest',
  'qwen2.5:7b',
  'fuukeidaisuki/nvidia-nemotron-nano-9b-v2-japanese:latest',
  'gemma4:e2b',
  'llama3.2:latest',
];
let ollamaAvailableModels = [];

function loadEnginePreference() {
  try {
    const raw = window.localStorage.getItem(ENGINE_STORAGE_KEY);
    return raw === 'worker' || raw === 'builtin' ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

function saveEnginePreference(preference) {
  window.localStorage.setItem(ENGINE_STORAGE_KEY, preference);
}

function loadTalkOllamaBaseUrl() {
  try {
    const raw = window.localStorage.getItem(OLLAMA_BASE_URL_STORAGE_KEY);
    return typeof raw === 'string' && raw.trim() ? raw.trim().replace(/\/+$/, '') : 'http://localhost:11434';
  } catch {
    return 'http://localhost:11434';
  }
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
      ? payload.models.map((item) => String(item?.name || item?.model || item?.model_id || item?.modelId || '').trim()).filter(Boolean)
      : [];

    ollamaAvailableModels = Array.from(new Set(models));
  } catch (error) {
    console.warn('[lingo] Ollama model list load failed:', error);
    ollamaAvailableModels = [];
  } finally {
    window.clearTimeout(timeoutId);
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
  const available = ollamaAvailableModels;
  const currentValue = available.includes(preferred)
    ? preferred
    : OLLAMA_MODEL_CANDIDATES.find((modelName) => available.includes(modelName)) || '';

  talkOllamaModelSelect.innerHTML = '';

  if (available.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Ollama に接続できません';
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

function syncEngineButtons() {
  const preference = loadEnginePreference();

  for (const button of talkEngineButtons) {
    const isActive = button.dataset.talkEngine === preference;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  }
}

function renderList() {
  if (!feed) {
    return;
  }

  feed.innerHTML = '';

  for (const story of getStoryCatalog()) {
    feed.appendChild(createStoryListItem(story, {
      actionLabel: targetLabel,
      onPick: (pickedStory) => {
        setActiveStory(pickedStory);
        window.location.href = targetFile;
      },
    }));
  }
}

for (const button of talkEngineButtons) {
  button.addEventListener('click', () => {
    const preference = button.dataset.talkEngine || 'auto';
    saveEnginePreference(preference);
    syncEngineButtons();
  });
}

talkOllamaSaveBtn?.addEventListener('click', () => {
  if (!talkOllamaBaseUrlInput) {
    return;
  }

  window.localStorage.setItem(OLLAMA_BASE_URL_STORAGE_KEY, String(talkOllamaBaseUrlInput.value ?? '').trim().replace(/\/+$/, '') || 'http://localhost:11434');
  void loadTalkOllamaAvailableModels();
});

talkOllamaModelSelect?.addEventListener('change', () => {
  saveTalkOllamaModelPreference(talkOllamaModelSelect.value);
});

syncEngineButtons();
renderList();
syncTalkOllamaBaseUrlInput();
syncTalkOllamaModelSelect();
void loadTalkOllamaAvailableModels();
