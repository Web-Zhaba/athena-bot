export function splitMessage(text: string, maxLength = 3800): string[] {
  if (text.length <= maxLength) return [text];

  const parts: string[] = [];
  let current = '';
  const lines = text.split('\n');

  for (const line of lines) {
    if (current.length + line.length + 1 > maxLength) {
      parts.push(current.trim());
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}
