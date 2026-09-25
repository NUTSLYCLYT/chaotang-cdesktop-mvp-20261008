import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as intent from './studyIntentConfirmation.ts';

const source = {
  ownerId: 'owner-a',
  normalizedOriginalGoal: '  原始目标\n  保留空格  ',
  exactLatestChancellorRestatement: '  仅拟草案\n不得对外发送。  ',
  consultationGeneration: 2,
  contextGeneration: 3,
};
test('upstream confirmation freezes exact source text and rejects serialized authority', () => {
  const confirmed = intent.confirmStudyIntent(source, source);
  assert.ok(confirmed);
  assert.ok(Object.isFrozen(confirmed));
  const payload = intent.prepareConfirmedStudyDraft(confirmed, source, 4);
  assert.deepEqual(payload, {
    messages: [
      {
        role: 'user',
        content:
          '[用户原始目标]\n原始目标\n  保留空格\n\n[用户已确认的丞相理解]\n仅拟草案\n不得对外发送。',
      },
    ],
    version: 4,
  });
  for (const fake of [
    null,
    source,
    { ...confirmed },
    JSON.parse(JSON.stringify(confirmed)),
  ])
    assert.equal(intent.prepareConfirmedStudyDraft(fake, source, 4), null);
});
test('owner, goal, restatement and both generations invalidate confirmed draft requests', () => {
  const approved = intent.confirmStudyIntent(source, source);
  for (const patch of [
    { ownerId: 'B' },
    { normalizedOriginalGoal: 'changed' },
    { exactLatestChancellorRestatement: 'changed' },
    { consultationGeneration: 3 },
    { contextGeneration: 4 },
  ]) {
    assert.equal(
      intent.prepareConfirmedStudyDraft(approved, { ...source, ...patch }, 1),
      null
    );
  }
});
test('invalid snapshots and overlong payloads never produce a draft request', () => {
  for (const patch of [
    { ownerId: '' },
    { normalizedOriginalGoal: ' ' },
    { exactLatestChancellorRestatement: '' },
    { consultationGeneration: NaN },
    { contextGeneration: -1 },
    { contextGeneration: Infinity },
  ])
    assert.equal(intent.captureStudyIntent({ ...source, ...patch }), null);
  const long = {
    ...source,
    exactLatestChancellorRestatement: '字'.repeat(4000),
  };
  const approved = intent.confirmStudyIntent(long, long);
  assert.ok(approved);
  assert.equal(intent.prepareConfirmedStudyDraft(approved, long, 1), null);
  assert.equal(
    intent.prepareConfirmedStudyDraft(
      intent.confirmStudyIntent(source, source),
      source,
      0
    ),
    null
  );
  // Python backend counts Unicode code points, not UTF-16 units.
  const emoji = {
    ...source,
    exactLatestChancellorRestatement: '😀'.repeat(1900),
  };
  assert.ok(
    intent.prepareConfirmedStudyDraft(
      intent.confirmStudyIntent(emoji, emoji),
      emoji,
      1
    )
  );
});
