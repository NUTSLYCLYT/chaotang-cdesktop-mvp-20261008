import { describe, expect, it, vi } from 'vitest';
import {
  appendStudyTextMaterial,
  readStudyTextMaterial,
} from './studyTextMaterial';

function file(text: string, name = '资料.md') {
  const bytes = new TextEncoder().encode(text);
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: vi.fn(async () => bytes.buffer),
  };
}

describe('local study text materials', () => {
  it('preserves text and appends a named reference without discarding the goal', async () => {
    const material = await readStudyTextMaterial(
      file('  内容\r\n<script>text</script>  ')
    );
    expect(material.text).toBe('  内容\r\n<script>text</script>  ');
    expect(appendStudyTextMaterial('用户目标', material)).toBe(
      '用户目标\n\n[参考资料："资料.md"]\n  内容\r\n<script>text</script>  \n[参考资料结束]'
    );
  });
  it.each(['data.pdf', 'file.docx', 'file.html', 'bad\nname.txt'])(
    'refuses unsupported names before reading: %s',
    async (name) => {
      const input = file('内容', name);
      await expect(readStudyTextMaterial(input)).rejects.toThrow('仅支持');
      expect(input.arrayBuffer).not.toHaveBeenCalled();
    }
  );
  it('rejects oversized files before allocation', async () => {
    const input = file('x'.repeat(16385));
    await expect(readStudyTextMaterial(input)).rejects.toThrow('16 KiB');
    expect(input.arrayBuffer).not.toHaveBeenCalled();
  });
  it('rejects invalid UTF-8 rather than replacing bytes', async () => {
    await expect(
      readStudyTextMaterial({
        name: 'data.txt',
        size: 2,
        arrayBuffer: async () => new Uint8Array([0xc3, 0x28]).buffer,
      })
    ).rejects.toThrow('UTF-8');
  });
  it.each(['', ' \n ', 'abc\u0000def', '长'.repeat(4001)])(
    'rejects empty, binary or overlong content: case %#',
    async (text) => {
      await expect(readStudyTextMaterial(file(text))).rejects.toThrow();
    }
  );
  it('does not silently truncate when the goal and reference together exceed the limit', () => {
    expect(() =>
      appendStudyTextMaterial('x'.repeat(3990), { name: 'a.txt', text: '内容' })
    ).toThrow('未截断');
  });
  it('reports read failures and changed byte counts', async () => {
    const input = file('abc');
    input.size = 2;
    await expect(readStudyTextMaterial(input)).rejects.toThrow('大小已变化');
    await expect(
      readStudyTextMaterial({
        name: 'a.md',
        size: 1,
        arrayBuffer: async () => {
          throw new Error('private system path');
        },
      })
    ).rejects.toThrow('未能读取文件');
  });
});
