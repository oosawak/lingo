import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

env.allowRemoteModels = true;
env.allowLocalModels = false;

const PIPELINE_OPTIONS = {
  dtype: 'q8',
};

const MODEL_CANDIDATES = {
  'ja|en': [
    'Xenova/opus-mt-ja-en',
  ],
  'en|ja': [
    'Xenova/opus-mt-en-ja',
  ],
};

const pipelineCache = new Map();

export async function init() {
  return true;
}

function normalizeLang(code) {
  return code === 'ja' ? 'ja' : code === 'en' ? 'en' : 'unknown';
}

function cacheKey(from, to) {
  return `${from}|${to}`;
}

async function loadTranslator(from, to) {
  const key = cacheKey(from, to);
  if (pipelineCache.has(key)) {
    return pipelineCache.get(key);
  }

  const candidates = MODEL_CANDIDATES[key] ?? [];
  let lastError = null;

  for (const modelId of candidates) {
    try {
      const translator = await pipeline('translation', modelId, PIPELINE_OPTIONS);
      pipelineCache.set(key, translator);
      return translator;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error(`No translation model available for ${key}`);
}

function extractTranslation(result) {
  if (Array.isArray(result) && result.length > 0) {
    const first = result[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') {
      return first.translation_text ?? first.generated_text ?? JSON.stringify(first);
    }
  }

  if (typeof result === 'string') {
    return result;
  }

  if (result && typeof result === 'object') {
    return result.translation_text ?? result.generated_text ?? JSON.stringify(result);
  }

  return String(result);
}

export async function translate(text, from, to) {
  const src = normalizeLang(from);
  const dst = normalizeLang(to);

  if (src === dst || src === 'unknown' || dst === 'unknown') {
    return text;
  }

  const translator = await loadTranslator(src, dst);
  const result = await translator(text, {
    src_lang: src,
    tgt_lang: dst,
  });

  return extractTranslation(result);
}
