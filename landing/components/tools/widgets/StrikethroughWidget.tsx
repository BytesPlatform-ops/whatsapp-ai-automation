'use client';

import { StyleListWidget } from '@/components/tools/widgets/StyleListWidget';
import { STRIKE_STYLES } from '@/lib/textStyles';

export function StrikethroughWidget() {
  return (
    <StyleListWidget
      styles={STRIKE_STYLES}
      slug="strikethrough-text-generator"
      defaultInput="strikethrough this"
      placeholder="Type the text to cross out…"
      tip="Tip: this uses Unicode combining marks, so the line stays on your text even in apps with no formatting — Instagram, WhatsApp, Discord, and more."
    />
  );
}
