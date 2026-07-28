# Changelog

本项目所有面向用户的版本变动记录。格式参考 [Keep a Changelog](https://keepachangelog.com/)。

## [0.3.0] - 2026-07-29
### Added
- `/kanban run` 新增 `--design` 参数（自然语言「预研/做设计/做方案」亦可），可对任务只做设计、产出设计与计划文档后停下待实施；下次再执行同一任务时会读取已有设计直接进入实施，不重复设计。
- 执行任务时，设计文档（`design.md`、`plan.md`）改为在设计阶段即生成保存，而非等到任务收尾才写。

### Changed
- 任务详情里的「描述」输入框现在随输入内容自动调高，到一定高度后停止增长并改为滚动，不再需要手动拖拽调整。

## [0.2.6] - 2026-07-28
### Added
- `kanban skill install` 现在可以把 Skill 装到 ZCode 以外的智能体（如 Claude、Codex、Gemini），不再只装 ZCode。
- 新增 `--agent` 指定要装的智能体（如 `--agent claude,codex`）、`--list` 查看本机已检测到的智能体、`--all` 给全部已知智能体安装。

### Changed
- `kanban skill install` 默认改为自动检测本机已安装的智能体并全部装上（此前固定只装 ZCode）。

## [0.2.5] - 2026-07-27
### Added
- Web 界面右上角新增「帮助」按钮，点击可查看快速入门与完整使用说明。
- 新增 `kanban uncheck` 命令，用于明确取消子任务勾选。

### Changed
- `kanban check` 不再翻转勾选状态，改为明确勾选（已是勾选态再执行不会变化），避免误操作。
