import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const h = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  effects: [] as Array<() => void>,
  user: { id: 'owner-a' } as { id: string } | null,
  generation: 1,
  health: true,
  request: vi.fn(),
  supported: true,
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useRef(value: unknown) {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = { current: value };
    return h.slots[i];
  },
  useState(value: unknown) {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = value;
    return [h.slots[i], (next: unknown) => (h.slots[i] = next)];
  },
  useEffect(effect: () => (() => void) | void, deps: unknown[]) {
    const i = h.cursor++,
      old = h.slots[i];
    if (old && deps.every((v, n) => Object.is(v, old.deps[n]))) return;
    h.effects.push(() => {
      old?.cleanup?.();
      h.slots[i] = { deps, cleanup: effect() };
    });
  },
}));
vi.mock('@/shared/providers/ChaotangProvider', () => ({
  useChaotangProvider: () => ({
    user: h.user,
    health: h.health,
    authGeneration: h.generation,
  }),
  useChaotangClient: () => ({
    reviewDecreeDelivery: h.supported ? h.request : undefined,
  }),
}));
import {
  TaskDeliveryReview,
  TaskDeliveryReceiptView,
} from './TaskDeliveryReview';
import {
  decodeTaskDeliveryReview,
  deliveryCheckLabels,
} from './taskDeliveryReviewContract';
const fixture = () => ({
  review_id: 'a'.repeat(32),
  job_id: 'job-1',
  scope: 'STRUCTURAL_DELIVERY',
  state: 'PASSED',
  quality_assessment: 'NOT_ASSESSED',
  reviewed_at: '2026-09-28T00:00:00Z',
  review_digest: 'sha256:' + 'a'.repeat(64),
  evidence_refs: [],
  checks: Object.keys(deliveryCheckLabels).map((check_id) => ({
    check_id,
    state: 'PASS',
    detail: '合成回执',
    evidence: [],
  })),
});
function render(jobId = 'job-1', jobState = 'SUCCEEDED', jobVersion = 'v1') {
  h.cursor = 0;
  const tree = TaskDeliveryReview({ jobId, jobState, jobVersion });
  h.effects.splice(0).forEach((effect) => effect());
  return tree;
}
const button = (tree = render()) => tree.props.children[2];
const result = (tree = render()) => tree.props.children[5];
beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.effects = [];
  h.user = { id: 'owner-a' };
  h.generation = 1;
  h.health = true;
  h.supported = true;
  h.request.mockReset().mockResolvedValue(fixture());
});
it('only an explicit click requests a receipt and shows the bound structural result', async () => {
  const tree = render();
  expect(h.request).not.toHaveBeenCalled();
  await button(tree).props.onClick();
  expect(h.request).toHaveBeenCalledExactlyOnceWith('job-1');
  expect(result().props.receipt.job_id).toBe('job-1');
  const html = renderToStaticMarkup(
    <TaskDeliveryReceiptView
      receipt={decodeTaskDeliveryReview(fixture(), 'job-1')}
    />
  );
  expect(html).toContain('交付结构核验通过');
  expect(html).toContain('业务质量：尚未评估');
  expect(html).toContain('本次未作内容核验');
});
it.each(['QUEUED', 'RUNNING', 'CANCELLED', 'FAILED'])(
  'does not review a %s task',
  async (state) => {
    const control = button(render('job-1', state));
    expect(control.props.disabled).toBe(true);
    await control.props.onClick();
    expect(h.request).not.toHaveBeenCalled();
  }
);
it.each(['unsupported', 'anonymous', 'offline'])(
  'reports an unavailable boundary: %s',
  async (reason) => {
    if (reason === 'unsupported') h.supported = false;
    if (reason === 'anonymous') h.user = null;
    if (reason === 'offline') h.health = false;
    const control = button();
    expect(control.props.disabled).toBe(true);
    await control.props.onClick();
    expect(h.request).not.toHaveBeenCalled();
  }
);
it('deduplicates pending clicks without automatically retrying a failure', async () => {
  let reject!: (error: Error) => void;
  h.request.mockReturnValueOnce(new Promise((_, fail) => (reject = fail)));
  const control = button();
  const pending = control.props.onClick();
  await control.props.onClick();
  expect(h.request).toHaveBeenCalledOnce();
  expect(button().props['aria-busy']).toBe(true);
  reject(new Error('private service payload'));
  await pending;
  expect(result()).toBeFalsy();
  expect(button().props.children).toBe('重试结构核验');
  await button().props.onClick();
  expect(h.request).toHaveBeenCalledTimes(2);
  expect(result()).toBeTruthy();
});
it.each(['account', 'logout', 'session', 'task', 'version', 'unmount'])(
  'discards a late receipt after %s',
  async (change) => {
    let resolve!: (value: unknown) => void;
    h.request.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    const pending = button().props.onClick();
    let id = 'job-1',
      version = 'v1';
    if (change === 'account') h.user = { id: 'owner-b' };
    if (change === 'logout') h.user = null;
    if (change === 'session') h.generation++;
    if (change === 'task') id = 'job-2';
    if (change === 'version') version = 'v2';
    if (change === 'unmount') h.slots.forEach((slot) => slot?.cleanup?.());
    else render(id, 'SUCCEEDED', version);
    resolve(fixture());
    await pending;
    if (change !== 'unmount')
      expect(result(render(id, 'SUCCEEDED', version))).toBeFalsy();
    else expect(h.slots.some((slot) => slot?.phase === 'done')).toBe(false);
  }
);
it('rejects another job receipt and never displays its verdict', async () => {
  h.request.mockResolvedValueOnce({ ...fixture(), job_id: 'other-job' });
  await button().props.onClick();
  expect(result()).toBeFalsy();
  expect(button().props.children).toBe('重试结构核验');
});
it('removes an old receipt immediately on account change, before effect cleanup', async () => {
  await button().props.onClick();
  expect(result()).toBeTruthy();
  h.user = { id: 'owner-b' };
  h.cursor = 0;
  const tree = TaskDeliveryReview({
    jobId: 'job-1',
    jobState: 'SUCCEEDED',
    jobVersion: 'v1',
  });
  expect(result(tree)).toBeFalsy();
});
