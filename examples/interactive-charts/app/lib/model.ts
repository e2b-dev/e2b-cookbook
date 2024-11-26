import { createOpenAI } from "@ai-sdk/openai";
import { LanguageModelV1 } from "ai";

export function getModel(): LanguageModelV1 {
  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://api.fireworks.ai/inference/v1",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    }
  })("accounts/fireworks/models/llama-v3p1-405b-instruct");
}