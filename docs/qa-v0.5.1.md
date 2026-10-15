# v0.5.1 启动入口测试

测试使用 `artifacts/launcher-test-*` 独立项目根目录及独立桌面存档。测试程序不得关闭真实项目目录中的玩家实例，也不得读写玩家应用数据存档。

## 验收矩阵

| 场景 | 预期 | 状态 |
| --- | --- | --- |
| 指定当前版本已打包 | 根据 package.json 选择当前版本EXE，不回退传统旧入口 | 通过 |
| 旧版占单实例锁 | 温和关闭同一隔离项目旧版，确认退出后启动新版 | 通过 |
| 当前版已运行 | 复开保持唯一实例，不产生第二份游戏与存档 | 通过，PID保持不变 |
| 存档延续 | 自定义金币、旧藏品、发现记录、已付结果保留，不重置/重抽 | 通过 |
| 进程边界 | 不关闭其他项目根目录实例 | 通过；仅承诺项目dist路径边界 |
| 缺少构建 | 明确提示/退出，不悄悄启动过期版本 | CheckOnly报错通过；开发fallback通过 |
| 传统dist兼容入口 | 构建后与当前包相同；若旧入口占用则不覆盖且明确提示 | 占用/空闲两种情况均通过 |
| 路径兼容 | 中文路径/空格路径与含中文UTF8无BOM manifest正确解析 | 通过 |

## 执行记录

### 启动修复根因

主线程复现旧CMD通过Windows PowerShell读取UTF8无BOM且含中文的package.json时，默认ANSI解码造成JSON解析失败，继而回退旧版传统dist入口。新版 `launch.ps1` 显式 `-Encoding UTF8` 读取，按当前版本启动，不再将旧dist当失败后的默认入口。

### 实际执行

- `node tests/launcher-smoke.mjs`：通过。此测试需要现有 `dist/v0.4.2/LiveShoppingSimulator-win32-x64` 作为真实旧版升级fixture，以及当前manifest对应构建；新克隆仓库没有这些前置构建时不能直接运行。测试复制实际旧包与新包到 `artifacts/launcher-test-*/中文 项目`，并创建另一个独立根目录实例验证边界。
- Fixture manifest包含中文description，Node以UTF8无BOM写入；当前版本、缺构建错误、开发fallback的CheckOnly均验证，读取动作未关闭旧版实例。当前包优先级正确，不会回退旧传统包。
- 真实旧版窗口存在时调用 `publishStableBuild` 返回false、输出保留原入口的提示，旧ASAR哈希保持不变。旧版正常关闭后空闲入口同步成功，EXE与ASAR哈希都等于当前构建。越界源目录和把传统入口本身作为源均被拒绝。
- 正式launcher正常关闭隔离项目的旧版可见窗口，随后启动版本目录中的新EXE；其他项目根目录实例保持运行。再次从外部工作目录执行复制后的真实 `启动游戏.cmd`，新版本仍只有一个主进程且PID不变，覆盖CMD默认ProjectRoot与中文/空格路径。
- 切换前后金币777、旧咖啡小熊背包、发现记录、已支付森林守护者pending结果/编号/状态全部一致，没有重置或重抽。
- `$env:LSS_TEST_EXE = 'E:\直播购物模拟器\dist\v0.5.1\LiveShoppingSimulator-win32-x64\LiveShoppingSimulator.exe'` 后执行 `node tests/desktop-smoke.mjs`：通过。实际reel并发加载11张unique卡面，游戏后同上下文51并发及51顺序资源检查、IPC/存档/领取折现/语音/单实例均通过。
- 主线程独立报告31项单元测试、两构建脚本语法检查与diff检查通过；真实工作区版本入口和传统入口ASAR哈希一致，CheckOnly指向v0.5.1。

### 测试修正与边界

首轮测试把Playwright外层启动进程PID当成Electron主进程PID，导致只读检查的进程断言误报；改为从Electron主进程内读取 `process.pid`，与系统进程枚举对应后通过。CMD调用新增回归时遇到Node对引号再转义的测试调用问题，改用Windows原样参数和CMD双层引号后通过，未改产品代码。首轮与launcher并行的桌面测试收到页面关闭，原因没有确定，未报告通过；之后单独重跑完整套件通过。

启动脚本根据同项目dist内的EXE路径匹配旧实例，不承诺区分同一路径下不同测试userData。生产启动路径只发正常关闭窗口请求并等待，不强杀；测试finally仅对测试自己创建且路径位于fixture内的进程做清理。此测试没有通过操作真实玩家存档来验证升级。

最终：已验证场景无阻断问题；测试代码和报告均已完成。
