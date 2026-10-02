import test from 'node:test';
import assert from 'node:assert/strict';
import { connect, REQUIRED, validate, executionOrder } from './core.js';

test('the complete basic graph reaches Save Image in dependency order', () => {
  assert.equal(validate(REQUIRED).ready, true);
  const order = executionOrder(REQUIRED);
  assert.equal(order.at(-1), 'save');
  assert.ok(order.indexOf('sampler') > order.indexOf('positive'));
  assert.ok(order.indexOf('decode') > order.indexOf('sampler'));
});

test('type errors and a missing image connection do not pass validation', () => {
  const wrong = connect([], 'checkpoint', 'MODEL', 'positive', 'clip');
  assert.match(wrong.error, /different data types/);
  assert.deepEqual(wrong.links, []);
  assert.deepEqual(validate(REQUIRED.slice(0, -1)).missing, [REQUIRED.at(-1)]);
});

test('reconnecting an input replaces its earlier source', () => {
  const first = connect([], 'positive', 'CONDITIONING', 'sampler', 'positive');
  const second = connect(first.links, 'negative', 'CONDITIONING', 'sampler', 'positive');
  assert.deepEqual(second.links, [['negative', 'CONDITIONING', 'sampler', 'positive']]);
});
