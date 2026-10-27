# SuperNav

此仓库同步本地 SuperNav-v2 源码和可独立查看的评测结果。

Windows 克隆或拉取后，双击 `打开可视化.cmd`，或直接用 Edge / Chrome 打开 `review/index.html`。回放不需要 Python、GPU、服务器连接或 VLM 调用。必须完整拉取 `review/`，图像通过相对路径读取。

- `review/v2/`：本轮 OVON，Geo / Learned 各 120 条，共 240 条。
- `review/history/`：原版 OVON 各 120 条、HM3Dv2 各 200 条，共 640 条。
- `results/`：评分汇总及同 episode 对照 CSV / JSON。提示词与 Skill 快照保存在每条回放中。
- 根目录源码：当前 SuperNav-v2 工作副本。Learned 保留参数传递修复并采用 0.1 / 3；Geo prompt 已回退。回放使用评测时真实快照，不以当前源码覆盖。源码使用说明见 `README.upstream.md` 和 `README.local.md`。

没有同步仿真场景资产、数据集标注全集、模型权重、环境、原始模型 session 或认证文件。图像是评测实际返回给 Agent 的 RGB；只展示公开模型说明。导航运行仍需在服务器配置资产与环境，Windows 的离线回放与运行导航是两种操作。

本轮 v2 已完成；原版与本轮使用的 Codex CLI 不同，单轮对照不等于稳定因果结论。两条指定不可达 OVON 任务按相同规则赠分。
