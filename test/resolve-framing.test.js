const test = require('node:test');
const assert = require('node:assert/strict');

// ai-service loads dotenv / GEMINI — fine in tests
const aiService = require('../ai-service');

test('resolveFraming: explicit medium wins even if prompt says FULL BODY', () => {
  assert.equal(
    aiService.resolveFraming({ framing: 'medium' }, 'FULL BODY PHOTO head-to-toe wide shot'),
    'medium'
  );
});

test('resolveFraming: detects fullbody from prompt when framing omitted', () => {
  assert.equal(
    aiService.resolveFraming({}, 'FULL BODY PHOTO head-to-toe wide shot'),
    'fullbody'
  );
});
