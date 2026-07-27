# Changelog

本项目所有面向用户的版本变动记录。格式参考 [Keep a Changelog](https://keepachangelog.com/)。

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
