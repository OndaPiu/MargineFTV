import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankPractice, metrics, usesAutomaticCost, withUpdatedCost } from '../lib/model.ts';

const practice = {
  ...blankPractice('cost-test'),
  source: 'Leadora',
  amount: 1_150_000,
  probability: 100,
  cost: 920_000,
};

test('tracks automatic costs through repeated amount and probability changes', () => {
  const updated = withUpdatedCost(practice, { ...practice, amount: 999_000, probability: 60 });
  assert.equal(updated.costMode, 'automatic');
  assert.equal(updated.cost, 479_520);
  assert.equal(metrics(updated).margin, 119_880);
  const saved = JSON.parse(JSON.stringify(updated));
  const changedAgain = withUpdatedCost(saved, { ...saved, probability: 20 });
  assert.equal(changedAgain.cost, 159_840);
  assert.equal(metrics(changedAgain).margin, 39_960);
});

test('an explicit automatic mode repairs stale costs and follows zero probability', () => {
  const stale = { ...practice, amount: 999_000, costMode: 'automatic' };
  assert.equal(metrics(stale).cost, 799_200);
  assert.equal(metrics({ ...stale, probability: 60 }).cost, 479_520);
  assert.equal(metrics({ ...stale, probability: 0 }).cost, 0);
});

test('manual costs stay fixed, including values equal to an automatic estimate', () => {
  const manual = { ...practice, costMode: 'manual' };
  assert.equal(usesAutomaticCost(manual), false);
  const changed = withUpdatedCost(manual, { ...manual, probability: 50 });
  assert.equal(changed.cost, 920_000);
  assert.equal(metrics(changed).margin, -345_000);
});

test('ambiguous legacy values are retained until an automatic mode is selected', () => {
  const stale = { ...practice, amount: 999_000 };
  assert.equal(usesAutomaticCost(stale), false);
  assert.equal(withUpdatedCost(stale, { ...stale, probability: 50 }).cost, 920_000);
  const automatic = withUpdatedCost(stale, { ...stale, costMode: 'automatic' });
  assert.equal(automatic.cost, 799_200);
});

test('keeps imported historical economics and manual costs intact', () => {
  const historical = {
    ...practice,
    source: 'Excel',
    historical: { contract: 1_150_000, cost: 900_000, margin: 250_000, commission: 92_000, secondMargin: 158_000 },
  };
  assert.deepEqual(withUpdatedCost(historical, historical), historical);
  assert.equal(metrics(historical).margin, 250_000);
});
