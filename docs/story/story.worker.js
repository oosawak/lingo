import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

env.allowRemoteModels = true;
env.allowLocalModels = false;

const PIPELINE_OPTIONS = {
  dtype: 'q8',
  device: 'wasm',
};

const DEFAULT_CANDIDATES = [
  { modelId: 'Xenova/Phi-3-mini-4k-instruct', task: 'text-generation' },
  { modelId: 'Xenova/TinyLlama-1.1B-Chat-v1.0', task: 'text-generation' },
  { modelId: 'Xenova/Qwen2.5-0.5B-Instruct', task: 'text-generation' },
  { modelId: 'Xenova/mt5-small', task: 'text2text-generation' },
  { modelId: 'Xenova/flan-t5-small', task: 'text2text-generation' },
];

let generator = null;
let generatorModelId = null;

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

self.onmessage = async (event) => {
  const msg = event.data;

  switch (msg.type) {
    case 'init': {
      if (generator) {
        self.postMessage({
          type: 'ready',
          requestId: msg.requestId,
          modelId: generatorModelId,
        });
        break;
      }

      const candidates = Array.isArray(msg.candidates) && msg.candidates.length > 0
        ? msg.candidates
        : DEFAULT_CANDIDATES;
      let lastError = null;

      for (const candidate of candidates) {
        try {
          const startTime = performance.now();
          generator = await pipeline(candidate.task, candidate.modelId, PIPELINE_OPTIONS);
          generatorModelId = candidate.modelId;
          self.postMessage({
            type: 'ready',
            requestId: msg.requestId,
            loadTimeMs: performance.now() - startTime,
            modelId: candidate.modelId,
            task: candidate.task,
          });
          break;
        } catch (error) {
          lastError = error;
          generator = null;
          generatorModelId = null;
        }
      }

      if (!generator) {
        self.postMessage({
          type: 'error',
          requestId: msg.requestId,
          error: lastError instanceof Error ? lastError.message : String(lastError || 'No story model available'),
        });
      }
      break;
    }

    case 'generate': {
      if (!generator) {
        self.postMessage({
          type: 'error',
          requestId: msg.requestId,
          error: 'Story model is not initialized',
        });
        break;
      }

      try {
        const result = await generator(msg.prompt, {
          max_new_tokens: msg.maxNewTokens ?? 220,
          do_sample: true,
          temperature: 0.85,
          top_p: 0.9,
          repetition_penalty: 1.08,
          return_full_text: false,
        });

        self.postMessage({
          type: 'result',
          requestId: msg.requestId,
          generatedText: extractGeneratedText(result),
          modelId: generatorModelId,
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
