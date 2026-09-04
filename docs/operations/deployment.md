# 部署方案

本文介绍 Codex Pro 在不同环境下的部署拓扑和配置要点。

---

## 部署拓扑一览

| 方案 | 复杂度 | 适用场景 |
|------|--------|---------|
| 单机直接部署 | 低 | 个人使用、小团队 |
| Docker 容器 | 中 | 隔离环境、CI/CD |
| 反向代理 + Gateway | 中 | 需要 HTTPS / 域名访问 |
| 多实例部署 | 高 | 多用户隔离、高可用 |

---

## 单机直接部署

最简方案，适合个人开发者和小团队：

```bash
# 安装
pip install codex-pro[all]
codex-pro setup

# 部署为后台服务
codex-pro gateway install
codex-pro gateway start
```

### 目录结构

```
~/.codex-pro/                 # 全局数据目录
├── config.yaml                # 主配置文件
├── data/
│   ├── codex_pro.db          # SQLite 主数据库
│   ├── memory/                # 记忆存储
│   ├── knowledge/             # 知识库索引
│   ├── spill/                 # 大输出溢写
│   ├── logs/                  # 运行日志
│   └── checkpoints/           # 状态检查点
└── env                        # 环境变量文件（可选）
```

### 工作区数据

除全局目录外，每个项目工作区可有独立数据：

```
./your-project/
└── .codex-pro/               # 工作区级数据
    ├── config.yaml            # 工作区配置覆盖
    └── data/                  # 工作区级记忆/知识
```

---

## Docker 容器部署

### Dockerfile 示例

```dockerfile
FROM python:3.11-slim

RUN pip install codex-pro[all]

# 数据目录挂载点
VOLUME /data/codex-pro

ENV CODEX_PRO_HOME=/data/codex-pro
ENV CODEX_PRO_GATEWAY_HOST=0.0.0.0

EXPOSE 58123

ENTRYPOINT ["codex-pro", "gateway", "--foreground"]
```

### docker-compose.yml

```yaml
version: "3.8"
services:
  codex-pro:
    build: .
    ports:
      - "127.0.0.1:58123:58123"
    volumes:
      - codex-pro-data:/data/codex-pro
      - ./config.yaml:/data/codex-pro/config.yaml:ro
    environment:
      - CODEX_PRO_HOME=/data/codex-pro
    restart: unless-stopped
    mem_limit: 2g

volumes:
  codex-pro-data:
```

### 运行

```bash
docker-compose up -d
docker-compose logs -f codex-pro
```

!!! warning "容器内工具执行"
    容器化部署时，Agent 的工具执行（如 shell 命令）受限于容器环境。需要挂载工作目录或配置远程执行后端。

!!! note "没有官方镜像，需自行构建"
    项目未发布预构建的 Docker 镜像，仓库中也没有 Dockerfile。上面的 Dockerfile 与 compose 片段是供你复制到自己项目里的示例，不是仓库内的现成文件。

    容器化部署是社区[欢迎贡献的方向](https://github.com/promoteAI/codex-pro/issues)之一。

---

## 反向代理部署

当需要通过 HTTPS 或域名访问 Gateway 时，推荐在前面放置反向代理。

### Nginx 配置

```nginx
server {
    listen 443 ssl;
    server_name codex-pro.example.com;

    ssl_certificate /etc/ssl/certs/codex-pro.pem;
    ssl_certificate_key /etc/ssl/private/codex-pro.key;

    location / {
        proxy_pass http://127.0.0.1:58123;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持（如需要）
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 超时设置（Agent 任务可能较长）
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

### Caddy 配置

```caddyfile
codex-pro.example.com {
    reverse_proxy localhost:58123 {
        # 长连接超时
        transport http {
            read_timeout 300s
        }
    }
}
```

!!! tip "Caddy 自动 HTTPS"
    Caddy 自动申请和续期 Let's Encrypt 证书，是最简单的 HTTPS 部署方案。

### Gateway 配合配置

使用反向代理时，需更新 Gateway 的 Origin 保护配置：

```yaml
gateway:
  host: 127.0.0.1          # 仍然绑定本地
  port: 58123
  auth:
    allowed_origins:
      - "https://codex-pro.example.com"
    allowed_hosts:
      - "codex-pro.example.com"
```

---

## 多实例部署

为不同用户或项目运行独立的 Codex Pro 实例：

### 方案一：不同端口

```yaml
# 实例 A: ~/.codex-pro-alice/config.yaml
gateway:
  port: 58123

# 实例 B: ~/.codex-pro-bob/config.yaml
gateway:
  port: 8421
```

```bash
codex-pro -c ~/.codex-pro-alice gateway start
codex-pro -c ~/.codex-pro-bob gateway start
```

### 方案二：Docker Compose 多实例

```yaml
version: "3.8"
services:
  agent-alice:
    build: .
    ports:
      - "127.0.0.1:58123:58123"
    volumes:
      - alice-data:/data/codex-pro
    environment:
      - CODEX_PRO_HOME=/data/codex-pro

  agent-bob:
    build: .
    ports:
      - "127.0.0.1:8421:58123"
    volumes:
      - bob-data:/data/codex-pro
    environment:
      - CODEX_PRO_HOME=/data/codex-pro

volumes:
  alice-data:
  bob-data:
```

!!! danger "数据隔离"
    多实例共享同一数据目录会导致 SQLite 锁冲突和数据损坏。每个实例必须使用独立的数据目录。

---

## 网络安全注意事项

| 部署方式 | 默认绑定 | 公网暴露风险 |
|---------|---------|-------------|
| 直接部署 | `127.0.0.1` | 无 |
| Docker (ports) | 取决于映射 | 注意 `0.0.0.0` 映射 |
| 反向代理 | 代理层控制 | 需配置访问控制 |

--8<-- "docs/includes/warning-public-gateway.md"
