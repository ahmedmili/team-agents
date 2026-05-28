/** JSON shape examples appended to agent system prompts for structured LLM output. */

export const OUTPUT_TAG = /\[OUTPUT_TYPE:(plan|patch|review)\]/;

export function schemaHintForOutputTag(outputTag: string): string {
  const match = outputTag.match(OUTPUT_TAG);
  const type = match?.[1] ?? "patch";

  switch (type) {
    case "plan":
      return [
        "Respond with ONLY one JSON object matching this exact shape:",
        JSON.stringify(
          {
            summary: "Brief plan summary",
            tasks: [
              {
                id: "task-1",
                agent: "backend",
                description: "What the backend agent should do",
                status: "pending",
              },
              {
                id: "task-2",
                agent: "qa",
                description: "What QA should validate",
                status: "pending",
              },
            ],
            questions: ["Optional clarifying question"],
          },
          null,
          2,
        ),
        'agent must be one of: "backend", "qa", "architect". Always include at least one task.',
      ].join("\n");

    case "review":
      return [
        "Respond with ONLY one JSON object matching this exact shape:",
        JSON.stringify(
          {
            summary: "Review summary",
            findings: [
              {
                severity: "info",
                message: "Finding description",
                filePath: "optional/path.ts",
              },
            ],
            approved: true,
          },
          null,
          2,
        ),
        'severity must be "info", "warn", or "error". approved must be boolean.',
      ].join("\n");

    case "patch":
    default:
      return [
        "Respond with ONLY one JSON object matching this exact shape:",
        JSON.stringify(
          {
            summary: "What changed",
            patches: [
              {
                filePath: "src/example.ts",
                unifiedDiff: "--- a/src/example.ts\\n+++ b/src/example.ts\\n@@ -1 +1 @@\\n-old\\n+new",
                description: "optional",
              },
            ],
          },
          null,
          2,
        ),
        "unifiedDiff must be valid unified diff format. filePath is relative to project root.",
      ].join("\n");
  }
}
