# 后台服务

Codex Pro Gateway 可注册为系统服务，由操作系统负责进程管理、自动重启和日志收集。

---

## 快速部署

```bash
# 一键安装并启动
codex-pro gateway install
codex-pro gateway start
```

`install` 命令会根据当前操作系统自动选择服务管理器：

| 操作系统 | 服务管理器 | 单元文件位置 |
|---------|-----------|-------------|
| Linux | systemd (user scope) | `~/.config/systemd/user/codex-pro.service` |
| macOS | launchd | `~/Library/LaunchAgents/com.codex-pro.plist` |

---

## systemd (Linux)

### 服务单元文件

`codex-pro gateway install` 生成的 systemd 用户级 unit 文件：

```ini
# ~/.config/systemd/user/codex-pro.service
[Unit]
Description=Codex Pro Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/path/to/codex-pro gateway --foreground
ExecStop=/bin/kill -SIGTERM $MAINPID
TimeoutStopSec=60
Restart=on-failure
RestartSec=5
Environment=_CODEX_PRO_GATEWAY=1

[Install]
WantedBy=default.target
```

!!! tip "用户级 vs 系统级"
    Codex Pro 使用 systemd **用户级** 服务（`--user`），无需 root 权限。服务在用户登录时启动，配合 `loginctl enable-linger` 可实现开机自启。

### 启用 Linger（开机自启）

默认情况下，systemd 用户级服务仅在用户登录后运行。启用 linger 使服务在系统启动时即运行：

```bash
# 启用当前用户的 linger
sudo loginctl enable-linger $(whoami)

# 验证
loginctl show-user $(whoami) | grep Linger
# Linger=yes
```

### 常用操作

```bash
# 使用 codex-pro 封装命令（推荐）
codex-pro gateway start
codex-pro gateway stop
codex-pro gateway restart
codex-pro gateway status
codex-pro gateway logs

# 或直接使用 systemctl
systemctl --user start codex-pro
systemctl --user stop codex-pro
systemctl --user restart codex-pro
systemctl --user status codex-pro
journalctl --user -u codex-pro -f
```

### 日志查看

```bash
# 实时跟踪日志
codex-pro gateway logs

# 等价于
journalctl --user -u codex-pro -f

# 查看最近 100 行
journalctl --user -u codex-pro -n 100

# 按时间范围查询
journalctl --user -u codex-pro --since "2024-01-01 00:00:00" --until "2024-01-02 00:00:00"
```

### 卸载服务

```bash
codex-pro gateway uninstall
```

该命令会停止服务、禁用自启动并删除 unit 文件。

---

## launchd (macOS)

### plist 文件

`codex-pro gateway install` 生成的 launchd 配置：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.codex-pro</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/codex-pro</string>
        <string>gateway</string>
        <string>--foreground</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/codex-pro.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/codex-pro.stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>_CODEX_PRO_GATEWAY</key>
        <string>1</string>
    </dict>
</dict>
</plist>
```

### 常用操作

```bash
# 使用 codex-pro 封装命令（推荐）
codex-pro gateway start
codex-pro gateway stop
codex-pro gateway status

# 或直接使用 launchctl
launchctl load ~/Library/LaunchAgents/com.codex-pro.plist
launchctl unload ~/Library/LaunchAgents/com.codex-pro.plist
launchctl list | grep codex-pro
```

### 日志查看

```bash
# 使用封装命令
codex-pro gateway logs

# 或直接查看日志文件
tail -f /tmp/codex-pro.stdout.log
tail -f /tmp/codex-pro.stderr.log
```

---

## tmux / screen 替代方案

如果不使用系统服务管理器，可以用 tmux 或 screen 保持进程运行：

```bash
# tmux 方式
tmux new-session -d -s codex-pro 'codex-pro run'

# 重新连接
tmux attach -t codex-pro

# screen 方式
screen -dmS codex-pro codex-pro run
screen -r codex-pro
```

!!! warning "不推荐用于生产"
    tmux/screen 方案不提供自动重启、开机自启和结构化日志收集能力。仅建议在无法使用 systemd/launchd 的环境（如共享主机）中使用。

---

## 停止超时

Gateway 收到停止信号后，会等待当前正在执行的任务完成，超时时间为 **60 秒**。超时后进程会被强制终止。

```
SIGTERM → 等待任务完成（最多 60s）→ 优雅退出
                                    ↓ 超时
                              SIGKILL 强制终止
```

!!! danger "强制停止可能导致数据丢失"
    如果 Agent 正在执行写入操作（如记忆持久化、知识库索引），强制终止可能导致数据不一致。建议在停止前通过 `codex-pro gateway status` 确认无活跃任务。

---

## 环境变量传递

系统服务环境与用户 shell 环境隔离。如果 Codex Pro 依赖特定环境变量（如 API Key），需在服务配置中显式声明：

### systemd

```ini
# 方式 1：在 unit 文件中声明
[Service]
Environment=OPENAI_API_KEY=sk-xxx
Environment=ANTHROPIC_API_KEY=sk-ant-xxx

# 方式 2：使用环境变量文件
EnvironmentFile=%h/.codex-pro/env
```

### launchd

```xml
<key>EnvironmentVariables</key>
<dict>
    <key>OPENAI_API_KEY</key>
    <string>sk-xxx</string>
</dict>
```

!!! tip "推荐使用配置文件"
    将 API Key 写入 `~/.codex-pro/config.yaml` 而非环境变量，可避免服务环境隔离问题。配置文件加载不受服务管理器限制。
