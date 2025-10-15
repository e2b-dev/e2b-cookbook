import { Template } from "e2b";

export const templateName = 'anthropic-claude-code'

export const template = Template()
  .fromNodeImage("24")
  .runCmd("npm install -g @anthropic-ai/claude-code")