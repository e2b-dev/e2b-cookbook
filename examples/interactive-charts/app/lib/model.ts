// model.ts
import { createOpenAI } from "@ai-sdk/openai";
import { LanguageModelV1 } from "ai";

export function getModel(): LanguageModelV1 {
  return createOpenAI({
    apiKey: process.env.TOGETHER_AI_API_KEY,
    baseURL: "https://api.together.xyz/v1",
  })("meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo");
}