# SuperNav v2

新增：[InteriorGS 四版本与论文比较](results/interiorgs/README.md)。已完成 400/400 条；Windows 双击 `打开可视化.cmd` 后选择 **InteriorGS**。支持相同 episode 配对、两种距离阈值及逐步回放。

当前 v2：Geo 采用局部删除 junction 和不可用工具提示后的 120 条结果，Learned 采用参数传递修复、实际使用 0.1 / 3 的 120 条结果。两组来自分别完成的两次运行，全部 Skill 保持官方原版。

| 方法 | 0.25 m SR | 0.25 m SPL | 1 m SR | 1 m SPL |
| --- | ---: | ---: | ---: | ---: |
| Geo | 53.33%（64/120） | 0.3065 | 64.17%（77/120） | 0.3860 |
| Learned | 57.50%（69/120） | 0.1412 | 66.67%（80/120） | 0.1602 |

Windows 完整拉取 `results` 分支后，双击 `打开可视化.cmd`，或直接用 Edge / Chrome 打开 `review/index.html`。回放无需 Python、GPU、服务器连接或 VLM 调用；图像使用相对路径。

- [完整结果、原版与论文对照](results/v2/README.md)
- [逐任务 CSV](results/v2/episodes.csv)
- `review/v2/`：当前 Geo / Learned 各 120 条，共 240 条。
- `review/history/`：原版 OVON 各 120 条、HM3Dv2 各 200 条，共 640 条。
- 根目录：当前 v2 代码；[代码与原版对比](https://github.com/BieChenovo/SuperNav/compare/main...v2)。源码使用说明见 `README.upstream.md` 和 `README.local.md`。

上轮大幅精简 Geo prompt 的 44.17% / 60.83% 不再作为当前 v2，Git 旧提交和服务器原始记录保留用于追溯。当前版本未重跑 Learned，也没有新增 HM3Dv2 评测。原版与后续实验使用不同 Codex CLI，单轮对照不能当作稳定因果结论。

回放仅包含实际返回给 Agent 的 RGB、公开说明及评测快照。仿真场景、模型权重、环境、原始模型 session 和认证文件不在此次同步范围。
