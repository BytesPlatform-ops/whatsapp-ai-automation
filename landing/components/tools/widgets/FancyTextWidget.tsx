'use client';

import { StyleListWidget } from '@/components/tools/widgets/StyleListWidget';
import { FANCY_STYLES } from '@/lib/textStyles';

export function FancyTextWidget() {
  return (
    <StyleListWidget
      styles={FANCY_STYLES}
      slug="fancy-text-generator"
      defaultInput="Fancy Text"
      placeholder="Type your text and copy any style…"
      tip="Tip: these are plain Unicode characters — paste them into Instagram bios, TikTok captions, Discord, Twitter/X, or anywhere that accepts text."
    />
  );
}
