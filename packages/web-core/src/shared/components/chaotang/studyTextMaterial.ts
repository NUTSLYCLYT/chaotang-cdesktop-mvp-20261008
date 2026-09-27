export const STUDY_MATERIAL_MAX_BYTES = 16 * 1024;

export type StudyTextMaterial = { name: string; text: string };

function hasControlCharacters(value: string, allowTextWhitespace = false) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return (
      (code < 32 || code === 127) &&
      !(allowTextWhitespace && [9, 10, 13].includes(code))
    );
  });
}

/** Local text only; this does not upload, parse documents or grant authority. */
export async function readStudyTextMaterial(
  file: Pick<File, 'name' | 'size' | 'arrayBuffer'>
): Promise<StudyTextMaterial> {
  if (
    !/\.(txt|md)$/i.test(file.name) ||
    file.name.length > 120 ||
    hasControlCharacters(file.name)
  )
    throw new Error(
      '仅支持 TXT、Markdown（.md）文本文件，请检查文件格式和名称。'
    );
  if (
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > STUDY_MATERIAL_MAX_BYTES
  )
    throw new Error('请选择非空且不超过 16 KiB 的文本文件。');
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    throw new Error('未能读取文件，请重新选择；当前需求未改变。');
  }
  if (
    bytes.byteLength !== file.size ||
    bytes.byteLength > STUDY_MATERIAL_MAX_BYTES
  )
    throw new Error('文件内容或大小已变化，请重新选择。');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('文件不是有效的 UTF-8 文本，请转换编码后重试。');
  }
  if (!text.trim() || hasControlCharacters(text, true))
    throw new Error('文件为空或含非文本控制字符，请检查后重试。');
  if (text.length > 4000)
    throw new Error('材料超过当前需求框的 4000 字符限制，请先摘录相关内容。');
  return { name: file.name, text };
}

export function appendStudyTextMaterial(
  objective: string,
  material: StudyTextMaterial
): string {
  const combined = `${objective}${objective ? '\n\n' : ''}[参考资料：${JSON.stringify(material.name)}]\n${material.text}\n[参考资料结束]`;
  if (combined.length > 4000)
    throw new Error(
      '需求与材料合计（含文件名和标记）超过 4000 字符，请精简需求或摘录材料后重试。未截断任何内容。'
    );
  return combined;
}
