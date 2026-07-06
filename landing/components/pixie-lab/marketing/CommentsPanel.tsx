'use client';

import { InboxPanel } from './InboxPanel';

/**
 * CommentsPanel — meta inbox filtered to 'comment' interaction type. Renders via
 * the shared InboxPanel with type="comment" so all action/state logic stays DRY.
 */
export function CommentsPanel() {
  return <InboxPanel type="comment" />;
}
