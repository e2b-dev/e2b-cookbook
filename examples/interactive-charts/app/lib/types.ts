import { ToolInvocation } from "ai";
import { Result } from "@e2b/code-interpreter";

export type ToolResult = (ToolInvocation & {
  result: Result;
})[];

export type CustomFiles = {
  name: string;
  contentType: string;
  base64: string;
};