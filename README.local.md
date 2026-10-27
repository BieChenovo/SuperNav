# SuperNav-v2

基于官方提交 `89f8f5d2ea8f5e5409540e16ac2d74faab40bcc8`。OVON 两种执行器各 120 条已完成；工作目录保留 Learned 参数修复，并按用户 2026-10-27 确认范围对原版 Geo prompt 做局部删除。本轮仅运行原 OVON 相同的 120 条 Geo 任务，记录见 `data/runs/ovon_geo/`。

## 保留的修改

**Learned 参数能够实际生效。** 当前配置为 `NAV_LOCALNAV_DONE_THRESHOLD=0.1`、`NAV_LOCALNAV_EXEC_ACTIONS=3`。MCP 进程将选中 arm 的这两个值随内部导航请求传给 bridge，控制循环按请求值执行；未传值时保留原有环境/默认值，不污染下一次请求。bridge 日志记录实际消费的值。停止概率阈值是概率，不是米；动作数表示每次重新规划后执行的预测增量前缀。

Geo 沿用官方模板选择与回退流程。在原版 `global_task/prompts/common.md` 中删除 junction 段落及不可用的后退/LocateAnything 动作类别；在原版 `main/prompts/movement_visual_point.md` 中删除 forward/depth 工具建议及无关工具禁用句。其他原有动作说明完整保留，未增加专用模板。精确差异、120 条任务核验及 6 个原版 Skill 文件哈希见 `data/runs/ovon_geo/manifest.json` 和该目录的 `source.diff`。

四份全局/局部 Skill、停止/最后接近规则、类别约束和 Learned 提示词已恢复到上述官方提交，逐文件字节核对一致。没有保留其他导航策略修改。

## 请求容量

`NAV_LOCALNAV_MAX_REQUEST_BYTES` 限制 bridge 发给 Learned policy 服务的一次 JSON/HTTP 请求的字节数，客户端和服务端分别检查。请求包含 JPEG 后经 Base64 编码的历史 RGB、目标 RGB、选点和采样参数。超过客户端限制报 `request_too_large`；超过服务端限制返回 HTTP 413。

该限制不是 VLM 上下文窗口、token 预算或显存配额。提高上限只允许更大的数据包，不会自行新增历史帧、提高分辨率或修改记忆选择策略。本次按“其他修改回退”的要求恢复原版 **8 MiB** 默认值，未保留 32 MiB 调整。

## 配置与验证

`configs/reproduction/` 保留相同的 HM3Dv2 200 条、OVON 120 条任务清单及两种执行器配置。模型仍配置为 GPT-5.6 Terra / high；现有环境、权重和共享场景继续复用。之前两种执行器各 120 条的结果见 `data/runs/ovon/RESULTS.md`，该轮 Geo 使用已回退的专用模板，历史冻结代码与全部结果继续保留。本轮 `data/runs/ovon_geo/` 只评测 Geo OVON 120 条，不运行 HM3Dv2 或 Learned。

新增测试 `tests/test_localnav_parameter_binding.py` 通过独立子进程运行真实局部控制循环，使用确定性的 CPU adapter/policy 替身验证实际动作和停止行为；不加载仿真器、GPU 模型或调用 VLM。评测前参数传递、请求间隔离、非法配置处理及相关原有测试共 **67 项通过**。评测前四组提示词与原版文件哈希核对见 `data/runs/checks/validation.json`；该记录不代表 Geo 回退后的模板状态。

更早的混合修改版（`data/runs/eval`）已按要求删除，清理记录在 `data/runs/control/cleanup.json`。随后完成的“大幅精简 Geo prompt”实验仍在 `data/runs/ovon` 中保留为历史记录；该目录同时包含当前采用的 Learned 原始记录，不能整目录删除。

当前统一的 v2 结果入口为 `results/v2/README.md`：Geo 使用本轮局部删改后的 120 条，Learned 使用参数修复后的 120 条，合计 240 条任务/执行器记录，明确来自两次运行。逐任务 CSV、独立评分 JSON 和来源校验见同目录。本轮 Geo 已全部完成，8 路 GPU stress 已恢复并核验。
