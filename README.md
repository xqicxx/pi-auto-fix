# pi-auto-fix

🤖 **全自动 GitHub Issue 闭环 bot** — 评估 → 回复 → 修复 → Review → 合并，无需人工监督。

基于 **pi 生态**（opencode-go DeepSeek API + gh CLI），**零 npm 依赖**、**内存 ~12MB**、**不占 pi 会话**、不吃 GitHub Actions 免费额度。

## 核心流程（每 60s 轮询）

```
新 Issue
  │
  ▼
① AI Triage 评估（deepseek-v4-flash）
  ├─ spam → 关闭 + 评论
  ├─ needs-info → 打标 + 请求补充
  ├─ wontfix → 打标 + 关闭
  └─ worth-fixing → 打 ai-worth-fixing + 评论
        │
        ▼
② AI 自动修复（fix-worker，AUTOFIX_FIX=1 时启用）
  ├─ clone 仓库 → 模型生成补丁 → 应用
  ├─ 跑测试 → 开分支 → 推 PR → 评论回链
  └─ PR 标题含 "fix #N"，自动跳过已修复
        │
        ▼
③ AI Review（新 PR / 更新 PR）
  ├─ approve → 打 ai-approved + 评论
  └─ changes → 打 ai-needs-work + 列出阻断项
        │
        ▼
④ 自动合并（有 ai-approved）
  ├─ 等 CI 完成（最长 3 分钟）
  ├─ CI 失败 → 评论告知，不合并
  └─ 通过 → merge + 删除分支 + 评论 ✅
```

## 快速开始

```bash
# 1. 克隆
git clone https://github.com/xqicxx/pi-auto-fix && cd pi-auto-fix

# 2. 配置环境变量（或写进 service 文件）
export AUTOFIX_REPO="owner/repo"          # 目标仓库
export OPENCODE_GO_API_KEY="sk-..."        # opencode-go key（缺省读 ~/.pi/agent/auth.json）
export AUTOFIX_FIX=1                       # 1=启用自动修复，0=只 triage+review+merge
export AUTOFIX_POLL_SECONDS=60             # 轮询间隔

# 3. 安装 systemd 服务
sudo cp pi-autofix.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pi-autofix

# 4. 查看状态
systemctl status pi-autofix
journalctl -u pi-autofix -f
```

## 手动运行

```bash
# 前台跑一次完整循环（调试用）
node bot.mjs

# 单独修复一个 issue（跳过等待轮询）
AUTOFIX_ISSUE=12 AUTOFIX_FIX=1 node fix-worker.mjs
```

## 架构

| 文件 | 职责 |
|---|---|
| `bot.mjs` | 主循环：triage → review → merge → fix 调度（幂等） |
| `fix-worker.mjs` | 修复执行器：clone → 生成补丁 → 测试 → 开 PR |
| `lib/gh.mjs` | gh CLI 封装（issue/PR/label/diff/merge） |
| `lib/model.mjs` | opencode-go API 调用（重试/JSON 提取/防注入） |
| `lib/state.mjs` | 幂等状态（state.json，防重复处理） |
| `lib/labels.mjs` | 自动创建 ai-* 标签 |

## 标签体系

| 标签 | 含义 |
|---|---|
| `ai-triaged` | 已评估 |
| `ai-worth-fixing` | 判定值得修 |
| `ai-needs-work` | Review 需修改 |
| `ai-approved` | Review 通过，待合并 |
| `ai-wontfix` | 判定不修 |
| `ai-needs-info` | 信息不足 |

## 安全设计

- 🛡️ **防提示注入**：issue/PR 内容可能含恶意指令，prompt 明确忽略 + 输出 sanitize
- 🔒 **最小权限**：只操作目标仓库；PR 永远走分支，绝不直推 master
- 💾 **幂等**：state.json 记录每 issue/PR 阶段，重启/重复轮询不重复处理
- 🧪 **CI 门禁**：合并前等 checks 完成，失败不合并
- 🏷️ **全留痕**：每步都在 GitHub 评论可见

## 成本

| 项 | 量级 |
|---|---|
| 模型 | deepseek-v4-flash（输入 $0.14/M，输出 $0.28/M，缓存 $0.0028/M） |
| 内存 | ~12MB 常驻 |
| 依赖 | 仅 gh CLI + Node ≥18（fetch 内置） |

## 相关

- 问题反馈 / PR：本仓库 issue
- 灵感来源：pi-discord-openclaw（Discord 桥接）的 issue 自动闭环需求
