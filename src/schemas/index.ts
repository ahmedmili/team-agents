import { z } from "zod";

export const AgentRoleSchema = z.enum([
  "techLead",
  "backend",
  "qa",
  "architect",
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  agent: z.enum(["backend", "qa", "architect"]),
  description: z.string(),
  status: z.enum(["pending", "done"]).default("pending"),
});

export const PlanOutputSchema = z.object({
  summary: z.string(),
  tasks: z.array(TaskSchema).default([]),
  questions: z.array(z.string()).default([]),
});
export type PlanOutput = z.infer<typeof PlanOutputSchema>;

export const PatchItemSchema = z.object({
  filePath: z.string(),
  unifiedDiff: z.string(),
  description: z.string().optional(),
});

export const PatchOutputSchema = z.object({
  summary: z.string(),
  patches: z.array(PatchItemSchema).default([]),
});
export type PatchOutput = z.infer<typeof PatchOutputSchema>;

export const FindingSchema = z.object({
  severity: z.enum(["info", "warn", "error"]),
  message: z.string(),
  filePath: z.string().optional(),
});

export const ReviewOutputSchema = z.object({
  summary: z.string(),
  findings: z.array(FindingSchema).default([]),
  approved: z.boolean(),
});
export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

export const MessageOutputSchema = z.object({
  summary: z.string(),
});

export const AgentOutputSchema = z.object({
  agentId: AgentRoleSchema,
  type: z.enum(["plan", "patch", "review", "message"]),
  data: z.union([
    PlanOutputSchema,
    PatchOutputSchema,
    ReviewOutputSchema,
    MessageOutputSchema,
  ]),
});
export type AgentOutput = z.infer<typeof AgentOutputSchema>;

export const PatchStatusSchema = z.enum([
  "pending",
  "applied",
  "rejected",
  "rolled_back",
]);

export const PatchRecordSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  agentId: z.string(),
  filePath: z.string(),
  unifiedDiff: z.string(),
  description: z.string().optional(),
  status: PatchStatusSchema,
  createdAt: z.string(),
  backupPath: z.string().optional(),
});
export type PatchRecord = z.infer<typeof PatchRecordSchema>;

export const ProjectProfileSchema = z.object({
  root: z.string(),
  name: z.string(),
  stacks: z.array(z.string()),
  treeSummary: z.string(),
  dependencies: z.string(),
  gitStatus: z.string().optional(),
  entrypoints: z.array(z.string()).default([]),
});
export type ProjectProfile = z.infer<typeof ProjectProfileSchema>;
