// 模型调用 — opencode-go (DeepSeek V4 Flash) 直连，OpenAI 兼容
// 低成本：输入 $0.14/M 输出 $0.28/M，缓存 $0.0028/M
import { readFileSync } from "node:fs";

const API_BASE = "https://opencode.ai/zen/go/v1/chat/completions";
const MODEL = process.env.AUTOFIX_MODEL || "deepseek-v4-flash";

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

/** 调用模型，返回文本。超时 90s，重试 2 次。 */
export async function ask(system, user, { maxTokens = 4096, temperature = 0.2 } = {}) {
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

/** 从模型输出中提取 JSON（容忍围栏/前后缀）。 */
export function extractJSON(text) {
  let s = text.trim();
  if (s.startsWith("```")) s = s.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "");
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try {
    return JSON.parse(s);
  } catch {
    return null;
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
