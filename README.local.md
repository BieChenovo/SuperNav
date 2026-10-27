# SuperNav-v2

基于官方提交 `89f8f5d2ea8f5e5409540e16ac2d74faab40bcc8`。OVON 两种执行器各 120 条已完成；按用户 2026-10-27 指令，工作目录现在仅保留 Learned 参数修复，Geo 提示词已回退至官方原版，等待逐项分析。

## 保留的修改

**Learned 参数能够实际生效。** 当前配置为 `NAV_LOCALNAV_DONE_THRESHOLD=0.1`、`NAV_LOCALNAV_EXEC_ACTIONS=3`。MCP 进程将选中 arm 的这两个值随内部导航请求传给 bridge，控制循环按请求值执行；未传值时保留原有环境/默认值，不污染下一次请求。bridge 日志记录实际消费的值。停止概率阈值是概率，不是米；动作数表示每次重新规划后执行的预测增量前缀。

Geo 新增的 global_task `common_visual_point.md`、`movement_visual_point.md` 及对应安装资源条目已移除，恢复官方模板选择与回退流程。原版提示词中的工具不一致问题并未因此解决；下一次修改应单项验证，不重新整体改写模板。

四份全局/局部 Skill、停止/最后接近规则、类别约束和 Learned 提示词已恢复到上述官方提交，逐文件字节核对一致。没有保留其他导航策略修改。

## 请求容量

`NAV_LOCALNAV_MAX_REQUEST_BYTES` 限制 bridge 发给 Learned policy 服务的一次 JSON/HTTP 请求的字节数，客户端和服务端分别检查。请求包含 JPEG 后经 Base64 编码的历史 RGB、目标 RGB、选点和采样参数。超过客户端限制报 `request_too_large`；超过服务端限制返回 HTTP 413。

该限制不是 VLM 上下文窗口、token 预算或显存配额。提高上限只允许更大的数据包，不会自行新增历史帧、提高分辨率或修改记忆选择策略。本次按“其他修改回退”的要求恢复原版 **8 MiB** 默认值，未保留 32 MiB 调整。

## 配置与验证

`configs/reproduction/` 保留相同的 HM3Dv2 200 条、OVON 120 条任务清单及两种执行器配置。模型仍配置为 GPT-5.6 Terra / high；现有环境、权重和共享场景继续复用。OVON 两种执行器各 120 条已完成，结果见 `data/runs/ovon/RESULTS.md`。该轮 Geo 使用回退前的专用模板；已冻结的代码、运行 manifest 与全部结果保留，不以当前工作目录覆盖历史版本。回退核验见 `data/runs/checks/geo_rollback.json`，本次不启动新评测。

新增测试 `tests/test_localnav_parameter_binding.py` 通过独立子进程运行真实局部控制循环，使用确定性的 CPU adapter/policy 替身验证实际动作和停止行为；不加载仿真器、GPU 模型或调用 VLM。评测前参数传递、请求间隔离、非法配置处理及相关原有测试共 **67 项通过**。评测前四组提示词与原版文件哈希核对见 `data/runs/checks/validation.json`；该记录不代表 Geo 回退后的模板状态。

已删除上次 v2 在项目归档和 SSD 上的结果、日志、轨迹、图像及冻结运行副本。原版实验结果和公共数据/权重保留。SSD 仅保留当前 gpu_stress 必需的守护状态与恢复信息；清理记录在 `data/runs/control/cleanup.json`。
