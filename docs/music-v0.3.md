# 拆袋好心情 · 原创循环背景音乐

`src/music.mjs` 使用 Web Audio 合成全部音色，没有采样、歌词、语音、远程请求或第三方音乐素材。

- 118 BPM、4/4、C 大调、16 小节，单轮约 32.54 秒。
- 和声 Cmaj7 → Am7 → Fmaj7 → G6；钟琴与木琴质感的正弦泛音主旋律、轻拨弦、温暖低音、柔和底鼓、刷鼓和踩帽。
- 八小节旋律有问答变化，后半轮减少部分音符与力度。自然衰减音跨越循环边界，没有重新加载音频或硬切。
- 默认音量 0.35，内部主增益另乘 0.38，开箱 duck 时再乘 0.23；低通与轻压缩抑制刺耳高频。

## 接入

```js
import { createMusicPlayer } from './music.mjs';
const music = createMusicPlayer();
// 首次点击、键盘交互时调用；桌面也可启动后尝试，拒绝时返回 false。
await music.unlock();
music.setEnabled(true);      // 独立于音效开关
music.setVolume(0.35);       // 0..1，越界自动限幅
music.setDucked(true);       // 玩家开箱滚动时压低，结束后 false
music.setPaused(true);       // 后台/退出时暂停；恢复时 false
music.getStatus();           // { enabled, playing, unlocked, volume, paused, ducked }
music.destroy();             // 释放 scheduler 与 AudioContext；不可恢复
```

模块不自行绑定全局事件。主程序负责 visibilitychange、用户交互和页面卸载。pause/关闭音乐保留进度并停止已排队的声音；resume 使用新音频时间基准，避免后台音符堆积。每 25ms 排入未来 100ms 声音，音量调整采用柔性 ramp。多个快速 unlock 共享同一初始化 Promise 和 AudioContext。

`createScore()` 返回纯数据 `{ bpm, bars, beats, seconds, events }`；每个事件为 `{ kind, beat, note, duration, velocity }`，note 为 MIDI 音高，beat/duration 均以拍为单位。测试验证乐谱完整性、音高、变奏、循环衔接、并发 unlock、暂停/继续、限幅及释放资源。
