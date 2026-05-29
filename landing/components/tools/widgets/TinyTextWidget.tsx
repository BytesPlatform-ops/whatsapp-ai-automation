'use client';

import { StyleListWidget } from '@/components/tools/widgets/StyleListWidget';
import { TINY_STYLES } from '@/lib/textStyles';

export function TinyTextWidget() {
  return (
    <StyleListWidget
      styles={TINY_STYLES}
      slug="tiny-text-generator"
      defaultInput="tiny text"
      placeholder="Type your text to shrink it…"
      tip="Tip: tiny text is made of real Unicode superscript, subscript, and small-caps characters — paste it anywhere, including Instagram and TikTok bios."
    />
  );
}
