// gh CLI 封装 — 所有 GitHub 操作走 gh，零额外依赖
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const REPO = process.env.AUTOFIX_REPO || "xqicxx/pi-discord-openclaw";

export async function gh(args, opts = {}) {
  const { data, input } = opts;
  const full = ["-R", REPO, ...args];
  const { stdout, stderr } = await exec("gh", full, {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
    input,
    encoding: "utf8",
  });
  if (stderr && !opts.allowStderr) {
    // gh 常把进度写到 stderr，只有非空 stdout 且非 JSON 场景才可能报错
  }
  return data ? JSON.parse(stdout) : stdout.trim();
}

export const ghRaw = async (args) => {
  const { stdout } = await exec("gh", args, { maxBuffer: 64 * 1024 * 1024, timeout: 120_000, encoding: "utf8" });
  return stdout;
};

// ---- 常用操作 ----

export async function listOpenIssues() {
  return gh(["issue", "list", "--state", "open", "--json", "number,title,body,labels,comments,createdAt,updatedAt"], { data: true });
}

export async function closePR(n) {
  return gh(["pr", "close", String(n), "-R", REPO], { data: false });
}

export async function prReviews(n) {
  return gh(["pr", "view", String(n), "--json", "reviews", "-q", ".reviews"], { data: true }) ?? [];
}

export async function listOpenPRs() {
  return gh(["pr", "list", "--state", "open", "--json", "number,title,body,headRefName,baseRefName,labels,comments,mergeable,isDraft"], { data: true });
}

export async function getIssue(n) {
  return gh(["issue", "view", String(n), "--json", "number,title,body,labels,comments,state"], { data: true });
}

export async function getPR(n) {
  return gh(["pr", "view", String(n), "--json", "number,title,body,headRefName,baseRefName,labels,comments,state,mergeable,isDraft,reviewDecision"], { data: true });
}

export async function commentIssue(n, body) {
  return gh(["issue", "comment", String(n), "--body", body]);
}

export async function commentPR(n, body) {
  return gh(["pr", "comment", String(n), "--body", body]);
}

export async function addLabels(what, n, labels) {
  // 用 REST API 添加标签（gh pr edit 的 GraphQL projects 字段有 deprecation 噪音）
  return ghRaw(["api", "-X", "POST", `repos/${REPO}/issues/${n}/labels`, "-f", `labels[]=${labels.join(",")}`]);
}

export async function closeIssue(n) {
  return gh(["issue", "close", String(n), "--reason", "completed"]);
}

export async function mergePR(n) {
  return gh(["pr", "merge", String(n), "--merge", "--delete-branch"]);
}

export async function prDiff(n) {
  return ghRaw(["-R", REPO, "pr", "diff", String(n)]);
}

export async function prChecks(n) {
  // gh pr checks 不支持 --json；改用 REST API
  const { stdout } = await exec("gh", ["api", `repos/${REPO}/commits/HEAD/check-runs`], { encoding: "utf8" });
  return [];
}

export async function prStatusChecks(n) {
  // 查 PR head commit 的 check-runs
  try {
    const pr = await gh(["pr", "view", String(n), "--json", "headRefOid"], { data: true });
    const sha = pr.headRefOid;
    const { stdout } = await exec("gh", ["api", `repos/${REPO}/commits/${sha}/check-runs`], { encoding: "utf8" });
    const data = JSON.parse(stdout);
    return (data.check_runs ?? []).map((c) => ({ name: c.name, state: c.status, conclusion: c.conclusion }));
  } catch {
    return [];
  }
}

export async function repoRoot() {
  const { stdout } = await exec("gh", ["repo", "clone", REPO], { timeout: 120_000, encoding: "utf8" });
  return stdout;
}

export function ghLoginUser() {
  return gh(["api", "user", "--jq", ".login"]);
}
