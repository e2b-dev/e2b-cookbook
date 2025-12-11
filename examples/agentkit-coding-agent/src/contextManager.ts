/* eslint-disable */

/**
 * Truncates text if it exceeds max length, adding truncation notice
 * Keeps beginning and end to preserve context for debugging
 */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  const truncated = text.length - maxChars;
  const halfMax = Math.floor(maxChars / 2);

  // Keep beginning and end, truncate middle
  return (
    text.slice(0, halfMax) +
    `\n\n... [truncated ${truncated} characters] ...\n\n` +
    text.slice(-halfMax)
  );
}

/**
 * Truncates command output intelligently
 * Prioritizes stderr (errors) and recent output
 */
export function truncateCommandOutput(stdout: string, stderr: string, maxChars: number = 15000): string {
  const combined = `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;

  if (combined.length <= maxChars) {
    return stdout; // If it fits, return original stdout
  }

  // Prioritize stderr (errors are more important) and end of stdout (recent output)
  const stderrTruncated = stderr.length > maxChars / 3
    ? truncateText(stderr, Math.floor(maxChars / 3))
    : stderr;

  const remainingChars = maxChars - stderrTruncated.length - 100;
  const stdoutTruncated = stdout.length > remainingChars
    ? `${stdout.slice(0, Math.floor(remainingChars / 2))}...\n[truncated]\n...${stdout.slice(-Math.floor(remainingChars / 2))}`
    : stdout;

  return stderr
    ? `${stdoutTruncated}\n\nSTDERR:\n${stderrTruncated}`
    : stdoutTruncated;
}

/**
 * Configuration for output size limits
 * These character limits prevent large tool outputs from bloating the conversation context
 */
export const CONTEXT_CONFIG = {
  // Maximum characters for different tool outputs
  MAX_TERMINAL_OUTPUT: 15000,
  MAX_FILE_CONTENT: 20000,
  MAX_TOTAL_FILE_CONTENT: 50000,
  MAX_CODE_OUTPUT: 10000,
};
