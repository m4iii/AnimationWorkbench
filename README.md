# AnimationWorkbench v0.0.1

本包包含可直接使用的前端 HTML、前端源码、Python 本机后端、构建脚本和测试。无需 Unity 工程，也不需要 Node.js 构建前端。打包日期：2026-10-19。

## 1. 环境与启动

- Windows 10/11；当前验证环境为 Python 3.12。建议使用 Python 3.12。
- Chromium 系浏览器。
- 提示词优化和生图需要本机已安装、完成登录的 Codex CLI；生图还要求该执行环境提供可用图片生成工具。安装 Python 依赖不会安装 Codex。
- 安装 Python 依赖需要联网；模型任务需要联网。纯本地导入、预览无需调用模型。

解压整个文件夹，在文件夹内打开 PowerShell，执行：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe backend/server.py
```

随后浏览器打开 http://127.0.0.1:8765/ 。后端直接提供页面和 API，不需要填写连接令牌。保持终端运行，停止时先等待或取消任务，再按 Ctrl+C。

也可以首次双击 `install.cmd` 安装虚拟环境和依赖，之后双击 `start.cmd` 启动；在浏览器手动打开上面的地址。

服务仅监听 127.0.0.1，不能从局域网其他电脑访问。HTML 可独立打开用于本地界面与素材操作；生图、任务历史和工作区保存须从后端提供的地址使用。

检查 Codex 是否可用：`codex --version`。使用自己的 Codex 登录与配置，本包不携带账号凭据。安装说明见 https://developers.openai.com/codex/cli/ 。

可选启动参数：

```powershell
.\.venv\Scripts\python.exe backend/server.py --port 8766 --max-concurrency 4 --data D:\AnimationWorkbenchData
```

`--data` 是数据目录，默认 `backend/.runtime`；`--max-concurrency` 是全局并行上限，默认 2。界面内并行设置还受到此上限限制。
环境变量 `WORKBENCH_CODEX`、`WORKBENCH_FFMPEG` 可分别指定 Codex、FFmpeg 可执行文件。默认通过 PATH 查找 Codex，通过后端代码选择 FFmpeg。

## 2. 使用流程

1. 导入视频、帧序列或图集。
2. 在时间轴定位、逐帧预览，单独添加帧或拖选范围批量添加。
3. 单击帧切换选择状态；框选会保留先前已选帧。“清空”只取消选择，“删除所选”删除帧记录。
4. 导入人设和画风参考。填写项目默认或单帧提示词；空提示词生图时使用后端默认描述。
5. 可独立执行“优化提示词”；点击生图不会自动先优化提示词。选择 Model、Effort 和任务并行数后提交。
6. 在“任务 → 任务中心”查看状态、生成结果、当次提示词、完整执行指令以及实际输入图片。图片支持打开和下载。
7. “生成结果”视图左侧为当前帧原图，右侧为选中的生成结果，下方显示该帧所有候选结果。
8. 临时工作区自动保存一份。使用“保存工作区”命名保存，通过更多菜单加载已保存工作区；同名保存覆盖该命名工作区。

公开版本以空工作区启动，不提供默认示例视频或参考图片。测试专用几何视频由测试入口调用 `scripts/generate_sample_media.py` 临时生成，仅位于被Git忽略的 `tests/fixtures/`，不随源码发布或嵌入界面；无游戏角色、第三方参考美术或用户上传素材。使用自己的素材时请确认你拥有相应权利。Lucide 图标许可证保留在 `frontend/vendor/lucide/LICENSE`。

## 3. 架构

```text
浏览器：HTML / JavaScript / CSS
  ├─ 导入、固定小尺寸缩略图、帧位置、时间轴、选择、提示词
  └─ 同源 HTTP + Bearer token
       Python ThreadingHTTPServer（127.0.0.1）
        ├─ Store：原素材去重 / Pillow 裁图 / FFmpeg 原尺寸抽帧
        ├─ Workspaces：唯一临时缓存 / 命名工作区
        └─ Jobs：任务持久化 / 并行控制 / 取消 / 状态
             CodexWorker → codex exec + 图片附件
                  → 独立任务目录 → result.png → 归档与前端展示
```

前端只维护缩略图及原帧定位信息；原始素材上传后按内容哈希登记。执行任务时后端提取原尺寸图片，不把缩略图当作生图原图。

前端发送每帧用户提示词、素材 ID、定位信息、参考图角色及执行设置。后端补齐空提示词并组装完整指令：动作原帧提供姿态，人设参考提供外观，画风参考提供绘制方式。固定输出要求是无武器人物。

图片通过 `codex exec -i input-0.png -i input-1.png ... -` 作为附件传入，完整文本通过标准输入发送。只有实际提供的附件才编号；完整文本保存为 `sent-prompt.txt`。图片生成要求输出可解码的 `result.png`，且不能是输入图片的原样复制；缺少生图工具会失败。

主要模块：

| 文件 | 职责 |
|---|---|
| `AnimationWorkbench.html` | 已构建的自包含页面 |
| `frontend/index.template.html`、`studio.css`、`controls.css` | 页面模板与样式 |
| `frontend/motion-input.js`、`timeline.js` | 素材、采样、时间轴交互 |
| `frontend/unified-app.js` | 工作台状态与请求组织 |
| `frontend/backend-client.js` | 同源 API 客户端 |
| `frontend/task-panel.js` | 任务菜单与任务中心 |
| `frontend/workspace-store.js` | 前端自动缓存与保存协调 |
| `backend/server.py` | HTTP、素材、抽帧、任务与 Codex 执行 |
| `backend/workspaces.py` | 工作区磁盘持久化 |
| `build_frontend.py` | 将源码、图标和示例媒体内嵌进 HTML |

## 4. 接口概览

除页面入口外，API 使用后端自动注入页面的 Bearer token；后端校验 Host、Origin 和跨站请求。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/` | 页面与凭据初始化 |
| GET | `/capabilities` | 后端能力 |
| POST / GET | `/assets` / `/assets/{id}` | 上传、读取原素材 |
| POST | `/frames/extract` | 原帧提取 |
| POST | `/prompt-jobs`、`/generation-jobs` | 提交优化、生图任务 |
| GET | `/jobs`、`/jobs/{id}`、`/jobs/{id}/details` | 任务列表、进度、完整详情 |
| POST | `/jobs/{id}/cancel` | 取消任务 |
| GET | `/artifacts/{id}` | 读取产物 |
| GET / POST | `/workspace-cache` | 读取、写入唯一临时记录 |
| GET | `/workspaces` | 列出命名工作区 |
| POST | `/workspaces/save`、`/workspaces/open` | 保存、打开工作区 |

## 5. 数据位置与当前限制

首次启动自动创建数据目录，本包不包含任何已有用户工作区、历史任务、运行令牌或日志。

```text
backend/.runtime/
  assets/                  上传原素材及工作区素材（按内容去重）
  artifacts/               抽帧、生成图、文本结果
  jobs/<任务ID>/           请求、状态、逐帧输入副本、结果、日志和提示词
  workspace-cache.json     唯一临时工作区
  workspaces/<名称>.awb/   命名工作区及关联素材
  token.txt                本机 API 令牌
```

- 自动清理尚未实现；执行越多会累计文件。不要仅因文件时间较旧就删除 assets/artifacts，它们可能被工作区或任务引用。
- 迁移全部历史时，在停止服务后备份整个数据目录；只复制 HTML 不会携带个人数据。
- 当前最多 200 个采样帧；任务列表显示最近 50 个已结束任务，不等同于删除旧任务。
- 当前只支持新会话；不支持 resume。每次 CLI 执行超时 15 分钟，不自动重试模型调用。
- 重启不会自动继续未完成的模型任务，会标记中断并保留已完成结果。
- 模型名称是否可用取决于本机 Codex 环境。默认 Model/Effort 使用其配置。
- 完整动画导出尚未实现；配置导出、单张结果下载不等同于动画导出。
- 不会自动部署图片到 Unity 工程。

## 6. 开发与验证

在解压目录执行：

```powershell
python build_frontend.py
python scripts/generate_sample_media.py
python tests/check_bundle.py
.\.venv\Scripts\python.exe tests/backend_test.py
```

构建只需要 Python 标准库，不依赖外部素材。修改前端源码后重新构建，并刷新浏览器；修改后端代码后等待任务结束再重启服务。测试脚本中的 JavaScript 检查需要安装 Node.js；正常运行工作台不需要 Node.js。

后端测试采用本机 HTTP、图片和视频解码，并用测试替身验证模型任务队列，不会发起真实付费生图。测试通过不代表另一台电脑的账号具备图片生成工具。

## 7. 常见问题

- 页面打不开：检查启动终端报错及端口占用，尝试 `--port 8766`，不要把监听地址改为公网地址。
- 提示模块缺失：确认使用 `.venv` 中的 Python 启动，并用同一个 Python 安装 requirements。
- 找不到 Codex：确认 `codex --version` 可执行，或设置 `WORKBENCH_CODEX`。
- 无生成结果：在任务中心展开完整指令和错误；检查登录、模型权限与生图工具可用性。
- 页面仍是旧界面：前端修改需要构建并刷新；单纯重启后端不会替换已加载的 JavaScript。

## 序列帧默认选择

导入图片序列时，按原尺寸解码 RGBA 像素进行全局精确比较，A/B/A 默认选中第一张 A 和 B。全部原帧按原顺序显示、保存并播放，重复项置灰；Ctrl 点击、框选等现有操作可以手动改选。生成按钮仅处理选中帧。工作区保存会保留原素材、全部帧、分组信息和手动选择。配置 JSON 仍不包含图片文件。若浏览器无法完成像素比较，对应帧保留选中并提示。该内容分组适用于导入的图片序列与切分后的图集；视频不做内容去重。

悬停序列帧会临时高亮所有像素相同的帧；移开鼠标恢复，不改变选中状态或生成数量。序列预览按当前可用视口等比完整显示，调整窗口或分栏时自动适配，不重设浏览器缩放。

## 通用帧时间轴

视频、图片序列和连续图集共用时间轴的刻度、播放头、滚轮缩放、水平滚动、Alt/中键平移与范围选择。序列/图集的所有原帧按帧率形成连续的 [起点,终点) 区间，默认12fps；修改帧率会同步时长与预览速度。视频使用真实显示时间表（有元数据时）或已确认帧率，保留原有采样和采样点调整。

三种来源直接复用原视频的编号菱形点轨道与下方缩略图列表，不另建矩形帧块轨道。静态来源显示每个原帧的时间点，重复帧不删除；拖动播放头只改变预览，不改变生成选中列表。点击帧可切换选中；拖选范围、Ctrl/Shift和悬停同画面高亮均可使用。静态原帧不能像视频采样点一样拖动重定时或双击重复采样；需要改顺序时使用已有图片排序功能。工作区记录帧时间、持续时间、预览播放头、时间轴视图和选中状态。

## Public release / 公开版本

版本以 `VERSION` 为准；首个版本为 `v0.0.1`。变更见 `CHANGELOG.md`。
本项目尚未选择项目整体许可证，公开可见不代表授予任意再分发或商业使用权限。
第三方 Lucide 图标保留其原许可证，见 `frontend/vendor/lucide/LICENSE`。

开发使用 Python 3.12、Node.js 22 和 FFmpeg，执行全部离线模型替身测试：

```sh
python -m pip install -r backend/requirements.txt
python scripts/check.py
```

日常构建只需要 Python 标准库。需要重新生成测试专用几何视频时运行
`python scripts/generate_sample_media.py`（需要 FFmpeg），再构建前端。
FFmpeg 可使用系统安装，或 requirements 中的 imageio-ffmpeg 回退；不包含任何模型凭据。
CI 会重新构建并检查已提交 HTML 与源码一致；不部署服务、不调用真实模型。

Linux/macOS 本地启动可用 `python3 -m venv .venv`，随后运行
`.venv/bin/python -m pip install -r backend/requirements.txt` 和
`.venv/bin/python backend/server.py`。Windows 启动流程见前文；跨平台界面仍应单独验收。
安全边界与贡献流程分别见 `SECURITY.md` 和 `CONTRIBUTING.md`。

悬停时间轴菱形点会显示对应帧缩略图、编号和时间；有像素分组时仅同组临时高亮，其余已选帧暂时降亮。离开后恢复原选择视觉，选择数据与生成数量不变。

重复画面共享按首次出现顺序分配的紧凑编号，例如 A/B/A/C/B 显示 1/2/1/3/2；编号不改变原始帧位置、播放顺序或时间。时间轴点、缩略图与悬浮预览使用同一编号。图集工作区保存切分参数和源预览设置，恢复时重画原图与网格；旧工作区可从已有裁剪数据恢复可推导的参数。
