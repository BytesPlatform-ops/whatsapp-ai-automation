/**
 * Convert LLM markdown output to WhatsApp-compatible formatting.
 *
 * WhatsApp supports:
 *   *bold*   _italic_   ~strikethrough~   ```monospace```
 *
 * LLMs typically output:
 *   **bold**  __italic__  ### Heading  - bullet  > quote
 */
function formatWhatsApp(text) {
  if (!text) return text;

  return text
    // **bold** or __bold__ → *bold*
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/__(.+?)__/g, '*$1*')
    // ### Heading / ## Heading / # Heading → *Heading*
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    // Replace em dashes with regular dashes
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    // Trim trailing spaces on each line
    .replace(/ +$/gm, '')
    // Collapse 3+ consecutive newlines to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { formatWhatsApp };
