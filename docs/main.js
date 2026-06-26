const chatLog = document.getElementById('chat-log');
const messageInput = document.getElementById('message-input');
const fromSelect = document.getElementById('lang-from');
const toSelect = document.getElementById('lang-to');
const engineSelect = document.getElementById('engine-select');
const translateBtn = document.getElementById('translate-btn');
const engineStatus = document.getElementById('engine-status');
const wasmStatus = document.getElementById('wasm-status');
const loadWasmBtn = document.getElementById('load-wasm-btn');

let wasmModule = null;
let transformersModule = null;

const ENGINE_STORAGE_KEY = 'lingo.translation.engine';
const ENGINE_QUERY_KEY = 'engine';
const DEFAULT_ENGINE = 'transformers';

function resolveInitialEngine() {
  const query = new URLSearchParams(window.location.search);
  const fromQuery = query.get(ENGINE_QUERY_KEY);
  if (fromQuery === 'wasm' || fromQuery === 'transformers' || fromQuery === 'auto') {
    return fromQuery;
  }

  const saved = window.localStorage.getItem(ENGINE_STORAGE_KEY);
  if (saved === 'wasm' || saved === 'transformers' || saved === 'auto') {
    return saved;
  }

  return DEFAULT_ENGINE;
}

function setEngineStatus(engine, detail = '') {
  engineStatus.textContent = detail ? `engine: ${engine} (${detail})` : `engine: ${engine}`;
}

function langLabel(code) {
  return code === 'ja' ? '日本語' : 'English';
}

function addBubble(text, side, label) {
  const row = document.createElement('div');
  row.className = `bubble-row ${side}`;

  const bubble = document.createElement('div');
  bubble.className = `bubble ${side}`;

  const meta = document.createElement('span');
  meta.className = 'bubble-meta';
  meta.textContent = label;

  const body = document.createElement('div');
  body.textContent = text;

  bubble.append(meta, body);
  row.appendChild(bubble);
  chatLog.appendChild(row);
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function loadWasm() {
  if (wasmModule) {
    wasmStatus.textContent = 'WASM: ready';
    return wasmModule;
  }

  wasmStatus.textContent = 'WASM: loading...';
  try {
    const mod = await import('./wasm/lingo_wasm.js');
    if (typeof mod.default === 'function') {
      await mod.default();
    }
    wasmModule = mod;
    wasmStatus.textContent = 'WASM: ready';
    return wasmModule;
  } catch (error) {
    console.error('[lingo] WASM module load failed:', error);
    wasmStatus.textContent = 'WASM: unavailable';
    throw error;
  }
}

async function loadTransformers() {
  if (transformersModule) {
    return transformersModule;
  }

  try {
    const mod = await import('./transformers/translator.js');
    if (typeof mod.init === 'function') {
      await mod.init();
    }
    transformersModule = mod;
    wasmStatus.textContent = 'Transformers.js: ready';
    return transformersModule;
  } catch (error) {
    console.warn('[lingo] Transformers engine is not available yet:', error);
    return null;
  }
}

async function translateWithWasm(text, from, to) {
  const mod = await loadWasm();
  if (typeof mod.translate !== 'function') {
    throw new Error('WASM translation export not found');
  }
  return await mod.translate(text, from, to);
}

async function translateWithTransformers(text, from, to) {
  const mod = await loadTransformers();
  if (typeof mod?.translate !== 'function') {
    throw new Error('Transformers.js translation export not found');
  }
  return await mod.translate(text, from, to);
}

async function translateAuto(text, from, to) {
  try {
    const transformerResult = await loadTransformers();
    if (transformerResult?.translate) {
      setEngineStatus('auto', 'transformers');
      return await transformerResult.translate(text, from, to);
    }
  } catch (error) {
    console.warn('[lingo] Auto mode fell back to WASM:', error);
  }

  setEngineStatus('auto', 'wasm');
  return await translateWithWasm(text, from, to);
}

async function translate(text, from, to) {
  const engine = engineSelect.value;
  if (engine === 'transformers') {
    setEngineStatus('transformers');
    try {
      return await translateWithTransformers(text, from, to);
    } catch (error) {
      setEngineStatus('transformers', 'fallback: wasm');
      return await translateWithWasm(text, from, to);
    }
  }

  if (engine === 'auto') {
    return await translateAuto(text, from, to);
  }

  setEngineStatus('wasm');
  return await translateWithWasm(text, from, to);
}

async function handleTranslate() {
  const text = messageInput.value.trim();
  if (!text) return;

  const from = fromSelect.value;
  const to = toSelect.value;

  addBubble(text, 'right', `You · ${langLabel(from)}`);
  messageInput.value = '';

  try {
    const translated = await translate(text, from, to);
    addBubble(translated, 'left', `WASM · ${langLabel(to)}`);
  } catch (error) {
    addBubble('WASM の読み込みに失敗しました。', 'left', 'System');
    console.error(error);
  }
}

translateBtn.addEventListener('click', handleTranslate);
loadWasmBtn.addEventListener('click', () => {
  void loadTransformers().catch(() => {});
});

messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    void handleTranslate();
  }
});

engineSelect.addEventListener('change', () => {
  window.localStorage.setItem(ENGINE_STORAGE_KEY, engineSelect.value);
  setEngineStatus(engineSelect.value);
});

fromSelect.addEventListener('change', () => {
  if (fromSelect.value === toSelect.value) {
    toSelect.value = fromSelect.value === 'ja' ? 'en' : 'ja';
  }
});

toSelect.addEventListener('change', () => {
  if (fromSelect.value === toSelect.value) {
    fromSelect.value = toSelect.value === 'ja' ? 'en' : 'ja';
  }
});

engineSelect.value = resolveInitialEngine();
setEngineStatus(engineSelect.value);
addBubble('ここが lingo の公開ページです。', 'left', 'System');
addBubble('既定エンジンは Transformers.js です。', 'left', 'System');

void loadWasm().catch(() => {});
void loadTransformers().catch(() => {});
