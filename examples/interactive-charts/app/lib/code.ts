export function extractCodeFromText(text: string) {
  const codeRegex = /```python\s*([\s\S]*?)\s*```/g;
  const match = codeRegex.exec(text);
  return match ? match[1] : null;
}
