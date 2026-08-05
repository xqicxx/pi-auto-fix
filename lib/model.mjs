// 模型调用 — opencode-go (DeepSeek V4 Flash) 直连，OpenAI 兼容
// 低成本：输入 $0.14/M 输出 $0.28/M，缓存 $0.0028/M
import { readFileSync } from "node:fs";

const API_BASE = "https://opencode.ai/zen/go/v1/chat/completions";
const MODEL = process.env.AUTOFIX_MODEL || "deepseek-v4-flash";

// Gemini review 引擎：走 OpenRouter（本机直连 generativelanguage.googleapis.com 被地域封锁），
// 模型为 google/gemini-2.5-flash —— 与修复引擎（DeepSeek）独立，避免自审偏差
const GEMINI_BASE = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_MODEL = process.env.AUTOFIX_REVIEW_MODEL || "google/gemini-2.5-flash";

function openrouterKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (key) return key;
  try {
    const auth = JSON.parse(readFileSync(process.env.HOME + "/.pi/agent/auth.json", "utf8"));
    return auth["openrouter"]?.key;
  } catch {
    throw new Error("no openrouter key (set OPENROUTER_API_KEY)");
  }
}

/** 调用 Gemini（经 OpenRouter），返回文本。超时 120s，重试 3 次。 */
export async function askGemini(system, user, { maxTokens = 8192, temperature = 0.2 } = {}) {
  const key = openrouterKey();
  const body = {
    model: GEMINI_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: maxTokens,
    temperature,
  };
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120_000);
      const resp = await fetch(GEMINI_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        lastErr = new Error(`HTTP ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200)}`);
        continue;
      }
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) throw new Error("empty gemini output");
      return text.trim();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastErr ?? new Error("gemini call failed");
}

function apiKey() {
  const key = process.env.OPENCODE_GO_API_KEY;
  if (key) return key;
  try {
    const auth = JSON.parse(readFileSync(process.env.HOME + "/.pi/agent/auth.json", "utf8"));
    return auth["opencode-go"]?.key;
  } catch {
    throw new Error("no opencode-go API key (set OPENCODE_GO_API_KEY)");
  }
}

/** 调用模型，返回文本。超时 90s，重试 2 次。
 * thinking: "default" | "disabled" | "low"（默认 default 走模型自身）
 * 注意：deepseek-v4-flash max 思考下复杂任务可能思考耗尽输出预算 → content 为空，
 * 结构化 JSON 任务建议 thinking:"disabled" 或 "low"。
 */
export async function ask(system, user, { maxTokens = 4096, temperature = 0.2, thinking = "default" } = {}) {
  const key = apiKey();
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: maxTokens,
    temperature,
  };
  if (thinking === "disabled") body.thinking = { type: "disabled" };
  else if (thinking === "low") body.thinking = { type: "enabled" }, body.reasoning_effort = "low";
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90_000);
      const resp = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        lastErr = new Error(`HTTP ${resp.status}: ${detail.slice(0, 200)}`);
        continue;
      }
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) throw new Error("empty model output");
      return text.trim();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastErr ?? new Error("model call failed");
}

/** 从模型输出中提取 JSON（容忍围栏/前后缀/尾部杂文）。 */
export function extractJSON(text) {
  let s = text.trim();
  if (s.startsWith("```")) s = s.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "");
  const i = s.indexOf("{");
  if (i < 0) return null;
  // 平衡括号扫描：找到第一个 { 对应的匹配 }（容忍 JSON 后有杂文）
  let depth = 0, inStr = false, esc = false, j = -1;
  for (let k = i; k < s.length; k++) {
    const ch = s[k];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === "\"") inStr = false;
      continue;
    }
    if (ch === "\"") { inStr = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { j = k; break; } }
  }
  if (j < 0) return null;
  try {
    return JSON.parse(s.slice(i, j + 1));
  } catch {
    try { return JSON.parse(s); } catch { return null; }
  }
}

/** 防提示注入：剥离试图改变行为的指令痕迹（保留原文用于报告）。 */
export function sanitize(s) {
  if (!s) return "";
  return String(s)
    .replace(/<[^>]*>/g, "")
    .replace(/\[\[.*?\]\]/gs, "")
    .slice(0, 4000);
}
