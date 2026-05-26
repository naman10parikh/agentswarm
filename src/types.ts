export interface SwarmConfig {
  swarm: {
    name: string;
    session: string;
    poll_interval: number;
    max_runtime: number;
    idle_timeout: number;
  };
  ceo: {
    prompt: string;
    model: "opus" | "sonnet" | "haiku";
    context?: string[];
  };
  vps: VpConfig[];
}

export interface VpConfig {
  role: string;
  pane: number;
  prompt: string;
  model: "opus" | "sonnet" | "haiku";
  workdir: string;
  depends_on?: string[];
  outputs?: string[];
}

export type VpStatus =
  | "pending"
  | "deploying"
  | "running"
  | "idle"
  | "done"
  | "failed";

export interface VpState {
  config: VpConfig;
  paneIndex: number;
  status: VpStatus;
  deployedAt: string | null;
  doneAt: string | null;
  lastActivity: number;
  outputLines: string[];
}

export interface SwarmState {
  config: SwarmConfig;
  startedAt: string;
  sessionName: string;
  vps: VpState[];
  pollCount: number;
  allDone: boolean;
}
