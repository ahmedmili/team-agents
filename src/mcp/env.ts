import type { ApiKeysConfig } from "../config/types.js";

const KEY_REF = /\$\{keys\.(\w+)\}/g;

export function resolveMcpEnv(
  env: Record<string, string> | undefined,
  keys: ApiKeysConfig | undefined,
): Record<string, string> | undefined {
  if (!env) return undefined;
  const resolved: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    resolved[k] = v.replace(KEY_REF, (_, key: string) => {
      const val = keys?.[key as keyof ApiKeysConfig];
      return typeof val === "string" ? val : "";
    });
  }
  return resolved;
}
