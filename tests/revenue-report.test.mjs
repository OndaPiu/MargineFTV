import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankPractice, metrics, reportEntries, revenueReportEntries, withUpdatedExcelContract } from '../lib/model.ts';

const practice = {
  ...blankPractice('practice-1'),
  amount: 2_400_000,
  probability: 50,
  closeDate: '2026-10-30',
};

const invoice = (number, date, total, overrides = {}) => ({
  number, date, total, practiceId: practice.id, source: 'Enerp', ...overrides,
});
const first = invoice('300-1', '2026-11-18', 400_000);
const second = invoice('300-2', '2026-12-01', 400_000, { source: 'Manuale' });
const last = invoice('300-3', '2026-12-10', 400_000);

const amounts = (invoices, p = practice) =>
  revenueReportEntries([p], invoices).map(({ date, amount }) => [date, amount]);

test('forecasts the probability-weighted contract and moves it when the close date changes', () => {
  assert.deepEqual(amounts([]), [['2026-12-04', 1_200_000]]);
  assert.deepEqual(amounts([], { ...practice, closeDate: '2026-11-01' }), [['2026-12-06', 1_200_000]]);
});

test('allocates each invoice and leaves only the remainder on the forecast date', () => {
  assert.deepEqual(amounts([first]), [['2026-11-18', 400_000], ['2026-12-04', 800_000]]);
  assert.deepEqual(amounts([first, second]), [
    ['2026-11-18', 400_000], ['2026-12-01', 400_000], ['2026-12-04', 400_000],
  ]);
  assert.deepEqual(amounts([first, second, last]), [
    ['2026-11-18', 400_000], ['2026-12-01', 400_000], ['2026-12-10', 400_000],
  ]);
});

test('credit notes reduce actuals and reopen a forecast, while overbilling creates no negative forecast', () => {
  const credit = invoice('300-4', '2026-12-12', -100_000);
  assert.deepEqual(amounts([first, second, last, credit]).slice(-2), [
    ['2026-12-12', -100_000], ['2026-12-04', 100_000],
  ]);
  assert.deepEqual(amounts([invoice('300-5', '2026-11-18', 1_300_000)]), [['2026-11-18', 1_300_000]]);
});

test('includes linked actuals without an estimate and ignores unlinked invoices', () => {
  assert.deepEqual(amounts([first, { ...last, practiceId: null }], { ...practice, probability: null }), [
    ['2026-11-18', 400_000],
  ]);
  assert.deepEqual(amounts([first], { ...practice, closeDate: '' }), [
    ['2026-11-18', 400_000], ['', 800_000],
  ]);
});

test('keeps historical documents, replaces Excel duplicates, and recalculates the historical forecast', () => {
  const historical = {
    ...practice,
    source: 'Excel',
    historical: { contract: 1_200_000, cost: 800_000, margin: 400_000, commission: 96_000, secondMargin: 304_000 },
    revenues: [
      { date: '2026-10-18', amount: 400_000, number: '300-1', sourceRow: 1 },
      { date: '2026-10-19', amount: 200_000, number: '300-8', sourceRow: 2 },
      { date: '2025-10-18', amount: 100_000, number: '300-1', sourceRow: 3 },
      { date: '2026-09-30', amount: 500_000, number: '', sourceRow: 4 },
    ],
  };
  const excelDuplicate = invoice('300-1', '2026-10-18', 400_000, { source: 'Excel' });
  assert.deepEqual(amounts([excelDuplicate, first], historical), [
    ['2026-11-18', 400_000], ['2026-10-19', 200_000], ['2025-10-18', 100_000], ['2026-12-04', 500_000],
  ]);
  assert.deepEqual(['contract', 'margin', 'secondMargin'].map(mode => reportEntries([historical], mode)[0].amount),
    [1_200_000, 400_000, 304_000]);
});

test('an edited Excel probability changes the contract and residual while retaining historical values', () => {
  const excel = {
    ...practice,
    source: 'Excel',
    historical: { contract: 1_200_000, cost: 960_000, margin: 240_000, commission: 96_000, secondMargin: 144_000 },
  };
  assert.equal(withUpdatedExcelContract(excel, { ...excel, agent: 'Agente aggiornato' }).recalculateExcelContract, undefined);
  const edited = withUpdatedExcelContract(excel, { ...excel, probability: 80 });
  const reopened = JSON.parse(JSON.stringify(edited));
  assert.equal(metrics(reopened).contract, 1_920_000);
  assert.equal(reportEntries([reopened], 'contract')[0].amount, 1_920_000);
  assert.deepEqual(amounts([first], reopened), [['2026-11-18', 400_000], ['2026-12-04', 1_520_000]]);
  assert.deepEqual(reopened.historical, excel.historical);
  assert.equal(metrics(reopened).margin, 240_000);
  assert.equal(metrics(reopened).secondMargin, 144_000);
  assert.equal(metrics(excel).contract, 1_200_000);

  const leadora = { ...practice, source: 'Leadora' };
  const leadoraEdit = { ...leadora, probability: 80 };
  assert.deepEqual(withUpdatedExcelContract(leadora, leadoraEdit), leadoraEdit);
  assert.equal(metrics(leadoraEdit).contract, 1_920_000);
});

test('a previously saved Excel probability is used even without a recalculation flag', () => {
  const excel = {
    ...practice,
    source: 'Excel',
    amount: 7_000_000,
    probability: 60,
    historical: { contract: 7_000_000, cost: 5_600_000, margin: 1_400_000, commission: 560_000, secondMargin: 1_400_000 },
  };
  assert.equal(metrics(excel).contract, 4_200_000);
  assert.equal(metrics(withUpdatedExcelContract(excel, { ...excel, probability: 59 })).contract, 4_130_000);
  const returnedTo60 = withUpdatedExcelContract(excel, { ...excel, probability: 60 });
  assert.equal(reportEntries([returnedTo60], 'contract')[0].amount, 4_200_000);
  assert.deepEqual(amounts([], returnedTo60), [['2026-12-04', 4_200_000]]);
  assert.equal(metrics(returnedTo60).margin, excel.historical.margin);
  assert.equal(returnedTo60.historical.contract, 7_000_000);
});
