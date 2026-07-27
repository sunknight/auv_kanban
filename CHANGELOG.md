# Changelog

本项目所有面向用户的版本变动记录。格式参考 [Keep a Changelog](https://keepachangelog.com/)。

## [0.2.5] - 2026-07-27
### Added
- Web 界面右上角新增「帮助」按钮，点击可查看快速入门与完整使用说明。
- 新增 `kanban uncheck` 命令，用于明确取消子任务勾选。

### Changed
- `kanban check` 不再翻转勾选状态，改为明确勾选（已是勾选态再执行不会变化），避免误操作。
