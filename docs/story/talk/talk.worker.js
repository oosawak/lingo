import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

env.allowRemoteModels = true;
env.allowLocalModels = false;

const DEFAULT_CANDIDATES = [
  { modelId: 'microsoft/Phi-3-mini-4k-instruct-onnx-web', task: 'text-generation' },
  { modelId: 'Xenova/TinyLlama-1.1B-Chat-v1.0', task: 'text-generation' },
  { modelId: 'Xenova/distilgpt2', task: 'text-generation' },
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

function sanitizeGeneratedText(text) {
  return String(text ?? '')
    .replace(/<extraid_\d+>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
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
          const pipelineOptions = { device: 'wasm' };
          if (candidate.dtype) {
            pipelineOptions.dtype = candidate.dtype;
          }
          generator = await pipeline(candidate.task, candidate.modelId, pipelineOptions);
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
          error: lastError instanceof Error ? lastError.message : String(lastError || 'No talk model available'),
        });
      }
      break;
    }

    case 'generate': {
      if (!generator) {
        self.postMessage({
          type: 'error',
          requestId: msg.requestId,
          error: 'Talk model is not initialized',
        });
        break;
      }

      try {
        const result = await generator(msg.prompt, {
          max_new_tokens: msg.maxNewTokens ?? 96,
          do_sample: true,
          temperature: 0.8,
          top_p: 0.9,
          repetition_penalty: 1.06,
          return_full_text: false,
        });

        self.postMessage({
          type: 'result',
          requestId: msg.requestId,
          generatedText: sanitizeGeneratedText(extractGeneratedText(result)),
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
