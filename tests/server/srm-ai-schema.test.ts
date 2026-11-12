import { expect, it } from 'vitest';
import { parseAiResult } from '../../server/srm/ai-schema.js';
const result = {
  recommendation: 'approve',
  confidence: 0.95,
  reasons: ['Consistent.'],
};
const json = JSON.stringify(result);
for (const text of [
  json,
  `\n ${json}\n`,
  `\`\`\`json\n${json}\n\`\`\``,
  `\`\`\`JSON\r\n${json}\r\n\`\`\``,
  `\`\`\`\n${json}\n\`\`\``,
]) {
  it('accepts a complete strict result, optionally enclosed by one JSON fence', () =>
    expect(parseAiResult(text)).toEqual(result));
}
for (const text of [
  `Answer: ${json}`,
  `\`\`\`json\n${json}\n\`\`\`\nExtra`,
  `\`\`\`json\n${json}`,
  `\`\`\`js\n${json}\n\`\`\``,
  `${json}\n${json}`,
  JSON.stringify({ ...result, confidence: 2 }),
  '```json\n' + JSON.stringify({ ...result, confidence: 2 }) + '\n```',
  JSON.stringify({ ...result, recommendation: 'yes' }),
  JSON.stringify({ ...result, reasons: [] }),
  JSON.stringify({ ...result, extra: true }),
]) {
  it('rejects prose, partial fences and invalid result fields', () =>
    expect(() => parseAiResult(text)).toThrow());
}
