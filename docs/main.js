const chatLog = document.getElementById('chat-log');
const messageInput = document.getElementById('message-input');
const fromSelect = document.getElementById('lang-from');
const toSelect = document.getElementById('lang-to');
const translateBtn = document.getElementById('translate-btn');
const wasmStatus = document.getElementById('wasm-status');
const loadWasmBtn = document.getElementById('load-wasm-btn');

let wasmModule = null;

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
    console.warn('[lingo] WASM module is not available yet:', error);
    wasmStatus.textContent = 'WASM: fallback';
    return null;
  }
}

async function translate(text, from, to) {
  const mod = await loadWasm();
  if (mod?.translate) {
    return await mod.translate(text, from, to);
  }
  return `[${langLabel(from)} -> ${langLabel(to)}] ${text}`;
}

async function handleTranslate() {
  const text = messageInput.value.trim();
  if (!text) return;

  const from = fromSelect.value;
  const to = toSelect.value;

  addBubble(text, 'right', `You · ${langLabel(from)}`);
  messageInput.value = '';

  const translated = await translate(text, from, to);
  addBubble(translated, 'left', `WASM · ${langLabel(to)}`);
}

translateBtn.addEventListener('click', handleTranslate);
loadWasmBtn.addEventListener('click', () => {
  void loadWasm();
});

messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    void handleTranslate();
  }
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

addBubble('ここが lingo の公開ページです。', 'left', 'System');
addBubble('WASM が入ると、翻訳ロジックを Rust 側へ移せます。', 'left', 'System');
