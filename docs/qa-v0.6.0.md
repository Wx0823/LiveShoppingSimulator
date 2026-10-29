# v0.6.0 独立测试报告

测试日期：2026-10-30。测试角色：独立 QA agent。使用浏览器独立上下文及 `artifacts/desktop-test-*` 独立桌面存档，不读写真实玩家存档。

## 已执行

| 项目 | 实际结果 |
| --- | --- |
| `node --test tests/*.test.mjs` | 31 / 31 通过；含 45 张卡概率、所有付费结果保存/重载/结算、旧藏品兼容、队列与音频调度 |
| `node tests/v06-audio-smoke.mjs` | 通过；普通速度真实付款与排队开箱，滚动前段无语音，opening.wav 无请求、预加载或播放；揭晓时仅一次品质提示且播放成功 |
| `node tests/tk-ui-smoke.mjs` | 通过；正反面、阵营分页、只读预览、付款/奖励/结果保存失败时不发布状态、旧藏品与已付订单兼容、防重复领取折现 |
| `node tests/layout-smoke.mjs` | 通过；1280×720、1600×960、1920×1080、3840×2160 布局，关键操作不依赖页面滚动、五包队列、聊天列、三套预览按品质及精确概率 |

## 最终资源与正式包验收

| 项目 | 实际结果 |
| --- | --- |
| `node tests/v06-art-review.mjs` | 通过；45 张 master 均与 v0.5.1 不同，基线可用 ART_BASELINE 覆盖；生成三阵营各 15 张游戏实际 SVG 卡面、六张包装/背面及三张传说并排预览 |
| `node tests/tk-art-smoke.mjs` | 通过；最终 51 张 runtime 资源均解码，45 人物文件哈希互异，包装与卡背也互异 |
| 最终素材目检 | 已实际查看三张全卡面 contact sheet、包装/背面 sheet、三张传说预览。阵营、姓名、品质和编号可辨，头脸完整；未发现阻断性手脸或身份错误。部分长兵器适当出画属于构图，未当成缺陷 |
| 最终资源导出后重跑 layout / tk-ui | 均再次通过；新素材下 720p 至 4K 布局及翻面、保存失败、旧结果兼容验证成立 |
| 正式 EXE `tests/desktop-smoke.mjs` | 通过；实际付费 reel 同时加载 13 张独立武将图，同会话 51 并发再 51 顺序解码均通过；隔离 preload、非法 IPC 拒绝且存档不变、原生读写、已付结果恢复、领取/出售、编号、配音策略、单实例均通过 |
| `node tests/v06-desktop-ui.mjs` | 通过；正式包实际 UI 标识 v0.6.0，五个排队卡包；原生内容尺寸 1280×720、1920×1080 中购买按钮完整可见。已查看两张截图，桌面队列与商品包装一致。截图像素受系统 DPI 缩放影响 |
| 启动入口与包一致性 | 主线程独立检查 CheckOnly 选择 v0.6.0；版本入口和 stable 的 ASAR SHA256 同为 AFED52CF155DF8432E81AFBB51C8AFDB1EC741CFC8FB69E5B26AF69729A54BF9 |

正式包路径：`dist/v0.6.0/LiveShoppingSimulator-win32-x64/LiveShoppingSimulator.exe`。桌面测试均指定独立 LSS_TEST_USER_DATA。

视觉审查图片位于 `artifacts/v0.6.0-wei-cards.png`、`shu-cards.png`、`wu-cards.png`、`pack-back-review.png`、`legendary-preview.png`、`desktop-1280.png`、`desktop-1920.png`（均带 v0.6.0- 前缀）。这些是 QA 产物，不提交。

已执行范围未发现阻断问题。美术是否符合用户的审美偏好仍需用户试玩反馈，测试不将该主观判断等同于代码断言。

## 测试过程说明

最初预览端口连接失败：继承上下文中的服务器已随中断退出。重新启动 `node scripts/serve.mjs` 后重跑音频测试通过，未修改产品实现。

art-review 首轮使用 HEAD 作为差异基线，不适于本版提交后复跑；改为固定 v0.5.1 并实际重跑通过。独立画廊继承全局 main 最小高度导致预览底部空白，仅移除 QA 页面样式后重新截图，未改产品 CSS。魏四张原始生成日志缺失由主线程另记于美术 notes，不影响素材实际替换与运行验证。
