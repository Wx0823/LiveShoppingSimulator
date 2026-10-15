# 离线开箱配音

这些 WAV 为 Windows System.Speech / Microsoft Yaoyao 女声的机器合成语音，非真人录音。游戏直接播放素材文件，运行时不调用系统语音或联网服务。

用 PowerShell 7 执行 `pwsh -File scripts/generate-voice.ps1` 可重新生成；生成电脑需安装 Yaoyao，缺少时自动选择 Huihui。Windows PowerShell 5.1 通常只能发现 Huihui Desktop，因此建议使用 PowerShell 7 以复现本次选用的 Yaoyao 声线。采样格式为 24 kHz、16-bit、单声道；语速 +1，合成音量 82%。不同 Windows 语音引擎版本可能产生细微差异。

| 文件 | 台词 |
| --- | --- |
| opening.wav | 轮到你啦，拆开看看！ |
| common.wav | 开出来啦，收下这份小惊喜吧。 |
| rare.wav | 哇，是稀有款！ |
| epic.wav | 哇，这一盒太惊喜啦！ |
| legendary.wav | 隐藏款！今天的好运属于你！ |
