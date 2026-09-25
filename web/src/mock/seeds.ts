export interface CtxUsageSegment {
  key: string;
  label: string;
  color: string;
  tokens: number;
  direct: number;
}

export const SLASH_COMMANDS = [
  { id: "plan", label: "plan", hint: "开启计划模式" },
  { id: "goal", label: "goal", hint: "设置持续追求的目标" },
];
