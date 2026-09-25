import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  taskTerminalStartInput,
  taskTerminalReadInput,
  taskTerminalWriteInput,
} from './taskTerminalContract.ts';

test('terminal inputs expose only job, opaque terminal id and bounded interaction', () => {
  assert.deepEqual(
    taskTerminalStartInput({ jobId: 'job', cols: 100, rows: 30 }),
    {
      jobId: 'job',
      cols: 100,
      rows: 30,
    }
  );
  assert.deepEqual(
    taskTerminalReadInput({
      jobId: 'job',
      terminalId: 'terminal',
      afterSequence: 8,
    }),
    { jobId: 'job', terminalId: 'terminal', afterSequence: 8 }
  );
  const input = taskTerminalWriteInput({
    jobId: 'job',
    terminalId: 'terminal',
    data: 'dir\r',
  });
  assert.equal(input.jobId, 'job');
  assert.equal(input.terminalId, 'terminal');
  assert.equal(Buffer.from(input.dataBase64, 'base64').toString(), 'dir\r');
  assert.throws(() =>
    taskTerminalStartInput({ jobId: 'job', cols: 10, rows: 30 })
  );
  assert.throws(() =>
    taskTerminalWriteInput({ jobId: 'job', terminalId: 'terminal', data: '' })
  );
  assert.throws(() =>
    taskTerminalWriteInput({
      jobId: 'job',
      terminalId: 'terminal',
      data: 'x'.repeat(4097),
    })
  );
});
