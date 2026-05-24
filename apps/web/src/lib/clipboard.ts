export type ClipboardLike = {
  writeText(text: string): Promise<void>;
};

export async function copyTextToClipboard({
  text,
  clipboard,
}: {
  text: string;
  clipboard?: ClipboardLike;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const value = text.trim();
  if (!value) {
    return { ok: false, error: "缺少可复制的文本。" };
  }
  if (!clipboard) {
    return { ok: false, error: "当前浏览器不支持 Clipboard API。" };
  }

  try {
    await clipboard.writeText(value);
    return { ok: true };
  } catch {
    return { ok: false, error: "浏览器拒绝写入剪贴板，请手动复制。" };
  }
}
