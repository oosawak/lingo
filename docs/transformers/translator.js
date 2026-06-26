import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

env.allowRemoteModels = true;
env.allowLocalModels = false;

const PIPELINE_OPTIONS = {
  dtype: 'q8',
};

const MODEL_ID = 'Xenova/nllb-200-distilled-600M';
const LANGUAGE_CODES = {
  ja: 'jpn_Jpan',
  en: 'eng_Latn',
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

  const translator = await pipeline('translation', MODEL_ID, PIPELINE_OPTIONS);
  pipelineCache.set(key, translator);
  return translator;
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
    src_lang: LANGUAGE_CODES[src],
    tgt_lang: LANGUAGE_CODES[dst],
  });

  return extractTranslation(result);
}
