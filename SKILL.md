---
name: pi-auto-fix
description: >
  全自动 GitHub Issue 闭环 bot —— 自动评估 issue（triage）、回复评论、打标签、
  自动修复开 PR、AI review 代码、自动合并、关闭 issue。后台常驻（systemd），
  零 npm 依赖、内存 ~12MB、不占 pi 会话、不吃 GitHub Actions 额度。
  当用户要求"自动处理 issue / 自动化修复 / GitHub bot 闭环 / 无人值守修复 /
  自动 review 合并"时使用此 skill。
command: autofix
---

# pi-auto-fix — 全自动 GitHub Issue 闭环

## 是什么

一个独立的后台服务（Node.js + gh CLI + opencode-go DeepSeek API），轮询 GitHub，
对仓库的 issue/PR 执行完整的 AI 闭环：

```
issue → triage 评估 → 回复+打标 → (修复开 PR) → AI review → 打标 → 合并 → 关闭
```

与 GitHub Actions 方案的区别：**本地常驻**，不消耗 Actions 免费额度；**不跑 pi
进程**，不占用当前会话；**零 npm 依赖**，内存极小。

## 何时使用

- 用户要"自动评估/回复/修复 issue"
- 用户要"GitHub bot 自动 review 代码并合并"
- 用户要"无人值守的全自动闭环"
- 用户要"后台挂着，以后有 issue 自动处理"

## 文件结构

```
pi-auto-fix/
├── bot.mjs            # 主循环：triage → review → merge → fix 调度
├── fix-worker.mjs     # 修复执行器：clone → 生成补丁 → 测试 → 开 PR
├── pi-autofix.service # systemd 单元文件
├── lib/
│   ├── gh.mjs         # gh CLI 封装
│   ├── model.mjs      # opencode-go API（重试/JSON 提取/防注入）
│   ├── state.mjs      # 幂等状态
│   └── labels.mjs     # 自动创建 ai-* 标签
└── README.md
```

## 安装（首次）

```bash
# 代码位置（本机已装）
cd /home/ubuntu/pi-auto-fix

# 配置（service 文件里的 Environment 改目标仓库）
#   AUTOFIX_REPO=owner/repo
#   AUTOFIX_FIX=1          # 1=启用自动修复（默认关）
#   AUTOFIX_POLL_SECONDS=60

# 安装并启动
sudo cp pi-autofix.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pi-autofix
```

## 日常操作

| 操作 | 命令 |
|---|---|
| 看状态 | `systemctl status pi-autofix` |
| 看日志 | `journalctl -u pi-autofix -f` |
| 重启 | `sudo systemctl restart pi-autofix` |
| 停 | `sudo systemctl stop pi-autofix` |
| 手动修一个 issue | `AUTOFIX_ISSUE=12 node fix-worker.mjs` |

## 配置项

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `AUTOFIX_REPO` | xqicxx/pi-discord-openclaw | 目标仓库 |
| `AUTOFIX_FIX` | 0 | 1=启用自动修复（写代码开 PR，风险高） |
| `AUTOFIX_POLL_SECONDS` | 60 | 轮询间隔 |
| `AUTOFIX_MODEL` | deepseek-v4-flash | 模型 |
| `OPENCODE_GO_API_KEY` | 读 ~/.pi/agent/auth.json | opencode-go key |

## 工作流细节

1. **Triage**：对无标签 open issue 调模型评估 → spam/wontfix 关闭，needs-info
   请求补充，worth-fixing 打 `ai-worth-fixing` 并评论
2. **Fix**（可选）：对 worth-fixing 且无对应 PR 的 issue → clone → 模型生成
   补丁 → 应用 → 跑测试 → 开分支推 PR（标题 `fix #N`）
3. **Review**：对 open PR（非 draft）取 diff → 模型审查 → approve 打
   `ai-approved`，changes 打 `ai-needs-work` + 阻断项列表
4. **Merge**：对 ai-approved 且 mergeable 的 PR → 等 CI（≤3min）→ 通过则
   merge + 删分支 + 评论 ✅

## 安全注意事项

- 自动修复（AUTOFIX_FIX=1）会真实写代码并推 PR —— 启用前确认仓库有测试、
  且合并前有 AI review 把关（本流程默认就有）
- 防提示注入已内置（prompt 声明 + 输出 sanitize）
- state.json 在仓库目录，是幂等关键，勿删
