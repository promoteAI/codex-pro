# Codex Pro Desktop (src-tauri)

Codex Pro 的桌面壳。它基于 **Tauri v2**，用系统 WebView 加载打包好的前端
（`web/dist`），并作为宿主**派生并看护**一个内置的 PyInstaller gateway 进程。

```
┌─────────────── Tauri 桌面壳 (codex-pro-desktop) ───────────────┐
│  WebView (http://tauri.localhost)                                │
│     └─ SPA web/dist ── app/ws/… 请求                            │
│                              │  http://127.0.0.1:58124          │
│                              ▼                                  │
│  Rust 代理 (proxy.rs) ── 转发 /api /ws /meta 到 gateway          │
│                              │  http://127.0.0.1:<动态端口>       │
│                              ▼                                  │
│  gateway 子进程 (codex-pro-desktop-gateway(.exe))               │
│     └─ 端口写入 ~/.codex-pro/.codex-pro/gateway.json │
└──────────────────────────────────────────────────────────────┘
```

> 关于本说明书的受众：本文件面向**拿到仓库、想构建或调试桌面壳**的开发者 /
> 打包运维。若你只在浏览器里跑 `pnpm dev`，可跳过，走项目根目录的
> [CLAUDE.md](../CLAUDE.md)。

---

## 目录结构

```
src-tauri/
├── Cargo.toml          Rust 依赖（tauri = "2"）
├── tauri.conf.json     Tauri 配置（frontendDist、bundle.externalBin 等）
├── build.rs            tauri_build::build()
├── capabilities/       各窗口的权限声明（v2 默认无任何 core 权限外的授权）
├── icons/              应用与安装包图标
├── binaries/           gateway sidecar 二进制（git-ignored，构建时生成）
│                       命名: codex-pro-desktop-gateway-<target-triple>(.exe)
└── src/
    ├── main.rs         窗口子系统入口（仅调用 lib::run()）
    ├── lib.rs          Tauri builder + 生命周期（启动/关闭 gateway）
    ├── gateway.rs      网关生命周期: 定位/派生/看护/重启（supervise）
    └── proxy.rs        axum HTTP/WS 反向代理，把前端请求转发给 gateway
```

**模块职责**

| 文件 | 作用 |
|------|------|
| `lib.rs` | `setup` 中**同步阻塞**直到网关与代理就绪才创建窗口；窗口 `Destroyed` 时调用 `signal_shutdown()` |
| `gateway.rs` | `resolve_binary()` 定位网关二进制；`supervise()` 派生、等待端口、启动代理、崩溃后指数退避重启 |
| `proxy.rs` | 监听固定端口 `127.0.0.1:58124`，转发 `/api`、`/ws`、`/meta`，并做 CORS preflight |

---

## 构建

### 前置依赖

| 组件 | 版本 | 说明 |
|------|------|------|
| Node.js | 22 | 构建前端 `web/dist` |
| pnpm | 10.34.5 | 与 CI 一致 |
| Python | 3.12 | 构建 PyInstaller gateway 二进制 |
| Rust | stable | Tauri 工具链 |
| Tauri CLI | — | `npm install -g @tauri-apps/cli` |

Linux 额外需要系统库：

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  librsvg2-dev patchelf
```

macOS 需一步加密（Tauri 要求）：在构建机上对 Rust 二进制做 ad-hoc 签名。

### 一次性构建（推荐）

用打包脚本，它会按顺序完成**前端构建 → PyInstaller 网关 → 再交给 Tauri**：

```bash
# 根目录下
pip install -e ".[all]"
pip install pyinstaller

# Windows
powershell -ExecutionPolicy Bypass -File packaging/desktop/build_desktop.ps1
# macOS / Linux
bash packaging/desktop/build_desktop.sh
```

产物：`dist/codex-pro-desktop-gateway(.exe)`（网关）+ `web/dist`（前端，供 Tauri 打包）。

随后构建安装包：

```bash
cd src-tauri
tauri build
```

> 注意：`bundle.externalBin` 让 tauri-build 把
> `binaries/codex-pro-desktop-gateway-<target-triple>(.exe)` 复制到安装目录，
> 并去掉 triple 后缀。因此**必须先**把网关二进制按宿主 triple 命名放到
> `src-tauri/binaries/`，否则 `tauri build` 会在编译期报 `ResourcePathNotFound`。
> CI 里的 "Stage gateway sidecar" 步骤做的就是这件事。

### 分步执行（理解用）

`tauri` 命令来自全局 Tauri CLI，需先安装：

```bash
npm install -g @tauri-apps/cli
# 不想全局装，可用 npx: npx @tauri-apps/cli build，或 cargo install tauri-cli
```

`cargo` 需在 PATH 中（`tauri build` 会调用 `cargo metadata` / `cargo build`）。
装了 Rust 但当前终端找不到时，把 `%USERPROFILE%\.cargo\bin` 加入 PATH，或重开终端。

打包脚本等价于：

```bash
# 1. 前端
cd web && pnpm install --frozen-lockfile && pnpm build

# 2. 网关二进制
cd ..
export CODEX_PRO_ROOT="$PWD"
pyinstaller --distpath "$PWD/dist" --clean --noconfirm packaging/desktop/codex_pro.spec

# 3. 把网关按宿主 triple 放到 tauri 能找的地方
TRIPLE="$(rustc -vV | grep host | awk '{print $2}')"
EXT=""   # Windows 下为 ".exe"
mkdir -p src-tauri/binaries
cp "dist/codex-pro-desktop-gateway${EXT}" \
   "src-tauri/binaries/codex-pro-desktop-gateway-${TRIPLE}${EXT}"

# 4. 构建桌面壳/安装包
cd src-tauri && tauri build
```

### 只跑调试壳（开发）

不想打安装包、只想看壳跑起来时：

```bash
cd src-tauri
export CODEX_PRO_ROOT="$PWD/.."   # 让 spec 能找到 codex_pro
# 需先有 dist/codex-pro-desktop-gateway(.exe)
cargo run
```

---

## 运行时行为

### 端口与寻址

| 端口 | 角色 | 说明 |
|------|------|------|
| `127.0.0.1:58124` | Rust 代理 | 固定，前端唯一入口 |
| `127.0.0.1:<动态>` | gateway | 启动时以 `--port 0` 派生，真实端口写入 `gateway.json` |

前端通过 `/meta` 拿到 `api_prefix` 等；桌面模式（`IS_DESKTOP`）下 API/WS 都走
`http://127.0.0.1:58124` 这个绝对代理地址。代理再转发给 gateway。

### 端口文件

```
~/.codex-pro/.codex-pro/gateway.json
```

内容：`{"host": "127.0.0.1", "port": <动态>, "pid": <pid>, "ws_path": "/ws"}`。
`spawn_and_wait()` 每次派生前会**删除**该文件，并只在端口**确实接受 TCP 连接**时
才信任它，避免读到上一次已关闭的旧端口。

> 桌面工作区与 CLI 默认工作区隔离，防止多个 gateway 实例争用同一把
> `workspace/data/<lock>`。

### 启动时序与竞态

`setup` 会**同步阻塞**直到网关写好 `gateway.json` 且代理绑定 58124 **成功**才返回，
然后 Tauri 才创建窗口。这样 SPA 首屏的 `/meta`、各页面初始化请求全都命中已就绪的
代理，不会因代理尚不存在而失败（早期版本此竞态会让界面停留在空白静态页）。

首次冷启动可能等待数秒（某个 channel 网络握手超时可达 20s）：这是为了让首屏
拿到数据而付出的代价。

### 关闭

窗口 `Destroyed` 时 `signal_shutdown()` 杀掉当前网关子进程，并通知看护线程停止重启。
`supervise()` 内部是看护线程负责崩溃后按 2^n 秒指数退避重启（封顶 30s）。

### 网关 stdin / stdout

网关以 `stdin/stdout/stderr` 全重定向到 null 派生；Windows 下额外加
`CREATE_NO_WINDOW`，因此不会闪现终端窗口。`_CODEX_PRO_DESKTOP=1` 环境变量让
CLI channel 关闭（`sys.stdin.isatty()` 在 PyInstaller onefile 下可能误报 True，
导致网关阻塞在 stdin 循环）。

---

## 调试

### 看网关日志

网关日志通过 `GET /api/v1/logs` 暴露（走代理 58124）。也可直接读网关的工作区：

```bash
# 日志文件
~/.codex-pro/data/logs/loop_freeze.log
```

### 验证链路（无头）

不打开 WebView，直接对代理发请求即可检查链路：

```bash
# 元信息
curl -H "Origin: http://tauri.localhost" http://127.0.0.1:58124/meta

# 一个 API 端点（应返回 JSON 而非 SPA HTML）
curl -H "Origin: http://tauri.localhost" http://127.0.0.1:58124/api/v1/health

# WebSocket 握手（应返回 101 Switching Protocols）
curl -i -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://127.0.0.1:58124/ws/web
```

> 若某个 `/api/v1/...` 返回 `index.html`（`text/html`），表示该路径网关未注册，
> 命中了 SPA 兜底路由 `/{path:.*}`，而不是代理坏了。

### 常见问题

| 现象 | 排查 |
|------|------|
| 首屏空白 / 无数据 | 确认 58124 已监听；`curl /meta`；看 `gateway.rs` 是否在 setup 同步等待 |
| `ResourcePathNotFound` 编译失败 | `binaries/` 里缺少按宿主 triple 命名的网关二进制，先跑打包脚本 |
| 网关反复重启 | 看 `data/logs/`；可能网关崩溃（e.g. 某 channel 网络异常）|
| 端口被占（58124）| 有残留的桌面进程；结束旧进程或换端口。前端用 `VITE_DESKTOP_ORIGIN` 可覆盖 |

---

## CI

`.github/workflows/desktop-build.yml` 在 `v*` tag / 手动触发时按三平台矩阵构建：
每个 runner 上 `pip install -e ".[all]"` + `build_desktop.*` → 生成网关 → stage 到
`binaries/`（带 triple 后缀）→ `tauri build` → 产出 `.msi` / `.dmg` / `.AppImage` +
`.deb`。

> 注意 CI 刻意不直接跑 `pnpm build`（`check:bundle` 当前超预算），而是调用
> `build_desktop.*`，后者已内置 `pnpm build` 且只容忍 bundle-budget 这一类失败。

---

## 关键环境变量

| 变量 | 作用 |
|------|------|
| `CODEX_PRO_ROOT` | spec 定位仓库根，默认当前目录 |
| `CODEX_PRO_DESKTOP_NO_VECTOR=1` | 跳过 vector 栈（fastembed/onnxruntime/faiss）的 fail-loud 收集检查，缺库时降级 |
| `VITE_DESKTOP` / `VITE_DESKTOP_ORIGIN` | 前端桌面模式标记 / 代理地址覆盖（见 `web/src/lib/desktop.ts`）|

---

## 相关链接

- 前端：`web/`（SPA，`web/src/lib/desktop.ts` 负责桌面/浏览器分流）
- 网关后端：`codex_pro/`（`codex_pro/gateway/server.py`）
- 打包：`packaging/desktop/`（`build_desktop.*` + `codex_pro.spec`）
- 原型/设计参考：`docs/design/prototype-codex-pro.html`
