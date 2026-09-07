"use client";

import { TOOL_ACTIVITY_LABELS, type AgentToolName } from "@/src/ai/tools/labels";

/**
 * Tool execution states, shown to the user as they happen.
 *
 * An agent that pauses silently while calling three tools looks broken. More
 * importantly, showing which tools ran is part of the product's honesty: the
 * user can see that an answer came from a database lookup rather than from the
 * model's memory, and can tell when a lookup failed.
 */

export interface ToolActivity {
  toolName: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  ok?: boolean;
}

function isKnownToolName(toolName: string): toolName is AgentToolName {
  return Object.prototype.hasOwnProperty.call(TOOL_ACTIVITY_LABELS, toolName);
}

export function toolActivityLabel(activity: ToolActivity): string {
  const running = activity.state === "input-streaming" || activity.state === "input-available";
  const failed = activity.state === "output-error" || activity.ok === false;

  if (failed) {
    return "Check failed";
  }

  if (!isKnownToolName(activity.toolName)) {
    return running ? "Checking information" : "Checked information";
  }

  const labels = TOOL_ACTIVITY_LABELS[activity.toolName];
  return running ? labels.running : labels.complete;
}

export function ToolActivityRow({ activity }: { activity: ToolActivity }) {
  const running = activity.state === "input-streaming" || activity.state === "input-available";
  const failed = activity.state === "output-error" || activity.ok === false;

  return (
    <div
      className={`rounded border px-2.5 py-1.5 text-xs ${
        failed
          ? "border-red-200 bg-red-50 text-red-800"
          : running
            ? "border-slate-200 bg-slate-50 text-slate-600"
            : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
    >
      <div className="flex items-center gap-2">
        {running ? (
          <span
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate-400"
            aria-hidden="true"
          />
        ) : (
          <span aria-hidden="true">{failed ? "✕" : "✓"}</span>
        )}
        <span className="font-medium">
          {toolActivityLabel(activity)}
          {running ? "…" : ""}
        </span>
      </div>
    </div>
  );
}
