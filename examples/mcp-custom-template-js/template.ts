import { Template } from 'e2b';

// Define the custom template
export const template = Template()
  .fromTemplate('mcp-gateway')
  // This will cache the browserbase server docker image in the template, speeding up the listTools call during runtime
  .addMcpServer(['browserbase', 'e2b']);

export const alias = 'browserbase-mcp-gateway';
