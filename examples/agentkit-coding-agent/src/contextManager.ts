/* eslint-disable */

/**
 * Estimates token count for a string (rough approximation)
 * Claude uses ~4 characters per token on average
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncates text if it exceeds max length, adding truncation notice
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
    `\n\n... [truncated ${truncated} characters for token efficiency] ...\n\n` +
    text.slice(-halfMax)
  );
}

/**
 * Truncates command output intelligently
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
 * Summarizes conversation history when it gets too long
 * Keeps system message, recent messages, and summarizes the middle
 */
export function summarizeConversation(
  messages: any[],
  maxTokens: number = 150000,
  keepRecentCount: number = 6
): { messages: any[]; wasSummarized: boolean } {
  // Estimate current token count
  const currentTokens = messages.reduce((sum, msg) => {
    const content = typeof msg.content === "string"
      ? msg.content
      : JSON.stringify(msg.content);
    return sum + estimateTokens(content);
  }, 0);

  if (currentTokens < maxTokens) {
    return { messages, wasSummarized: false };
  }

  // Keep system message (first), recent messages (last N), summarize middle
  const systemMessage = messages[0];
  const recentMessages = messages.slice(-keepRecentCount);
  const middleMessages = messages.slice(1, -keepRecentCount);

  // Create summary of middle messages
  const summary = summarizeMiddleMessages(middleMessages);

  const summarizedMessages = [
    systemMessage,
    {
      role: "user",
      content: `[Previous conversation summary: ${summary}]`
    },
    ...recentMessages
  ];

  return { messages: summarizedMessages, wasSummarized: true };
}

/**
 * Creates a concise summary of middle messages
 */
function summarizeMiddleMessages(messages: any[]): string {
  const toolUses: Record<string, number> = {};
  let userMessages = 0;
  let assistantMessages = 0;

  messages.forEach(msg => {
    if (msg.role === "user") userMessages++;
    if (msg.role === "assistant") {
      assistantMessages++;
      // Count tool uses
      if (Array.isArray(msg.content)) {
        msg.content.forEach((block: any) => {
          if (block.type === "tool_use") {
            toolUses[block.name] = (toolUses[block.name] || 0) + 1;
          }
        });
      }
    }
  });

  const toolSummary = Object.entries(toolUses)
    .map(([tool, count]) => `${tool}(${count}x)`)
    .join(", ");

  return `${messages.length} messages exchanged. Agent used tools: ${toolSummary || "none"}. Progress made on task.`;
}

/**
 * Configuration for context management
 */
export const CONTEXT_CONFIG = {
  // Maximum characters for different tool outputs
  MAX_TERMINAL_OUTPUT: 15000,
  MAX_FILE_CONTENT: 20000,
  MAX_TOTAL_FILE_CONTENT: 50000,
  MAX_CODE_OUTPUT: 10000,

  // Token limits
  CONVERSATION_TOKEN_LIMIT: 150000, // Start managing context at 150k tokens
  HARD_TOKEN_LIMIT: 180000, // Hard limit before summarization

  // Message retention
  KEEP_RECENT_MESSAGES: 6, // Always keep last N messages
};

/**
 * Valid Claude model names
 */
export const VALID_CLAUDE_MODELS = [
  "claude-3-5-sonnet-20241022",
  "claude-3-5-sonnet-20240620",
  "claude-sonnet-4-5-20250929",
  "claude-3-5-haiku-20241022",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
] as const;

/**
 * Validates if a model name is valid
 */
export function isValidClaudeModel(model: string): boolean {
  return VALID_CLAUDE_MODELS.includes(model as any);
}

/**
 * Gets a helpful error message for invalid model
 */
export function getModelErrorMessage(invalidModel: string): string {
  return `
Invalid Claude model: "${invalidModel}"

Valid models are available here: https://console.anthropic.com/docs/en/about-claude/models/overview

Please update your model configuration in src/index.ts or set in .env ANTHROPIC_MODEL
`.trim();
}
