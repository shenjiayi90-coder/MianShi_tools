# OpenCluely — 部署与 DeepSeek 接入说明

本项目已从 Google Gemini 改造为 **DeepSeek** 驱动，默认模型 `deepseek-flash`（多模态，支持截图识别）。

---

## 1. 项目是什么

OpenCluely 是一个 Electron 桌面端 **AI 面试辅助工具**。它在屏幕上显示一个悬浮窗，该窗口对 Zoom / Google Meet / Teams / Discord / OBS 的录屏**不可见**（依赖 `setContentProtection`）。

三种提问方式：

| 方式 | 触发 | 链路 |
|---|---|---|
| 截图 | `Ctrl+Shift+S` | 截屏 → base64 → DeepSeek 视觉理解 |
| 语音 | `Ctrl+Shift+R` ⚠️ | 双通道 Whisper 转写 → DeepSeek 回答 |
| 打字 | `Ctrl+Shift+C` | 聊天窗 → DeepSeek 回答 |

> ⚠️ 语音默认键是 `Alt+R`，但本机被 GeForce Experience 占用，已自动降级为 **`Ctrl+Shift+R`**（见 4.7）。

答案通过 SSE 流式返回，边生成边显示。

---

## 2. 环境要求

| 项目 | 要求 | 本机实测 |
|---|---|---|
| 操作系统 | Windows 10/11、macOS、Linux | Windows 11 ✅ |
| Node.js | ≥ 18 | v24.16.0 ✅ |
| npm | 随 Node | 11.13.0 ✅ |
| Python | ≥ 3.10（**仅语音功能需要**） | 可选 |

> **截图问答不需要 Python**。只有本地 Whisper 语音转写才需要，不装也能跑，麦克风按钮会自动隐藏。

---

## 3. 快速部署（Windows）

### 3.1 安装依赖

```powershell
cd E:\MianShi_tools\OpenCluely
npm install
```

> **国内网络注意**：Electron 二进制（约 103 MB）常下载失败，表现为 `node_modules\electron\dist\` 为空。
> 用镜像重装：
> ```powershell
> $env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
> npm install
> ```
> 若 `dist` 仍为空，手动补：
> ```powershell
> $v='29.4.6'
> Invoke-WebRequest "https://npmmirror.com/mirrors/electron/$v/electron-v$v-win32-x64.zip" -OutFile "$env:TEMP\e.zip"
> Expand-Archive "$env:TEMP\e.zip" -DestinationPath 'node_modules\electron\dist' -Force
> Set-Content 'node_modules\electron\path.txt' -Value 'electron.exe' -NoNewline
> ```

### 3.2 配置 API Key

`.env` 已生成（含你的 key）：

```ini
DEEPSEEK_API_KEY=sk-REPLACE_WITH_YOUR_OWN_KEY
LLM_PROVIDER=deepseek
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_REASONING_EFFORT=none
```

也可以启动后在**设置窗口**里改，会自动写回 `.env`。

### 3.3 启动

```powershell
npm start
```

首次启动会弹出 4 步引导向导，检测到 key 已配置即可直接跳过。

---

## 4. 关键配置项

### 4.1 模型选择

| 模型 | 模态 | 用途 |
|---|---|---|
| `deepseek-flash` | 文本 + **图片** | **默认**。截图识别必需 |
| `deepseek-v4-pro` | 仅文本 | 纯文字问答 |

> ⚠️ 用 `deepseek-v4-pro` 截图会失败——它不支持图片输入。

### 4.2 推理强度（已默认关闭）

`DEEPSEEK_REASONING_EFFORT` 控制模型"思考"多久。**默认 `none`——思考完全关闭**。

关闭的理由：
1. 面试场景要的是**立刻出答案**，不是让模型先想 10 秒
2. 思考 token 会占用 `max_tokens` 配额（见 4.3），关闭后彻底规避空答案/截断问题

**同一道 DSA 题实测**：

| 设置 | 耗时 | 思考 token | 说明 |
|---|---|---|---|
| `none` | **~4 秒** | **0** | **默认。思考关闭，最快** |
| `low` | ~5 秒 | 450–540 | 平衡 |
| `high` | 8–10 秒 | 900–1500 | 最深，面试中偏慢 |

流式输出会让首字更早出现（实测 **270–800 ms** 就能看到第一个字）。

设置窗口里的 **Reasoning Effort** 下拉框可随时切换，改完立即生效并写回 `.env`。遇到特别难的题（复杂 DP、系统设计）可以临时调到 `low` 或 `high`。

### 4.3 一个必须知道的坑

**思考 token 会占用 `max_tokens` 配额。**（默认关闭思考后不会遇到，但手动开启时需注意）

实测：`max_tokens=60` 时，44 个 token 被思考吃掉，正文被截断成 `"2 + 2 = 4. If you have 2 items and"`；极端情况下思考占满全部配额，**正文返回空字符串**。

因此：
- 默认 `reasoningEffort: 'none'`，思考完全关闭
- `maxOutputTokens` 仍设为 **8192**（`src/core/config.js`），为手动开启思考留足余量
- 代码对这种情况有专门处理：识别到 `finish_reason === 'length'` 且正文为空时，抛出明确错误而不是静默返回空

```js
// src/services/llm.service.js
if (finishReason === 'length') {
  throw new Error(
    `DeepSeek ran out of tokens while thinking (${reasoning.length} chars of reasoning, no answer). ` +
    'Raise maxOutputTokens or lower DEEPSEEK_REASONING_EFFORT.'
  );
}
```

**若遇到空答案**：把 `DEEPSEEK_REASONING_EFFORT` 设回 `none`，或调高 `maxOutputTokens`。

---

## 4.5 语音功能（Whisper + GPU）

语音转写**已配置完成并实测可用**。

### 安装内容

独立虚拟环境 `E:\MianShi_tools\OpenCluely\.venv-whisper`（不污染系统 Python 和其他项目）：

| 组件 | 版本 | 体积 |
|---|---|---|
| PyTorch (CUDA 12.4) | 2.6.0+cu124 | ~2.5 GB |
| openai-whisper | 20250625 | ~50 MB |
| 模型 `small` | 首次使用时下载 | ~460 MB |

### 硬件

**NVIDIA GeForce RTX 3060 Laptop (6GB)** — CUDA 加速已启用并验证：

```
torch: 2.6.0+cu124    CUDA available: True    GPU: RTX 3060 Laptop GPU
```

### 实测转写效果

用 Windows TTS 生成语音，走应用自己的 worker 转写：

```
输入语音: "Given an array of integers, find two numbers that add up to
           a target. What is the optimal time complexity?"
转写结果: "Given an array of integers, find two numbers that add up to
           a target. What is the optimal time complexity?"   ← 一字不差

device: cuda    转写耗时: 1455ms
```

### 配置

```ini
SPEECH_PROVIDER=whisper
WHISPER_COMMAND=.venv-whisper\Scripts\whisper.exe
WHISPER_MODEL=small
WHISPER_LANGUAGE=auto
WHISPER_DEVICE=cuda
WHISPER_CAPTURE_MODE=vad
```

### 修掉的两个真实 Bug

**Bug 1：中文 Windows 上 Whisper 直接崩溃**

系统区域设置为 zh-CN 时，Python 默认用 GBK 编码 stdout。Whisper 的 `--help` 输出含 GBK 无法表示的字符，导致：

```
UnicodeEncodeError: 'gbk' codec can't encode character '\xbf'
```

后果是探测失败 → **麦克风按钮永远不出现**，即使 Whisper 装好了。

修复：给所有 Python 子进程注入 `PYTHONIOENCODING=utf-8` + `PYTHONUTF8=1`（新增 `pythonChildEnv()` 辅助函数，覆盖 4 处 spawn 调用点）。

**Bug 2：残缺 venv 抢占优先级**

应用会自动在 userData 下建 venv，但只检查 `python.exe` 是否存在，**不验证 whisper 能否真正 import**。当那个 venv 的 torch DLL 损坏时（`OSError WinError 1114: DLL initialization routine failed`），仍会被选中，导致每次转写都失败。

修复：新增 `_canImportWhisper()` 做**真实 import 探测**（`find_spec` 只查文件存在，无法发现 DLL 损坏），选中的解释器必须能真正 `import whisper`。

### 使用方式

| 操作 | 快捷键 |
|---|---|
| 开始/停止录音 | `Alt + R`（被占用时自动降级，见下） |

录音模式（`WHISPER_CAPTURE_MODE`）：
- `vad`（默认）— 自动检测说话停顿，停顿即转写，无需手动停止
- `manual` — 手动开始/停止

回答去向（`WHISPER_RESPONSE_TARGET`）：`chat` / `overlay` / `both`（默认 both）

> **注意**：模型首次加载需约 28 秒（从磁盘读入 GPU）。之后有 60 秒空闲保活，连续使用不会重复加载。`WHISPER_GPU_IDLE_MS` 可调。

---

## 4.6 双通道语音：区分面试官与你自己

这是让工具能真正用于线上面试的关键。默认的单麦克风模式**无法分辨谁在说话**——面试官的问题和你自己的自言自语会被混在一起，导致：

- 你自己说"嗯…这个用双指针吧"，AI 把它当新问题回答一遍
- 面试官闲聊"今天天气不错"，白调一次 API

### 原理

系统同时开**两条独立音频通道**，各自跑独立的 VAD 和转写：

```
系统音频（面试官）  ──► system 通道 ──► [面试官] 标签 ──┐
                                                        ├──► 只有面试官的话触发回答
麦克风（你自己）    ──► mic 通道    ──► [我] 标签    ──┘    你自己的话仅作为上下文
```

| 通道 | 采集方式 | 承载 | 标签 |
|---|---|---|---|
| `system` | `getDisplayMedia` 环回 | 面试官（会议软件播放的声音） | `[面试官]` |
| `mic` | `getUserMedia` | 你自己 | `[我]` |

两条通道**完全隔离**：各自的缓冲、各自的 VAD 状态、各自的转写队列。实测两路音频同时投喂时，互不干扰：

```
[me]          (mic)    Okay, let me think about this one for a moment.
[interviewer] (system) Please explain the difference between A stack and A queue.
```

### 配置

```ini
# 开启系统音频采集（需要共享一次屏幕音频）
WHISPER_SYSTEM_AUDIO=true

# 谁的话触发回答
#   interviewer = 只回答面试官（推荐）
#   me          = 只回答你自己
#   both        = 两者都触发
WHISPER_ANSWER_SOURCE=interviewer
```

设置面板里对应 **Also Listen to System Audio** 和 **Answer Whose Voice** 两项。

### 三种模式的实际效果

| 模式 | 面试官提问 | 你自己说话 | 适用场景 |
|---|---|---|---|
| `interviewer`（推荐） | ✅ 回答 | ⬜ 仅记上下文 | 远程面试，戴耳机 |
| `me` | ⬜ 不回答 | ✅ 回答 | 自己练习 / 念题 |
| `both` | ✅ 回答 | ✅ 回答 | 混合场景 |

### AI 如何区分（提示词层面）

转写文本带标签送进模型，并明确告知规则：

```
[面试官] 请解释快速排序的最坏时间复杂度
[我] 嗯……我想想，应该是 O(n²) 吧

→ 模型只回答面试官那条，把你自己的话当作"已经说过什么"的上下文
→ 如果只有 [我] 的行，模型回 "OK" 保持沉默
```

实测三种场景：

| 输入 | 输出 |
|---|---|
| `[面试官] 请解释快速排序的时间复杂度，最坏情况是什么？` | 完整的中文详解 ✅ |
| `[我] 嗯……这个题我想想，应该是用双指针吧` | `"OK"`（保持沉默）✅ |
| `[面试官] 今天天气不错啊，你住得远吗？` | `"Yeah, I'm listening..."`（不浪费长回答）✅ |

### 使用步骤

1. `Alt + R` 开始录音
2. **系统弹出共享选择框** → 选**你正在开会的那个窗口/屏幕**，并**勾选"分享音频"**
3. 之后面试官说话会标 `[面试官]`，你说话标 `[我]`，只有前者触发回答

> **重要**：
> - 必须**勾选"分享音频"**（Chrome/Electron 的共享对话框底部有个复选框）。只共享画面不共享音频，系统音频通道拿不到数据，应用会自动回退到只听麦克风。
> - 建议**戴耳机**。外放会让面试官的声音从扬声器漏进麦克风，同一个人被两路各转写一次。
> - 如果系统音频启动失败（权限拒绝/未勾选音频），应用会记录日志并**自动降级为仅麦克风**，不会卡死。

### 双通道测试

```powershell
npm run test:dual    # 31 项：通道隔离、独立 VAD、说话人路由、降级逻辑
```

---

## 4.7 快捷键冲突（Alt+R 被 GeForce Experience 占用）

### 现象

按 `Alt+R` 打开的是 **GeForce Experience 的即时回放**，而不是开始录音，应用里毫无提示。

### 原因

`Alt+R` 是 NVIDIA 录屏组件的默认热键，`NVIDIA Share.exe` 开机常驻并**抢先注册**了该组合。Electron 的 `globalShortcut.register()` 在组合已被占用时返回 `false`——但旧代码只在 **debug 级别**记日志，而日志级别是 `info`，失败信息被直接丢弃，用户完全无感知。

### 修复

**① 自动降级**：语音快捷键改为**候选列表**，按顺序尝试，第一个成功的生效：

| 顺序 | 快捷键 | 说明 |
|---|---|---|
| 1 | `Alt+R` | 原默认 |
| 2 | `Ctrl+Shift+R` | ← **本机实际生效** |
| 3 | `Ctrl+Alt+R` | |
| 4 | `Alt+Shift+R` | |
| 5 | `Ctrl+Shift+Space` | |

**② 失败可见**：注册失败改为 `warn` 级别，并在界面上明确告知：

- 快捷键弹窗显示**真实生效的键**（不再是写死的 Alt+R）
- 麦克风按钮悬停提示显示当前键
- 若 `Alt+R` 被占用，弹窗底部给出橙色提示：
  > Alt+R is taken by another app (GeForce Experience, etc.) — speech is now Ctrl+Shift+R.

**③ 可自定义**：想固定用某个键，在 `.env` 里指定（会插到候选列表最前面）：

```ini
SPEECH_SHORTCUT=Ctrl+Shift+R
```

### 本机实测

```
WARN  Global shortcut could not be registered (already taken by another app)
      { "accelerator": "Alt+A" }
WARN  Speech shortcut unavailable, trying next candidate
      { "accelerator": "Alt+R" }
INFO  Speech shortcut registered
      { "accelerator": "CommandOrControl+Shift+R" }
```

> 注意 `Alt+A`（切换鼠标穿透）在本机也被占用了。它没有候选列表，所以仍不可用——但**现在至少能在日志和界面里看到**，而不是静默失效。

### 你的操作

**按 `Ctrl+Shift+R`** 开始/停止录音（不是 Alt+R）。

也可以直接点悬浮条上的**麦克风图标**，效果完全一样。

---

## 4.8 已修复的三个问题

### 问题一：`wgc_capturer_win.cc(255) Source is not capturable` 刷屏

**原因**：`window.manager.js` 里有个"屏幕捕获可用性探测"，每 **5 秒**调用一次
`desktopCapturer.getSources({types:['screen','window']})`。这会让 Chromium 通过
Windows Graphics Capture 枚举并**抓取所有屏幕和窗口的缩略图**。任何抓不到的源
（ToDesk / Oray / GameViewer 等**虚拟显示器**、受保护窗口、最小化窗口）都会各报一条错。

你机器上有 5 个虚拟显示适配器，所以这个错误几乎不停刷。

讽刺的是，这个探测**本身没有用途**——源码注释自己写着"无法判断别人是否在共享屏幕"。

**修复**：
- 轮询间隔 **5 秒 → 60 秒**
- 只枚举 `screen`（不再枚举 `window`，源数量减半）
- **连续失败 3 次后彻底关闭探测**（环境不支持时不浪费资源）
- 成功时重置失败计数

**实测**：25 秒内 `wgc_capturer` 报错 **从持续刷屏降到 0 条**。

### 问题二：系统音频识别效果差

**原因（三个叠加）**：

1. **约束开错了** —— 请求 16 kHz 采样率，但环回音频原生是 **48 kHz 立体声**，
   强行要求 16 kHz 导致 Chromium 重采样质量差
2. **只取左声道** —— `getChannelData(0)` 只读通道 0，右声道有声音时**直接丢失**
3. **音量太低** —— 会议软件音量通常不高，Whisper 在低信号下容易漏词或幻觉

**修复**：
- 约束改为 `sampleRate: 48000` + `channelCount: 2`，让 Chromium 自然重采样
- 显式 **立体声→单声道下混**（AudioContext 统一 16 kHz 输出）
- 系统音频通道加 **1.8 倍增益**（麦克风不加，它已有 `autoGainControl`）
- **关闭回声消除/降噪**（这些是为房间麦克风设计的，会破坏干净的数字音频，
  可能把对方的声音整个"消掉"）

### 问题三（最严重）：转写正常但 LLM 永远不回答

**这是我在上一轮引入的 bug**，而且是**两个叠加的 bug**。

**Bug 3a：`updateSettings` 从未被调用**

`speech.service.js` 有 `updateSettings()` 方法，但**全项目没有任何地方调用它**。
所以设置面板改的值：写进了 `.env`、更新了 `process.env`，但**运行中的 speech service
完全不知道**——必须重启应用才生效。

更糟的是内部还有个**白名单** `speechKeys`，我新加的 `whisperSystemAudio` 和
`whisperAnswerSource` 不在里面，即使调用了也会被丢弃。

**修复**：在 `saveSettings()` 里接上 `speechService.updateSettings()`，
并把白名单补全（同时补上了原本也缺失的 `whisperResponseTarget`）。

**Bug 3b：路由判断用的是"配置"而非"实际状态"**

```js
// 旧逻辑（错）
const systemOn = this._isSystemAudioEnabled();  // 读的是配置值
if (!systemOn && source === 'interviewer') return 'me';
```

如果配置是 `WHISPER_SYSTEM_AUDIO=true`，但**共享音频实际失败了**
（没勾选"分享音频"/权限拒绝），那么：
- 面试官通道**没有任何数据**
- 但我自己的话被判定为"不该回答"
- → **永远不产生任何回答，界面毫无提示**

**修复**：改用 `isSystemAudioLive()` 判断**通道实际是否在采集**：

```js
// 新逻辑（对）
if (source === 'interviewer' && !this.isSystemAudioLive()) {
  return 'me';   // 没有面试官音源 → 降级为回答我自己，绝不静默
}
```

### 实测验证

```
=== 模拟：系统音频通道已开始采集 ===
  getEffectiveAnswerSource = interviewer
  面试官的话是否触发回答  = true
  我自己的话是否触发回答  = false

=== 模拟：共享音频失败，通道被禁用 ===
  getEffectiveAnswerSource = me  <- 自动降级
  我自己的话是否触发回答  = true  <- 仍能工作，不会静默
```

完整链路（真实音频）：

```
系统音频 WAV → Whisper 转写 → [interviewer] 标签 → [面试官] 前缀 → LLM
"What is the time complexity of binary search and why?"
→ "二分查找（Binary Search）的时间复杂度是 O(log n)..."

=== 转写结果 ===
  [interviewer] What is the time complexity of binary search and why?
```

### 新增诊断日志

之前"没有回答"无法定位原因。现在每一步都有明确日志：

```
[SPEECH] Whisper segment result        ← 转写文本（截断 300 字）
         { channel, speaker, audioMs, textLength, text }
[SPEECH] Whisper returned an empty transcript for this segment   ← 没听到
[SPEECH] Dropped likely Whisper silence hallucination            ← 被幻觉过滤
[MAIN]   Speech fragment received      ← 路由决策
         { speaker, shouldAnswer, effectiveAnswerSource, text }
```

---

## 4.9 语音识别引擎（当前：阿里云百炼 DashScope）

### 为什么换引擎

本地 Whisper 的**中文识别不够用**。实测同一段中英混说的面试提问：

| 引擎 | 转写结果 | 问题 |
|---|---|---|
| Whisper `small`（本地） | "...sliding window log... **readies** becomes unavailable" | Redis 错 |
| Whisper `medium`（本地） | 同上，**加载慢 15 倍（108 秒）** | 加大模型无效 |
| paraformer-realtime-v2 | "...**readis** 挂了" | Redis 错 |
| **qwen-audio-3.0-asr-flash-streaming** | "...**Redis** 挂了会怎么样？" | ✅ **全对** |

**关键结论：问题不在模型大小，而在中文/专有名词能力上，换引擎才有解。**

### 实测对比

| 指标 | Whisper small (本地) | **DashScope (云端)** |
|---|---|---|
| 中文准确率 | 一般 | ✅ 优秀 |
| 中英混说 | 弱 | ✅ `Token Bucket` / `Redis` 全对 |
| 首包延迟 | ~1000ms | ✅ **~250ms** |
| 标点 | 需额外处理 | ✅ 自动 |
| 需 GPU | 是 | ❌ 不需要 |
| 花钱 | 免费 | 按量（有免费额度） |
| 联网 | 否 | 是 |

### 架构

复用已有的**双通道**设计，只把底层识别引擎换掉：

```
mic（我）      ──┐
                 ├── 各自一条 DashScope 流式会话 ──→ [我] / [面试官] 标签
system（面试官）──┘
```

**每通道一个独立的云端会话**，这是说话人标签 100% 准确的原因——不依赖云端猜。

与 Whisper 路径的区别：

| | Whisper 路径 | DashScope 路径 |
|---|---|---|
| 断句 | 本地 VAD 状态机 | **云端自动断句** |
| 输出 | 整段转写 | 增量 partial + 终稿 final |
| 手动模式 | 支持 | 不支持（云端自动断句） |

### 配置

```ini
SPEECH_PROVIDER=dashscope
DASHSCOPE_API_KEY=sk-ws-...
DASHSCOPE_ASR_MODEL=qwen-audio-3.0-asr-flash-streaming
DASHSCOPE_WS_URL=wss://maas.qianwenaiapi.com/api-ws/v1/inference
DASHSCOPE_LANGUAGE_HINTS=zh,en
```

`DASHSCOPE_LANGUAGE_HINTS=zh,en` **是关键** —— 声明中英双语后，模型会保留中文里的英文技术术语，不会把它们音译掉。

### 实测结果

双通道并发（两段音频同时投喂）：

```
[me]          (mic)    好的，我先整理一下思路再回答你。
[interviewer] (system) 请你讲一下如何设计一个限流器，Token Bucket和Redis分别适合什么场景？
```

完整链路：

```
系统音频 → DashScope → [interviewer] 标签 → [面试官] 前缀 → LLM
"请你解释一下快速排序的最坏时间复杂度是多少？为什么？"
→ "快速排序（Quicksort）的最坏时间复杂度是 O(n²)...
   n + (n-1) + ... + 1 = n(n+1)/2 = O(n²)"
```

### 测试

```powershell
npm run test:dashscope        # worker 层 16 项（含双通道并发隔离）
npm run test:dashscope:full   # 服务层集成 21 项（provider 切换 + 路由 + 标签）
```

### 想切回本地 Whisper？

改一行即可，两套引擎共用同一套双通道与路由逻辑：

```ini
SPEECH_PROVIDER=whisper
```

或在设置面板的 **Speech Provider** 下拉框切换（改完立即生效，无需重启）。

---

## 4.10 系统音频采集：一个隐藏的致命 Bug

### 现象

**面试官说的话全部被标记成 `[我]`**，AI 因此从不回答面试官，反而去回答你自己的话。

### 根因：Electron 没有默认的 `getDisplayMedia` 实现

这是最隐蔽的一环。日志显示系统音频通道**开启后 88 毫秒就被禁用**：

```
INFO  DashScope system-audio channel started
WARN  Disabling system-audio channel
      "reason": "renderer could not capture system audio"
```

88ms 快到来不及人工操作，说明**不是"忘了勾选分享音频"**。

在应用内直接探测 `getDisplayMedia`，拿到决定性证据：

```json
{ "ok": false, "errorName": "NotSupportedError", "errorMessage": "Not supported" }
```

**Electron 与 Chrome 不同：它不内置屏幕/音频选择器。** 如果主进程没有注册
`session.setDisplayMediaRequestHandler`，调用会**立即抛 `NotSupportedError`**。

所以系统音频**从来就不可能成功** —— 每次都被秒速拒绝，然后降级为仅麦克风，
于是面试官的声音只能从麦克风进来，被标记成 `[我]`。

### 修复

主进程新增 `setupDisplayMediaHandler()`：

```js
appSession.setDisplayMediaRequestHandler(async (request, callback) => {
  // ... 信任检查 ...
  const target = sources.find(s => String(s.display_id) === String(primary.id)) || sources[0];
  callback({
    video: target,
    // Windows 上 loopback 才会把系统混音作为音轨给出
    audio: process.platform === "win32" ? "loopback" : undefined
  });
});
```

**关键三点**：
1. `audio: 'loopback'` —— Windows 上只有传这个值，`getDisplayMedia` 才会附带系统音频轨
2. 自动选主屏，**不需要用户手动操作**（修好后不再弹选择框）
3. 信任检查加了兜底：`request.frame` 在部分 Electron 版本下为空，直接拒绝会导致 `AbortError`

### 实测验证

修复后应用内探测：

```json
{ "ok": true, "videoTracks": 1, "audioTracks": 1, "audioLabels": ["System audio"] }
```

播放声音时实测 loopback 电平：

```
max RMS: 0.138    avg: 0.042    有信号采样: 54/60
```

真实录音的日志：

```
[mic]    → speaker: me          → shouldAnswer: false   ← 我的声音，不触发
[system] → speaker: interviewer → shouldAnswer: true    ← 面试官，触发回答 ✅
```

`effectiveAnswerSource` 稳定为 `interviewer`，**不再降级**。

---

## 4.11 "为什么 AI 只回一个 OK"

### 现象

语音提问后，AI 回复永远是单个 `"OK"`。

### 根因：两层保护互相打架

我加了两道独立的安全机制：

| 层 | 机制 | 意图 |
|---|---|---|
| 路由层 | 系统音频不可用 → 降级为"回答我自己" | 避免永久静默 |
| 提示词层 | "只有 `[我]` 的行 → 回 OK 保持沉默" | 避免回答你的自言自语 |

系统音频一旦失败，第一层让**你自己的话被发送**给 LLM，第二层却按"面试官模式"
判定这是自言自语 → **回 OK**。两层各自合理，合起来就废了。

### 修复：让提示词知道"当前该回答谁"

```js
// main.js：每次请求前同步路由状态
llmService.setAnsweredSpeaker(speechService.getEffectiveAnswerSource());
```

提示词据此切换整套规则：

| 模式 | 规则 |
|---|---|
| `interviewer` | 只答 `[面试官]`；只有 `[我]` 时回 "OK" |
| `me` | **所有 `[我]` 都必须回答**，明确禁止回裸 "OK" |

还补了一条贴近语音现实的要求：

> 判断内容而非标点：口语提问常常没有问号（"讲一下快速排序"），
> 被截断的半句话依然是求助请求。

### 实测

| 模式 | 输入 | 回复 |
|---|---|---|
| `me` | `[我] 我是Agent工程师...` | 简短回应，**不再裸 OK** |
| `me` | `[我] 请你讲一下快速排序` | **完整 O(n²) 详解** |
| `interviewer` | `[面试官] 请你讲一下快速排序` | **完整详解** |
| `interviewer` | `[我] 好的我先想一下` | `"OK"`（设计如此，正确） |

---

## 4.12 面试官的话被标成 [我] 且面板出现重复

### 现象

外放时，面试官说的每一句话在面板上出现**两次**——一条 `[面试官]`、一条 `[我]`。

### 根因：声学回声

两个通道对同一句话各自转写了一遍：

```
面试官声音 → 扬声器 ─┬─→ 系统音频通道（数字直连，label=面试官）
                     └─→ 空气传播 → 麦克风（label=我）   ← 重复来源
```

麦克风的 `echoCancellation` 消不掉这种跨设备回授——它只为"本设备自己播放"调优，
而这里的"回声"是从**另一个通道**独立转写出来的文本，只能事后在文本层去重。

### 第一次尝试的陷阱（值得记录）

直觉做法是"**谁先到谁留下**"。但这在实测中是错的：

```
实测时序：mic 通常比 system 先报出同一句话
（Web Audio 按 4096 帧一块缓冲，环回流本身也要重采样——数字路径未必更快）
```

先到先得 → 保留了 `[我]` 的回声、丢掉了 `[面试官]` 的真话 → **标签全部反转**
→ 而应用只回答面试官 → **彻底静音**。一个看似合理的策略造成了最坏的故障。

### 正确做法：通道优先级 + 追赶撤回

**`system` 通道是权威的**——它是会议软件自己的数字混音，没有房间声学。麦克风那份
从定义上就是回声。

两条规则：

1. **mic 收到与 system 相似的话 → 丢弃**（system 已在场）
2. **system 收到与 mic 相似的话 → 保留，并撤回早先的 mic 气泡**
   （mic 抢跑是常态，晚了 300ms 到达的是真话，把先到的假的撤掉）

### 相似度判定

用**字符二元组 Dice 系数**（中文没有现成分词，单字粒度太细）：

```
实测分布：
  真回声（同一句话的两次转写）      0.90–1.00
  同主题不同句（"项目经验" vs "介绍项目"）0.45–0.55
  无关句子                          <0.20
阈值取 0.62 —— 两侧各留 0.14 / 0.28 余量
```

窗口 4 秒：超过 4 秒后即使文本相同也不算回声（人真的重复问同一句话是正常的，
不该被吞掉）。

### 实测时序（修复后）

```
01:05:30.388 [保留]   me           请你讲一下快速排序...（mic 抢跑）
01:05:30.656 [撤回]                检测到 system 是权威通道
01:05:30.656 [已撤回]              mic 的气泡从面板移除
01:05:30.657 [保留]   interviewer  请你讲一下快速排序...（真话留下）
```

每次播放 = **恰好一条 `[面试官]`**，不再重复，标签不再反转。

### 撤回覆盖三处

气泡只是显性的一层，重复文本有三处要清：

| 位置 | 处理 |
|---|---|
| 聊天面板气泡 | `transcription-retracted` 事件 → `handleTranscriptionRetracted()` 移除 |
| 会话记忆 | `sessionManager.removeLastUserInputMatching()` |
| LLM 上下文 | 会话记忆清了，上下文自然干净 |

### 测试

```powershell
npm run test:echo    # 19 项：相似度分布、双方向去重、对话保护、窗口过期、缓冲上限
```

其中一条断言专门守护**阈值安全区**：

```
dialogueMax=0.48 < threshold=0.62 < echoMin=0.90
```

若日后改了相似度算法导致两个分布漂移进同一区间，这条会先红，提醒重新标定，
而不是让用户在面试中踩到误杀。

---

## 5. 追问理解与个人背景（profile.md）

### 两个核心短板（原项目没有考虑）

**① 面试官的追问听不懂。** 真实面试大量使用指代和补充：

```
面试官：设计一个限流器，可以用哪些算法？
AI：固定窗口、滑动窗口、漏桶、令牌桶……
面试官：你刚才说的第二种，在那种场景下有什么问题？   ← "第二种"指什么？
面试官：对了补充一下，这个限流器是分布式的            ← 补充式提问
面试官：你刚说的召回率提升 23%，怎么做的？           ← 结合你的回答追问
```

原实现只有 8 轮历史且提示词从未教模型"解析指代"，这类追问常被当成孤立的新问题。

**② 模型不知道你是谁。** 问"你简历上的项目"，模型只能**编造**——在真实面试里这是灾难。

### 方案 A：个人上下文（profile.md）

项目根目录的 **`profile.md`** 是 AI 的唯一事实来源，模板如下：

```markdown
## 项目一：电商订单系统（2023.06 – 2024.05）
- 角色：核心开发，负责订单与支付链路
- 架构：Spring Cloud 微服务；MySQL 分 16 库 64 表
- 我做的难点：大促峰值 QPS 5000，Kafka 削峰 + 本地缓存 + 批量落库，
  下单响应 300ms → 80ms
```

注入规则（写在提示词里）：

- "你的项目/经历"类问题**只能引用材料里的事实**
- 材料没有的信息**明确坦承**，再给通用答案，绝不编造数字或细节

**没有 profile.md 时的守卫**：提示词会明确"资料未配置，不得发明雇主/项目/数字"，
防止模型自信编造。

### 方案 B：追问感知提示词

教模型**指代消解**的四类模式与处理流程：

| 模式 | 例子 | 处理 |
|---|---|---|
| 补充式 | "……那如果并发再高一个量级呢？" | 与前句合并成完整问题 |
| 指代词 | "那第二种呢""为什么不用它" | 回溯历史找到具体对象 |
| 指向我的回答 | "你刚说召回率提升，怎么做的" | 与 profile/历史保持一致 |
| 深挖 | "深入讲讲刚才那个难点" | 展开材料里的对应条目 |

流程：短句/含指代词 → **先扫历史找指代对象** → 回答时**可复述确认**
（"你指的是 Token Bucket——"）→ 实在歧义则问一句澄清，不瞎猜。

### 配套调整

语音历史从 **8 条 → 24 条**：DashScope 按停顿断句，一句话会被拆成多个片段，
8 条往往只够一轮半对话，追问需要的 3-4 轮上下文装不下。

### 实测（6 轮追问链）

| 轮次 | 输入 | 结果 |
|---|---|---|
| 2 | 补充式："这个限流器是分布式的" | ✅ 正确切到分布式设计，未重复基础概念 |
| 3 | 指代："你说的**第二种**有什么问题" | ✅ 回溯出四算法列表 → "第二种=滑动窗口" → 主动复述确认 → 针对性作答 |
| 4 | "介绍你简历上的第一个项目" | ✅ 与 profile.md 逐字一致（16库64表 / QPS 5000） |
| 5 | "你刚说 300ms→80ms 怎么做的" | ✅ 解析指代 → 用材料里的真实方案展开 |
| 6 | **材料里没有的**："那个项目日活多少" | ✅ **"这个细节我的材料里没有，我不编具体数字"** + 给出材料里相关事实 |

第 6 轮是防编造的关键验证——模型没有为了"看起来专业"而编一个 DAU。

### 如何使用

1. 编辑 `E:\MianShi_tools\OpenCluely\profile.md`（已有模板），尽量写真实数字与踩坑细节
2. 保存即生效（30 秒内自动重载），无需重启
3. 追问理解无需配置，自动生效

> 什么时候需要 RAG（向量检索）？材料超过 5–10 页时。当前全量注入只有约 1KB，
> 对 128K 上下文是零负担；引入 RAG 反而增加检索失败的风险面。


---

## 5. 代码改动说明

### 5.1 架构

改造遵循**只在传输层替换**的原则，不动上层业务：

```
main.js / session.manager / prompt-loader
        ↓  仍用 Gemini 风格的内部请求对象
src/services/llm.service.js        ← 唯一改动点
        ↓  toDeepSeekParams() 转换
src/services/deepseek.adapter.js   ← 格式转换
        ↓
src/services/deepseek.client.js    ← HTTPS + SSE 传输
        ↓
     api.deepseek.com
```

保留内部 Gemini 请求格式（`contents[].parts[]` / `systemInstruction` / `generationConfig`）的原因：会话管理、提示词加载、流式回调全都依赖它，转换放在边界层意味着**只改一层**，而不是重写所有调用方。

### 5.2 新增文件

| 文件 | 作用 |
|---|---|
| `src/services/deepseek.client.js` | DeepSeek 客户端。零依赖，直接用 Node `https`，支持流式/非流式、错误分类 |
| `src/services/deepseek.adapter.js` | Gemini 请求格式 → OpenAI 消息数组 |
| `scripts/launch.js` | 跨平台启动器（见 5.4） |
| `scripts/test-deepseek.js` | 传输层测试（23 项） |
| `scripts/test-llm-integration.js` | 服务层集成测试（30 项） |
| `scripts/cdp-verify.js` | 通过 CDP 驱动真实 App 做端到端验证 |

### 5.3 修改文件

`src/core/config.js`、`src/services/llm.service.js`、`main.js`、`preload.js`、`src/core/first-run.js`、`src/ui/settings-window.js`、`src/ui/main-window.js`、`settings.html`、`onboarding.html`、`onboarding.js`、`env.example`、`setup.sh`、`package.json`

### 5.4 顺带修掉的两个真实 Bug

**Bug 1：Windows 上 `npm start` 完全不可用**

原 `package.json`：
```json
"start": "env -u ELECTRON_RUN_AS_NODE electron ."
```
`env` 是 Unix 命令，Windows 上直接报 `'env' is not recognized`。已改为 `node scripts/launch.js`（用 Node 删除环境变量并 spawn，三平台一致）。

**Bug 2：设置了 `ELECTRON_RUN_AS_NODE` 时 App 崩溃**

该变量会让 Electron 以纯 Node 模式启动，`app` 为 `undefined`，报 `Cannot read properties of undefined (reading 'commandLine')`。启动器现在会主动清除它。

**其他改进**：
- 流式请求**已输出分片后不再重试**——否则重试会把答案开头重复写进同一个气泡
- 认证/参数错误（401/403/400/404）**不重试**，直接报错，避免无谓等待
- 区分 `BALANCE_ERROR`（余额不足）并给出充值提示
- 修复配置弹窗读 `status.hasApiKey` / `status.model` 但 `getStats()` 不返回这两个字段，导致**永远显示"未配置"**的问题

---

## 6. 验证结果

### 6.1 传输层（23 项全通过）

```
PASS  system message hoisted / model role -> assistant / message count
PASS  maxTokens / temperature / reasoningEffort 映射
PASS  image -> block array / image_url data URL
PASS  got text "PONG" / usage reported
PASS  deltas received — 28 deltas, first at 270ms
PASS  stream matches final — streamed=29 final=29
PASS  vision read the text — "DEEPSEEK OK"
PASS  thinking disabled -> no reasoning tokens
PASS  invalid key rejected — status=401
PASS  bad model rejected — status=400
```

### 6.2 服务层集成（30 项全通过）

真实调用 `llm.service.js`，与 `main.js` 调用方式完全一致：

```
PASS  model=deepseek-flash, provider=deepseek
PASS  testConnection — latency=794ms
PASS  processTextWithSkillStream — 226 chunks, 872 chars, ```cpp 代码块
PASS  processImageWithSkillStream — 80 chunks, 识别出 "DEEPSEEK OK"
PASS  processTranscriptionWithIntelligentResponseStream — O(log n) 正确
PASS  casual filter — "Yeah, I'm listening. Ask your question relevant to dsa."
PASS  bad key -> AUTH_ERROR + 可操作提示
```

### 6.3 真实 App 端到端（CDP 驱动）

```
Onboarding heading: "Connect DeepSeek"        ← 引导页已换品牌
Settings sections: [..., "DeepSeek Settings", ...]
reasoningEffort options: [none, low, high, max]
LLM status via IPC: {isInitialized:true, model:"deepseek-flash", provider:"deepseek"}
Connection test:    {success:true, latency:1234ms, response:"OK"}
[E2E] 真实截屏 → DeepSeek 视觉 → 流式返回 410 个分片
```

截图识别实际输出（截的是我屏幕上的一个终端报错）：

> The image does not contain a DSA problem. It shows a terminal error:
> ```
> fatal: unable to access 'https://github.com/...': Could not resolve host: github.com
> ```
> This is a networking/DNS resolution issue, not an algorithmic problem.

模型正确识别出画面内容、判断出这不是算法题、并给出了针对性的排查建议——**多模态链路完全打通**。

---

## 7. 打包发布

```powershell
npm run build:win      # Windows: NSIS 安装包 + 免安装 portable
npm run build:mac      # macOS: dmg + zip
npm run build:linux    # Linux: AppImage + deb
npm run pack           # 仅生成目录，不打包（调试用）
```

产物在 `dist/`。

> **Windows 打包注意**：`electron-builder` 需要下载额外的打包工具，国内网络可能超时。
> 可设置镜像：
> ```powershell
> $env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
> $env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
> npm run build:win
> ```

**已知限制**：
- Linux 上悬浮窗**无法**对录屏隐身（Electron 的 `setContentProtection` 在 Linux 无实现）
- `.env` 与 API key **不会**被打进安装包（`.gitignore` + `build.files` 已排除），用户首次启动需自己填

---

## 8. 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| `'env' is not recognized` | 旧版 `package.json`。已修复，`npm start` 即可 |
| `Cannot read properties of undefined (reading 'commandLine')` | `ELECTRON_RUN_AS_NODE` 被设置。启动器已自动清除 |
| Electron 装不上 / `dist` 为空 | 用 `ELECTRON_MIRROR` 镜像重装（见 3.1） |
| 截图无反应 | 模型必须是 `deepseek-flash`；`deepseek-v4-pro` 不支持图片 |
| 答案为空或被截断 | 思考 token 吃光了配额。降低 `DEEPSEEK_REASONING_EFFORT` 或调高 `maxOutputTokens` |
| 余额不足 | 报 `BALANCE_ERROR`，去 platform.deepseek.com 充值 |
| 语音不可用 / 没有麦克风按钮 | 已配置好（见 4.5）。若失效，跑 `npm run test-speech` 确认；常见原因是中文 Windows 的 GBK 编码（已修）或 venv 损坏 |
| 首次语音识别很慢（约 28 秒） | 正常，模型首次加载到 GPU。之后 60 秒内连续使用不会重复加载 |
| 答案太慢 | 把 `DEEPSEEK_REASONING_EFFORT` 设为 `none`（约 4 秒） |

---

## 9. 测试命令

```powershell
npm run test:deepseek   # 传输层（23 项）
npm run test:llm        # 服务层集成（30 项）
npm start               # 启动 App

# 端到端验证（需先带调试端口启动）
npm start -- --remote-debugging-port=9333
npm run verify:app
```
