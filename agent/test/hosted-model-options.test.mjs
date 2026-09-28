import test from 'node:test';
import assert from 'node:assert/strict';
import { HOSTED_MODEL_OPTIONS, hostedModelSettings } from '../src/hosted-model-options.mjs';

test('hosted experiment exposes only evaluated model and effort pairs', () => {
  assert.deepEqual(
    HOSTED_MODEL_OPTIONS.map(({ id, effort }) => [id, effort]),
    [
      ['anthropic/claude-sonnet-5.5', 'medium'],
      ['anthropic/claude-sonnet-5', 'medium'],
      ['openai/gpt-5.6-terra', 'medium'],
      ['deepseek/deepseek-v4.1-flash', 'low'],
      ['z-ai/glm-5.3', 'high'],
    ],
  );
  assert.equal(hostedModelSettings().model, 'anthropic/claude-sonnet-5.5');
  assert.equal(hostedModelSettings('anthropic/claude-sonnet-5').label, 'Sonnet 5 medium');
  assert.equal(hostedModelSettings('openai/gpt-5.6-terra').effort, 'medium');
  assert.equal(hostedModelSettings('deepseek/deepseek-v4.1-flash').effort, 'low');
  assert.throws(
    () => hostedModelSettings('deepseek/deepseek-v4.1-flash', 'high'),
    /evaluated model configurations/,
  );
  assert.throws(() => hostedModelSettings('openrouter/auto'), /evaluated model configurations/);
});
