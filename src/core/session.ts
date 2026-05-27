import path from "node:path";
import { simpleGit } from "simple-git";
import type { AiShellConfig } from "../config/types.js";
import type { ProjectProfile, PatchRecord } from "../schemas/index.js";
import type { MemoryStore, SessionRow } from "../memory/store.js";
import { scanRepository } from "../repo/scanner.js";
import { loadConfig } from "../config/loader.js";

export class Session {
  readonly root: string;
  readonly config: AiShellConfig;
  readonly row: SessionRow;
  profile: ProjectProfile;
  pendingTaskDescriptions: string[] = [];

  constructor(
    root: string,
    config: AiShellConfig,
    row: SessionRow,
    profile: ProjectProfile,
  ) {
    this.root = root;
    this.config = config;
    this.row = row;
    this.profile = profile;
  }

  get id(): string {
    return this.row.id;
  }

  get projectName(): string {
    return this.config.projectName ?? this.profile.name;
  }

  static async create(
    cwd: string,
    store: MemoryStore,
  ): Promise<Session> {
    const root = await findProjectRoot(cwd);
    const config = loadConfig(root);
    const profile = await scanRepository(root);
    const projectName = config.projectName ?? profile.name;
    const row = store.getOrCreateSession(root, projectName);
    store.saveProjectProfile(row.id, profile);
    return new Session(root, config, row, profile);
  }

  async refreshProfile(store: MemoryStore): Promise<void> {
    this.profile = await scanRepository(this.root);
    store.saveProjectProfile(this.id, this.profile);
  }
}

async function findProjectRoot(start: string): Promise<string> {
  const git = simpleGit(start);
  if (await git.checkIsRepo()) {
    const top = await git.revparse(["--show-toplevel"]);
    return path.resolve(top.trim());
  }
  return path.resolve(start);
}

export function formatPrompt(session: Session): string {
  const stacks = session.profile.stacks.join(", ");
  return `AI-TEAM (${session.projectName} | ${stacks}) > `;
}
