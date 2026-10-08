import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('@/shared/hooks/chaotang/useHubu', () => ({
  useHubuWorkProduct: () => ({ data: { artifactState: 'PUBLISHED' } }),
}));
vi.mock('./HubuArtifactDownloadButton', () => ({
  HubuArtifactDownloadButton: ({ artifactId }: { artifactId: string }) =>
    createElement('button', { 'data-artifact': artifactId }, '下载 XLSX'),
}));
import {
  ShiguanArchiveContent,
  readArchiveContent,
} from './ShiguanArchiveContent';
const render = (value: unknown, department = '户部') =>
  renderToStaticMarkup(
    createElement(ShiguanArchiveContent, {
      content: JSON.stringify(value),
      department,
    })
  );
it('presents archived numbers with original precision and currency, with technical IDs collapsed', () => {
  const html = render({
    artifact_id: 'a123',
    content_digest: 'private-hash',
    decision: '待核实',
    facts: [
      {
        available_cash: '600.00',
        monthly_net_burn: '0.00',
        runway_months: '6.00',
        currency: 'CNY',
      },
    ],
    recommendations: ['核对资料'],
  });
  const visible = html.split('<details')[0];
  expect(visible).toContain('600.00');
  expect(visible).toContain(' 元');
  expect(visible).toContain('0.00');
  expect(visible).toContain(' 个月');
  expect(visible).toContain('核对资料');
  expect(visible).not.toContain('content_digest');
  expect(visible).not.toContain('private-hash');
  expect(html).toContain('private-hash');
  expect(html).not.toContain('<details open');
});
it('never invents units, acceptance or data and preserves unknown structured evidence', () => {
  const html = render({
    facts: [
      null,
      [],
      { available_cash: 15, unknown_evidence: 'original-only' },
    ],
    recommendations: [{}, '待补证据'],
  });
  expect(html).toContain('原文未注明币种');
  expect(html.split('<details')[0]).not.toContain('original-only');
  expect(html).toContain('original-only');
  expect(html).not.toContain('[object Object]');
});
it('keeps legacy text and escapes untrusted archive markup', () => {
  expect(readArchiveContent('旧版报告')).toBeUndefined();
  const html = renderToStaticMarkup(
    createElement(ShiguanArchiveContent, {
      content: '旧版报告 <script>alert(1)</script>',
      department: '工部',
    })
  );
  expect(html).toContain('旧版报告');
  expect(html).not.toContain('<script>');
});
it.each([
  ['户部', '../../secret'],
  ['工部', 'artifact-a'],
  ['户部', 'https://example.invalid'],
])(
  'never interprets arbitrary archive content as a download route (%s)',
  (department, artifact_id) => {
    expect(render({ artifact_id }, department)).not.toContain('data-artifact=');
  }
);
