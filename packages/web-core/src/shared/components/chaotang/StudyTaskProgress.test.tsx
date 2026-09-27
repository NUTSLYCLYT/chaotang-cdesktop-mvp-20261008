import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DecreeJob } from '@/shared/providers/ChaotangProvider';

vi.mock('./CourtWorkspace', () => ({
  ValidatedDecreeResult: () => createElement('p', null, 'verified-result'),
}));
import { StudyTaskProgress } from './StudyTaskProgress';

const running: DecreeJob = {
  jobId: 'task-a',
  state: 'RUNNING',
  stage: 'MINISTRY',
  attemptCount: 1,
  providerRequestCount: 2,
  cancelRequested: false,
  result: null,
  error: null,
  createdAt: '2026-09-27T00:00:00Z',
  updatedAt: '2026-09-27T00:00:01Z',
};

function render(props: Partial<Parameters<typeof StudyTaskProgress>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(StudyTaskProgress, {
      jobId: 'task-a',
      isFetching: false,
      isCancelling: false,
      onRefresh: vi.fn(),
      onCancel: vi.fn(),
      ...props,
    })
  );
}

describe('study task feedback uses only confirmed task state', () => {
  it('does not invent queue or request counts before the first read', () => {
    const html = render({ isFetching: true });
    expect(html).toContain('正在读取任务状态');
    expect(html).toContain('尚未读取');
    expect(html).not.toContain('排队中');
    expect(html).not.toContain('QUEUED');
    expect(html).not.toContain('请求取消');
  });

  it('provides an explicit recovery action after a failed first read', () => {
    const html = render({ readError: '任务暂时无法读取' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('任务暂时无法读取');
    expect(html).toContain('重新读取状态');
    expect(html).not.toContain('排队中');
  });

  it('labels cached status as last confirmed after a refresh failure', () => {
    const html = render({ job: running, readError: '连接中断' });
    expect(html).toContain('上次已确认状态');
    expect(html).toContain('执行中');
    expect(html).toContain('连接中断');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>请求取消/);
  });

  it('never projects a different task as the requested task', () => {
    const html = render({ job: { ...running, jobId: 'task-b', result: {} } });
    expect(html).toContain('任务回执不匹配');
    expect(html).not.toContain('执行中');
    expect(html).not.toContain('verified-result');
  });

  it('reports a cancellation request without claiming cancellation completed', () => {
    const html = render({ job: { ...running, cancelRequested: true } });
    expect(html).toContain('已请求取消，等待后端确认');
    expect(html).not.toContain('已取消</');
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });

  it('shows cancellation failure without losing the running task', () => {
    const html = render({ job: running, cancelError: '暂时无法确认取消' });
    expect(html).toContain('取消请求未确认');
    expect(html).toContain('暂时无法确认取消');
    expect(html).toContain('执行中');
    expect(html).toContain('请求取消');
  });

  it.each(['SUCCEEDED', 'FAILED', 'CANCELLED'] as const)(
    'does not offer cancel for a confirmed terminal task: %s',
    (state) => {
      const html = render({ job: { ...running, state } });
      expect(html).not.toContain('请求取消');
      expect(html).toContain('重新读取状态');
    }
  );

  it('passes returned results through the existing result validator', () => {
    const html = render({
      job: { ...running, state: 'SUCCEEDED', result: {} },
    });
    expect(html).toContain('verified-result');
  });
});
