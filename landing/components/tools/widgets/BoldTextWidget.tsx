'use client';

import { StyleListWidget } from '@/components/tools/widgets/StyleListWidget';
import { BOLD_STYLES } from '@/lib/textStyles';

export function BoldTextWidget() {
  return (
    <StyleListWidget
      styles={BOLD_STYLES}
      slug="bold-text-generator"
      defaultInput="Bold Text"
      placeholder="Type the text you want in bold…"
      tip="Tip: this is real Unicode bold, so it stays bold even where formatting isn't allowed — Instagram, LinkedIn, Facebook, Twitter/X, and Discord."
    />
  );
}
