---
name: write-agentmemory-skill
description: 说明编写或更新 agentmemory skill 的内部格式和规则。用于新增 skill、重构已有 skill，或审查 skill 贡献是否一致时。
user-invocable: true
---

agentmemory skills 使用统一的分层格式，保证内容易扫读、准确并且保持最新。新增或修改时请严格匹配这个格式。

## 目录结构

```text
plugin/skills/<name>/
  SKILL.md      (必需，少于 100 行)
  REFERENCE.md  (可选，密集事实；数据表应自动生成)
  EXAMPLES.md   (可选，示例对话)
```

## SKILL.md 规则

- Frontmatter：`name`、`description`、可选 `argument-hint` 和 `user-invocable`。只有用户会作为斜杠命令运行的技能才设为 `user-invocable: true`；参考和知识技能设为 `false`。
- Description 是代理决定是否加载技能时看到的唯一内容。第一句说明能力，第二句以“用于”开头列出具体触发条件。保持与兄弟技能区分，长度不超过 1024 字符。
- 正文顺序：快速开始、原则、工作流（含决策点）、反模式、检查清单、另见、Reference 或 Troubleshooting 指针。
- 保持在 100 行以内。密集事实放到 REFERENCE.md，示例放到 EXAMPLES.md。
- 交叉引用只链接一层。共享恢复步骤放到 `../_shared/TROUBLESHOOTING.md`，不要内联。

## 保持最新

工具名、参数、REST endpoints、环境变量、connect adapters、hook events 等源代码事实必须生成，不能手写。修改源代码后运行 `npm run skills:gen`。CI 运行 `npm run skills:check` 检查漂移。

## 风格

不要加入无关外部产品名。不要用 emoji。不要填充句。直接说明事情，然后停止。

## 检查清单

- Description 包含具体触发条件。
- SKILL.md 少于 100 行。
- 没有易过期声明，也没有重复 troubleshooting 块。
- 有具体例子；生成事实来自 generator。
- 交叉引用能解析，且只跳一层。
