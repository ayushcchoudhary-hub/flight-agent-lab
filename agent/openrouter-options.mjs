export const OPENROUTER_CONFIGS = [
  { id: 'or-terra-medium', model: 'openai/gpt-5.6-terra', effort: 'medium', label: 'Terra medium', family: 'proprietary control' },
  { id: 'or-deepseek-flash-low', model: 'deepseek/deepseek-v4.1-flash', effort: 'low', label: 'DeepSeek V4.1 Flash low', family: 'open weight' },
  { id: 'or-deepseek-flash-high', model: 'deepseek/deepseek-v4.1-flash', effort: 'high', label: 'DeepSeek V4.1 Flash high', family: 'open weight' },
  { id: 'or-mistral-small-none', model: 'mistralai/mistral-small-2603', effort: 'none', label: 'Mistral Small 4 none', family: 'open weight' },
  { id: 'or-mistral-small-high', model: 'mistralai/mistral-small-2603', effort: 'high', label: 'Mistral Small 4 high', family: 'open weight' },
  { id: 'or-qwen-35b-default', model: 'qwen/qwen3.6-35b-a3b', effort: null, label: 'Qwen3.6 35B A3B default', family: 'open weight' },
  { id: 'or-glm-flash-low', model: 'z-ai/glm-5.3-flash', effort: 'low', label: 'GLM 5.3 Flash low', family: 'open weight' },
  { id: 'or-glm-flash-high', model: 'z-ai/glm-5.3-flash', effort: 'high', label: 'GLM 5.3 Flash high', family: 'open weight' },
  { id: 'or-glm-full-low', model: 'z-ai/glm-5.3', effort: 'low', label: 'GLM 5.3 low', family: 'open weight' },
  { id: 'or-glm-full-high', model: 'z-ai/glm-5.3', effort: 'high', label: 'GLM 5.3 high', family: 'open weight' },
];

export const OPENROUTER_SMOKE_CASES = ['R1', 'M2', 'F1', 'U1'];

export function validateCatalog(configs, catalog) {
  const byId = new Map(catalog.map(model => [model.id, model]));
  return configs.map(config => {
    const entry = byId.get(config.model);
    if (!entry) throw new Error(`OpenRouter catalog does not list ${config.model}.`);
    if (!entry.hugging_face_id && config.family === 'open weight') throw new Error(`${config.model} is not identified as open weight.`);
    for (const parameter of ['tools', 'tool_choice']) if (!entry.supported_parameters?.includes(parameter)) throw new Error(`${config.model} does not support ${parameter}.`);
    const supported = entry.reasoning?.supported_efforts;
    if (config.effort && supported?.length && !supported.includes(config.effort)) throw new Error(`${config.model} does not support ${config.effort} effort.`);
    if (config.effort && !entry.supported_parameters?.includes('reasoning_effort')) throw new Error(`${config.model} does not expose reasoning effort.`);
    return { ...config, canonicalModel: entry.canonical_slug, huggingFaceId: entry.hugging_face_id, pricing: entry.pricing, supportedEfforts: supported ?? [] };
  });
}

export function priceRates(configs) {
  const models = {};
  for (const config of configs) {
    const price = config.pricing;
    models[config.model] = {
      input: Number(price.prompt) * 1e6,
      cached: Number(price.input_cache_read ?? price.prompt) * 1e6,
      output: Number(price.completion) * 1e6,
    };
  }
  return { source: 'https://openrouter.ai/api/v1/models', checkedAt: new Date().toISOString(), tier: 'OpenRouter routed provider, fallbacks disabled', models };
}

function maximumPrice(price, field) {
  return Math.max(Number(price[field] ?? 0), ...(price.overrides ?? []).map(item => Number(item[field] ?? 0)));
}

export function requestCostUpperBound(config, inputCharacters, maxOutputTokens) {
  const price = config.pricing;
  // One Unicode code point cannot require more tokens than UTF-16 characters in
  // this bounded English/JSON workload. Using characters as tokens is therefore
  // intentionally conservative compared with the usual chars-to-tokens ratio.
  return inputCharacters * maximumPrice(price, 'prompt') + maxOutputTokens * maximumPrice(price, 'completion');
}
