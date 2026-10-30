# v0.6.1 独立测试报告

测试日期：2026-10-30。独立 QA agent 实际执行下述桌面、界面及浏览器集成检查。桌面使用脚本创建的 `artifacts/desktop-test-*`、`artifacts/v061-desktop-ui-*` 独立存档；浏览器每个场景使用独立上下文，不读写真实玩家存档。

## 已执行的桌面与界面检查

正式包：`dist/v0.6.1/LiveShoppingSimulator-win32-x64/LiveShoppingSimulator.exe`。两个桌面脚本均设置 `LSS_TEST_EXE` 指向此 EXE。

| 检查 | 实际结果 |
| --- | --- |
| `node tests/desktop-smoke.mjs` | 通过；隔离 preload、非法 IPC 写入拒绝且原存档不变、已付款结果恢复、领取、原生保存/重载、背包出售、编号购买与揭晓、单实例锁均成立 |
| 同桌面会话素材加载 | 实际付费滚动并发解码 13 张独立武将图；随后全套 51 张资源并发及顺序解码均通过 |
| 桌面无配音 | 实际购买和揭晓无 WAV 配音播放调用 |
| `node tests/v061-desktop-ui.mjs` | 通过；正式包侧栏及设置为 v0.6.1，桌面五包队列；1280×720、1920×1080 原生内容尺寸下购买按钮完整位于视口内；设置无语音描述或语音控件 |
| 界面目检 | 已实际查看两尺寸的主界面及设置截图。购买按钮、队列、商品包装、侧栏正常；1280 设置面板内部可滚动，关闭、音效、音乐、快速开盒和重置按钮可见。截图像素受系统 DPI 影响 |
| `node tests/v06-audio-smoke.mjs` | 通过；普通速度真实付款与排队开箱，整个开箱和揭晓无语音资源请求、预加载、播放调用或成功播放 |

截图：`artifacts/v0.6.1-desktop-1280.png`、`artifacts/v0.6.1-desktop-1920.png`、`artifacts/v0.6.1-desktop-settings-1280.png`、`artifacts/v0.6.1-desktop-settings-1920.png`。QA 截图和独立存档不提交。

## 音乐集成检查方法

`tests/v061-music-smoke.mjs` 在 Edge headless 浏览器中实际选盒、付款、排队并揭晓。通过 Playwright route 包装音乐工厂，记录开箱曲 start/stop、真实 AudioContext oscillator 创建/启动/停止，以及常规音乐 setPaused 调用；保留原始合成器和真实音频节点，不以假的播放器替代产品实现。

hidden 场景通过覆盖该测试页面的 `document.hidden` 并派发 `visibilitychange` 验证处理分支；这不是操作系统最小化测试。常规音乐恢复以真实播放器收到 `setPaused(false)` 为证据，未作主观听感评价。

`node tests/v061-music-smoke.mjs` 最终完整执行成功：

| 场景 | 实际结果 |
| --- | --- |
| normal + 跳过 | start 时长 4500ms，创建并启动 36 个真实 oscillator；滚动时常规音乐暂停；点击跳过后调用开箱曲 stop，真实音源停止，揭晓后常规音乐恢复 |
| fast | start 时长 620ms，创建并启动 7 个真实 oscillator；揭晓后 stop，常规音乐恢复 |
| reduced motion | start 时长 0，返回 false，未创建或启动开箱曲音源，立即揭晓并恢复常规音乐 |
| music=false | 不调用开箱曲 start，未创建或启动开箱曲音源 |
| musicVolume=0 | start 接收音量 0，返回 false，未创建或启动开箱曲音源 |
| hidden | 正常 4500ms 开箱曲启动后，visibilitychange 使 stop 增加，已创建音源立即停止，常规音乐保持暂停；恢复可见及揭晓后常规音乐恢复 |

六个场景均无浏览器 pageerror。首轮 normal、fast 通过，但 QA 对 reduced motion 等待瞬时滚动条可见导致超时；将断言等待改为滚动条存在或结果已出现后，完整六项重跑通过。未修改产品实现。

## 主线程提供的检查证据

主线程报告 `node --test tests/*.test.mjs` 为 38/38 通过（31 原有项、7 新模块项）；启动入口 CheckOnly 返回 v0.6.1，EXE 为上文正式包路径。版本目录与传统启动路径的 ASAR SHA256 同为 `849D561F5E71F1DFAEF072CA755907E0A021CE04F29BE9C821AA24EC43000E03`。上述项目由主线程执行，独立 QA 未重复运行。

## 范围说明

本版未变更美术，未重复完整美术审查。首次访问预览端口 4173 时无服务，启动 `node scripts/serve.mjs` 后执行浏览器测试。独立 QA 未修改产品文件，未进行 Git 提交。

上述实际执行范围未发现阻断性问题。
