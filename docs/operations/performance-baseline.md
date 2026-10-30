# 性能基线

可重复的本地热路径基准，用于大文件重构（`memory/store.py`、`session/manager.py`、`config/loader.py`）前后的对照。模型调用延迟不在测量范围——它主导端到端耗时但不受本地重构影响。

## 运行方式

```bash
uv run python scripts/bench.py                     # 运行并打印表格
uv run python scripts/bench.py --json bench.json   # 同时保存原始结果
uv run python scripts/bench.py --quick             # 缩小规模冒烟
```

数字与机器相关，只与同机器的运行结果对比。

## 基线记录

### 2026-10-30（Windows 11, Python 3.12.9, dev-chenhj@54fb859）

| benchmark | scale | mean | per-op(mean) |
|---|---|---|---|
| config.load_config | x50 | 349.7 ms | 6.99 ms |
| memory.add (sequential) | x200 | 1.577 s | 7.89 ms |
| memory.search_keyword | 20q@200 | 9.49 ms | 474 µs |
| memory.search_scored | 20q@200 | 13.99 ms | 699 µs |
| memory.get_snapshot | @200 | 1.30 ms | 1.30 ms |
| memory.cold_load | @200 | 3.70 ms | 3.70 ms |
| session.get_or_create | x100 | 8.60 ms | 86 µs |
| session.save | x100 | 272.1 ms | 2.72 ms |

### 初步观察

- **memory.add ~7.9 ms/条**：每次 add 都走文件锁 + 去重扫描 + 全量 JSON 重写。条目数增长时单条成本上升（200 条时已高于 40 条时的 ~5.7 ms），是 `store.py` 重构时最值得关注的路径。
- **session.save ~2.7 ms/次**：每会话全量 JSON 写入。会话数多时 manager 的批量保存会线性放大。
- **config.load_config ~7 ms/次**：每次 CLI 调用都会执行（打包默认 + 用户 yaml 合并 + Pydantic 校验）。对 CLI 冷启动有感知，但单次绝对值尚可。
- **搜索路径健康**：keyword/scored 搜索在 200 条规模下均为亚毫秒级，无需优先处理。

### 重构验收标准

对上述任一基准，重构后同机器对比：per-op mean 不得劣化超过 10%，理想情况下应有可测量改善。
