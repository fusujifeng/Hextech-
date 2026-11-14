# 海克斯大乱斗出装助手

一个只读、轻量的 Windows 桌面小工具：在《英雄联盟》**海克斯大乱斗**（ARAM Mayhem，队列 2400）选人阶段，
自动识别你当前预选 / 锁定的英雄，展示该英雄在当前模式下的推荐出装与海克斯强化。

- 不读游戏内存、不注入 DLL，只通过官方客户端自带的 **LCU 本地 API** 读状态
- Tauri 2 + 系统 WebView2，可执行文件约 8.5 MB
- 数据来自 [resg.top](https://www.resg.top/)（海克斯大乱斗英雄与强化符文数据站）；**装备、强化、英雄图标全部随包内置**，断网也能完整显示
- 英雄搜索支持 **名称 / 称号 / 外号**：搜「格雷福斯」「法外狂徒」「男枪」都能找到同一个英雄
- 自动更新：GitHub Releases + `latest.json`，应用内一键升级

![应用截图](docs/screenshot.png)

![搜索截图](docs/search.png)

## 它做什么

| 场景 | 表现 |
| --- | --- |
| 客户端未启动 | 顶栏灰点 + “等待英雄联盟客户端”，可手动浏览任意英雄出装 |
| 已连接、未进选人 | 显示当前阶段（房间中 / 匹配中 / 对局中） |
| 进入海克斯大乱斗选人 | 自动识别英雄，展示 Tier、胜率、承伤 / 输出修正、首发装备、核心五件套、推荐强化 |
| 想先看看某个英雄 | 搜索框支持名称 / 称号 / 外号（「男枪」=「法外狂徒」=「格雷福斯」），点了就预览 |
| 换备战席英雄 | 500 ms 内跟随更新 |
| 其他模式（排位、普通等） | 明确提示不提供推荐，不误报 |
| 有新版本 | 顶部金色横幅 + 进度条，passive 静默安装后自动重启 |

## 架构

```
React 19 + TS + Tailwind  ──invoke/event──  Rust (src-tauri)
         UI 渲染                              ├─ league-link：LCU 凭证发现 + HTTPS
                                              ├─ 500ms 轮询 gameflow-phase
                                              └─ 随包 JSON：resg.top 数据
```

- `src-tauri/src/lcu.rs`：凭证发现（进程扫描 → lockfile → 客户端日志三路兜底）、阶段轮询、选人会话解析
- `src-tauri/src/data.rs`：英雄 / 装备 / 强化符文与推荐出装的查询层（含名称、称号、外号合并）
- `src-tauri/data/*.json`：由 `scripts/gen-data.mjs` 生成、`include_str!` 打进二进制的静态数据
- `src-tauri/data/nicknames.json`：手工维护的英雄外号表，按 Data Dragon alias 索引
- `src/`：全部界面与交互逻辑

## 本地开发

前置（Windows 10/11 x64）：

- Node.js 20+
- Rust stable（`rustup`，MSVC 工具链）
- Visual Studio 2022 生成工具（C++ 桌面开发 + Windows SDK）
- WebView2 Runtime（Win11 自带，Win10 一般也已安装）

```powershell
npm install
npm run tauri dev     # 开发调试
npm run tauri build   # 产出安装包，见 src-tauri/target/release/bundle/nsis/
```

调试小技巧：地址后加 `#preview/222` 可以直接预览指定英雄（`222` = 金克丝），不用启动游戏。

## 数据说明

数据来源为 [resg.top](https://www.resg.top/) 的公开静态接口，`scripts/gen-data.mjs` 会抓取并生成两份文件：

- `src-tauri/data/resg.json`：英雄（含 Tier / 胜率）、装备、强化符文的元数据与图标地址
- `src-tauri/data/recommendations.json`：每个英雄的首发装备、鞋子、核心五件套、高胜率备选、推荐强化

用到的接口：

```
/api/v1/versions.js                          # 可用数据版本
/api/v1/versions/{v}/champions.js            # 全英雄概况
/api/v1/versions/{v}/champions/{id}.js       # 单英雄：分件出装统计、强化符文统计、承伤/输出修正
/api/v1/versions/{v}/augments.js             # 强化符文列表
/api/v1/versions/{v}/augments/{id}.js        # 强化符文详情（名称 / 描述）
/api/v1/items-detail.js                      # 装备名称与图标
```

抓取结果缓存在 `scripts/.cache/`，重复执行只补缺失项；游戏版本更新后执行：

```powershell
node scripts/gen-data.mjs              # 跟随数据站最新版本
node scripts/gen-data.mjs --version 16.22
node scripts/gen-data.mjs --refresh    # 忽略缓存重新抓
```

**字段含义**：

| 字段 | 来源 | 说明 |
| --- | --- | --- |
| `start` | `si` | 该英雄最常见的首发购买（通常是首件成装或关键小件） |
| `boots` | `b.BOOTS` | 出场率前二的鞋子 |
| `core` | `ia.combos["5"][0]` | 完整五件套中出场最多的一套，按购买顺序排列 |
| `situational` | `ia.items` | 场次 ≥ 1500 的装备里胜率最高的 4 件（排除已推荐） |
| `augments` | `ra` | 该英雄使用率最高的 6 个海克斯强化 |
| `tier` / `winRate` | 英雄概况 | 数据站给出的海克斯大乱斗强度分级与胜率 |

抓取是只读的、针对公开静态资源；如果数据站改版，脚本里集中改 `API` 前缀与字段解析即可。

脚本同时会把用到的图标下载到 `public/icons/`（装备 134 + 强化 99 + 英雄 173，共约 2.8 MB），
`resg.json` 里的 `icon` 字段直接写本地路径（如 `/icons/items/3031.png`），
所以运行时**不会发起任何图片请求**，断网、数据站挂掉都不影响展示。执行 `--refresh` 会重新下载。

### 英雄搜索与外号

搜索框同时匹配四类文本：

| 类型 | 示例 | 来源 |
| --- | --- | --- |
| 英雄名称 | 格雷福斯 | resg.top |
| 英雄称号 | 法外狂徒 | resg.top |
| 英文名 / alias | Graves | resg.top |
| 外号 | 男枪、石头人、快乐风男 | `src-tauri/data/nicknames.json` |

外号表是手工维护的（覆盖 170 位英雄），想补一个直接在对应 alias 的数组里加字符串即可，重启应用生效。
Rust 侧会过滤掉与英雄名完全相同的外号，避免搜索结果里出现重复文本。

## 发布与自动更新

1. 修改 `src-tauri/tauri.conf.json` 里的更新地址：

   ```json
   "endpoints": ["https://github.com/<你的用户名>/<仓库名>/releases/latest/download/latest.json"]
   ```

2. 仓库 Secrets 添加（Settings → Secrets and variables → Actions）：

   | Secret | 值 |
   | --- | --- |
   | `TAURI_SIGNING_PRIVATE_KEY` | `src-tauri/keys/updater.key` 的**完整内容** |
   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | `src-tauri/keys/password.txt` 里的密码 |

   公钥已经写在 `tauri.conf.json` 的 `plugins.updater.pubkey`，**私钥与密码绝不入库**
   （已在 `.gitignore` 中忽略 `src-tauri/keys/`）。

3. 打 tag 发布：

   ```powershell
   git tag v0.1.0
   git push origin v0.1.0
   ```

`.github/workflows/release.yml` 会构建 NSIS 安装包、签名、生成 `latest.json` 并创建 Release。
已安装的客户端启动时检查该文件，发现新版本即展示更新横幅。

## 国服 / WeGame 说明

国服 WeGame 环境下 `lockfile` 常常是 0 字节，进程命令行也可能读不到。`league-link` 的三路发现顺序是：

1. 扫描 `LeagueClientUx.exe` 命令行里的 `--app-port` / `--remoting-auth-token`
2. 解析安装目录下的 `lockfile`
3. 解析最新的 `*_LeagueClientUx.log`（日志里嵌了完整命令行，无需提权）

第 2、3 步的安装目录由运行中的客户端进程路径推断，并补充了几个常见安装位置。

## 已知限制

- 只在 Windows x64 上测试；其他平台未适配
- 英雄刚上线、数据站未收录时，会提示“暂无统计数据”
- 外号表为手工维护，冷门英雄的冷门叫法可能缺失
- 数据为统计结果，样本少的英雄（新英雄、冷门英雄）参考价值有限
- 队列号集中在 `src-tauri/src/lcu.rs` 的 `classify()`，模式标识变化时改一处即可

## 目录结构

```
├─ src/                     React 前端
│  ├─ components/           英雄卡、装备格、强化格、出装区、英雄选择器
│  └─ lib/                  invoke 封装、更新逻辑、类型
├─ public/icons/            随包图标（装备 / 强化 / 英雄，脚本生成）
├─ src-tauri/
│  ├─ src/lcu.rs            LCU 连接与轮询
│  ├─ src/data.rs           数据查询与命令
│  ├─ data/                 随包 JSON（脚本生成）+ 外号表
│  └─ tauri.conf.json       窗口 / 更新 / 打包配置
├─ scripts/gen-data.mjs     数据抓取脚本
├─ docs/                    截图
└─ .github/workflows/       打 tag 自动发布
```

## 给朋友的三步安装

1. 在 Releases 页面下载最新的 `ARAMHelper_x.y.z_x64-setup.exe`
2. 双击安装（Windows 可能提示未知发布者，选择“仍要运行”）
3. 启动英雄联盟并进入海克斯大乱斗选人，工具会自动显示推荐出装

---

本项目与 Riot Games 无关，数据仅供参考。
