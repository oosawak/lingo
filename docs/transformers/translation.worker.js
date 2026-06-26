import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

env.allowRemoteModels = true;
env.allowLocalModels = false;

let translator = null;
let translatorModelId = null;

self.onmessage = async (event) => {
  const msg = event.data;

  switch (msg.type) {
    case 'init': {
      try {
        const startTime = performance.now();
        translator = await pipeline('translation', msg.modelId, {
          dtype: 'fp32',
          device: 'wasm',
        });
        translatorModelId = msg.modelId;

        self.postMessage({
          type: 'ready',
          requestId: msg.requestId,
          loadTimeMs: performance.now() - startTime,
          modelId: msg.modelId,
        });
      } catch (error) {
        self.postMessage({
          type: 'error',
          requestId: msg.requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      break;
    }

    case 'translate': {
      if (!translator) {
        self.postMessage({
          type: 'error',
          requestId: msg.requestId,
          error: 'Translator is not initialized',
        });
        break;
      }

      try {
        const translateOptions = translatorModelId === 'Xenova/nllb-200-distilled-600M'
          ? {
              src_lang: msg.srcLang,
              tgt_lang: msg.tgtLang,
            }
          : {};

        const result = await translator(msg.text, {
          ...translateOptions,
          max_length: 512,
        });

        self.postMessage({
          type: 'result',
          requestId: msg.requestId,
          translatedText: result?.[0]?.translation_text ?? '',
        });
      } catch (error) {
        self.postMessage({
          type: 'error',
          requestId: msg.requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      break;
    }
  }
};
