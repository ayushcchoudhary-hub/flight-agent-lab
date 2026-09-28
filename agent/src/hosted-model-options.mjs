// Sonnet 5.5 is the default from 2026-09-28. On the same 52 held-out cases
// and code it passed 51 and every exact check, against Sonnet 5's 46 and
// 51, made up no values, and its median model call took 1.6 s against
// 2.8 s at about the same cost. Sonnet 5 (default from 2026-09-27) and Terra
// stay as controls.
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5.5';
export const HOSTED_MODEL_OPTIONS = [
  { id: 'anthropic/claude-sonnet-5.5', label: 'Sonnet 5.5 medium', effort: 'medium' },
  { id: 'anthropic/claude-sonnet-5', label: 'Sonnet 5 medium', effort: 'medium' },
  { id: 'openai/gpt-5.6-terra', label: 'Terra medium', effort: 'medium' },
  { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash low', effort: 'low' },
  { id: 'z-ai/glm-5.3', label: 'GLM 5.3 high', effort: 'high' },
];

export function hostedModelSettings(model = DEFAULT_MODEL, effort) {
  const option = HOSTED_MODEL_OPTIONS.find((item) => item.id === model);
  if (!option || (effort && effort !== option.effort))
    throw new Error('Choose one of the evaluated model configurations.');
  return { model: option.id, effort: option.effort, label: option.label };
}
