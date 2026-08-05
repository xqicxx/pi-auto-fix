// 幂等状态存储 — 记录每个 issue/PR 已执行到的阶段，防止重复处理
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const STATE_FILE = process.env.AUTOFIX_STATE || "/home/ubuntu/pi-auto-fix/state.json";

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    cache = { issues: {}, prs: {} };
  }
  return cache;
}

function save() {
  mkdirSync(require_dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(cache, null, 2));
}

function require_dirname(p) {
  return p.split("/").slice(0, -1).join("/");
}

/** 取 issue 状态；未记录返回 null。 */
export function issueState(n) {
  return load().issues[String(n)] ?? null;
}

/** 记录 issue 阶段：triage-done / fix-started / fix-pr-opened / done */
export function setIssue(n, s) {
  load().issues[String(n)] = { ...s, ts: Date.now() };
  save();
}

/** 取 PR 状态；未记录返回 null。 */
export function prState(n) {
  return load().prs[String(n)] ?? null;
}

/** 记录 PR 阶段：review-done / approve / needs-work / merged */
export function setPR(n, s) {
  load().prs[String(n)] = { ...s, ts: Date.now() };
  save();
}
