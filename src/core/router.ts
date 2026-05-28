import type { AgentRegistry } from "../agents/registry.js";
import type { AgentRole } from "../schemas/index.js";
import { stackAllowedForAgent } from "../repo/stack.js";
import type { ProjectProfile } from "../schemas/index.js";
import { RoutingError } from "../utils/errors.js";
import type { ParsedInput } from "./parser.js";

export interface RouteResult {
  targetRole: AgentRole;
  message: string;
  escalated: boolean;
  escalationReason?: string;
}

export class Router {
  constructor(private registry: AgentRegistry) {}

  route(input: ParsedInput, profile: ProjectProfile): RouteResult {
    if (input.kind === "agent") {
      const role = this.registry.resolveAlias(input.alias);
      if (!role) {
        return {
          targetRole: "techLead",
          message: input.message,
          escalated: true,
          escalationReason: `Unknown agent alias "@${input.alias}". Escalating to Tech Lead.`,
        };
      }
      const scope = this.registry.get(role).scope;
      if (!stackAllowedForAgent(scope.stacks, profile.stacks)) {
        return {
          targetRole: "techLead",
          message: input.message,
          escalated: true,
          escalationReason: `Agent "${input.alias}" (${role}) does not support project stacks [${profile.stacks.join(", ")}]. Escalating to Tech Lead.`,
        };
      }
      return {
        targetRole: role,
        message: input.message,
        escalated: false,
      };
    }

    if (input.kind === "natural" && input.message) {
      return {
        targetRole: "techLead",
        message: input.message,
        escalated: false,
      };
    }

    throw new RoutingError("Empty message");
  }
}
