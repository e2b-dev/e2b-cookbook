import { Result } from "@e2b/code-interpreter";
import { useState } from "react";
import { ToolResult } from "../lib/types";
import { RenderResult } from "./charts";
import { AlertTriangle, ChartNoAxesCombined } from "lucide-react";

export function ToolOutput({ result }: { result: ToolResult | undefined }) {
  const [viewMode, setViewMode] = useState<"static" | "interactive">(
    "interactive"
  );

  if (!result) return null;
  const toolResult = result.find((r) => r.toolName === "runCode")?.result;

  if (toolResult?.error) {
    return (
      <div className="text-red-500 border border-red-200 rounded-xl bg-red-500/10 text-sm">
        <div className="flex items-center gap-2 pt-4 px-4">
          <AlertTriangle className="w-4 h-4" />
          <span className="font-semibold">Error: {toolResult.error.name}</span>
        </div>
        <pre className="overflow-auto p-4">{toolResult.error.traceback}</pre>
      </div>
    );
  }

  return toolResult.results.map((result: Result, index: number) => (
    <div key={index} className="flex flex-col border rounded-xl shadow-sm">
      <div className="flex items-center justify-between p-2">
        <div className="p-2 font-semibold text-gray-800 text-sm flex items-center gap-2">
          <ChartNoAxesCombined className="w-4 h-4" />
          {result.extra?.chart.title}
        </div>
        <div className="flex justify-end border rounded-lg overflow-hidden">
          <button
            className={`px-3 py-2 font-semibold text-sm ${
              viewMode === "static" ? "bg-orange-500/10 text-orange-500" : ""
            }`}
            onClick={() => setViewMode("static")}
          >
            Static
          </button>
          <button
            className={`px-3 py-2 font-semibold text-sm ${
              viewMode === "interactive"
                ? "bg-orange-500/10 text-orange-500"
                : ""
            }`}
            onClick={() => setViewMode("interactive")}
          >
            Interactive
          </button>
        </div>
      </div>
      <div className="p-4">
        <RenderResult result={result} viewMode={viewMode} />
      </div>
    </div>
  ));
}
