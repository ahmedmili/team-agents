export class AiShellError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AiShellError";
  }
}

export class RoutingError extends AiShellError {
  constructor(message: string) {
    super(message, "ROUTING_ERROR");
    this.name = "RoutingError";
  }
}

export class ScopeViolationError extends AiShellError {
  constructor(message: string) {
    super(message, "SCOPE_VIOLATION");
    this.name = "ScopeViolationError";
  }
}

export class PatchConflictError extends AiShellError {
  constructor(message: string) {
    super(message, "PATCH_CONFLICT");
    this.name = "PatchConflictError";
  }
}

export class LlmRateLimitError extends AiShellError {
  constructor(message: string) {
    super(message, "LLM_RATE_LIMIT");
    this.name = "LlmRateLimitError";
  }
}

/** Flatten Error.cause chains for CLI display. */
export function formatErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  const parts: string[] = [];
  let current: unknown = err;
  let depth = 0;

  while (current instanceof Error && depth < 4) {
    if (!parts.includes(current.message)) parts.push(current.message);
    current = current.cause;
    depth++;
  }

  return parts.join(" — ");
}
