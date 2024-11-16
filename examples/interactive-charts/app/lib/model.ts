import { createOpenAI } from "@ai-sdk/openai";
import { LanguageModelV1 } from "ai";

// Simplified model config since we only use Together.ai
export type LLMModelConfig = {
  model?: string;
  baseURL?: string;
  apiKey?: string;
};

// Default configuration for Together.ai
const defaultConfig = {
  baseURL: "https://api.together.xyz/v1",
  model: "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo"
};

// Simplified to only handle Together.ai
export function getModel(userConfig: LLMModelConfig = {}): LanguageModelV1 {
  const config = { ...userConfig, ...defaultConfig };
  
  return createOpenAI({
    apiKey: process.env.TOGETHER_AI_API_KEY,
    ...config
  })(config.model);
}