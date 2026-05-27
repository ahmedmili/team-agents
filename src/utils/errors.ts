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
