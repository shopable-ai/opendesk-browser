'use strict';

const { parseJson, canonical, fault, deepFreeze } = require('./TaskSpec');
function safeUsage(raw) {
  const value = parseJson(raw); const result = {};
  const names = { inputTokens: 'inputTokens', outputTokens: 'outputTokens', totalTokens: 'totalTokens', input_tokens: 'inputTokens', output_tokens: 'outputTokens', prompt_tokens: 'inputTokens', completion_tokens: 'outputTokens', total_tokens: 'totalTokens' };
  for (const [key, name] of Object.entries(names)) if (value[key] !== undefined) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 1000000000) throw fault('PROVIDER_USAGE');
    result[name] = value[key];
  }
  return result;
}

class FakeProvider {
  constructor(sequence) {
    if (!Array.isArray(sequence) || !sequence.length) throw fault('PROVIDER_SEQUENCE');
    this.kind = 'fake'; this.sequence = sequence.map(value => typeof value === 'string' ? value : canonical(parseJson(value))); this.calls = [];
  }
  async generate(input) {
    const { signal, ...view } = input;
    if (signal?.aborted) throw fault('ABORTED');
    this.calls.push(deepFreeze(parseJson(canonical(view), 131072)));
    if (this.calls.length > this.sequence.length) throw fault('PROVIDER_SEQUENCE_EXHAUSTED');
    return { rawJson: this.sequence[this.calls.length - 1], modelId: 'fake-fixed-sequence' };
  }
}
class AdapterProvider {
  // transport performs one model request and must honor signal; credentials stay in its closure.
  constructor(transport) { if (typeof transport !== 'function') throw fault('PROVIDER_TRANSPORT'); this.transport = transport; this.kind = 'injected'; }
  async generate(input) {
    const response = await this.transport(input);
    if (!response || typeof response.rawJson !== 'string' || typeof response.modelId !== 'string') throw fault('PROVIDER_RESPONSE');
    parseJson(response.rawJson, input.limits.maxResponseBytes);
    return { rawJson: response.rawJson, modelId: response.modelId, ...(response.usage ? { usage: safeUsage(response.usage) } : {}) };
  }
}
module.exports = { FakeProvider, AdapterProvider, safeUsage };
