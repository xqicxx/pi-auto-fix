
// 确保标签存在（自动创建缺失标签）
import { ghRaw } from "./gh.mjs";

const KNOWN = [
  ["ai-triaged", "AI 已评估", "0E8A16"],
  ["ai-worth-fixing", "AI 判定值得修", "1D76DB"],
  ["ai-approved", "AI review 通过", "0E8A16"],
  ["ai-needs-work", "AI review 需修改", "B60205"],
  ["ai-wontfix", "AI 判定不修", "6E7781"],
  ["ai-needs-info", "AI 判定信息不足", "D4C5F9"],
];

let ensured = false;

export async function ensureLabels() {
  if (ensured) return;
  for (const [name, desc, color] of KNOWN) {
    try {
      await ghRaw(["-R", process.env.AUTOFIX_REPO || "xqicxx/pi-discord-openclaw", "label", "create", name, "--description", desc, "--color", color, "--force"]);
      console.log("label created:", name);
    } catch { /* 已存在 */ }
  }
  ensured = true;
}
