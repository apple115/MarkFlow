# MarkFlow 跨设备同步设计方案

## 目标

实现 Markdown 编辑器内容的跨浏览器、跨设备同步。用户在两台设备上打开同一个 sidepanel，内容实时保持一致。

## 核心决策：Yjs 而非自建 OT

OT（Operational Transformation）协议正确实现极其复杂，涉及变换函数（transformation functions）、客户端状态机、服务端状态维护等。对于一个小型浏览器扩展，自建 OT 风险高、bug 多。

**推荐方案：Yjs** — 一个成熟的 CRDT（Conflict-free Replicated Data Type）库，提供与 OT 相同的最终一致性保证，但实现简单得多：

- 不需要中心服务器维护状态机
- 不需要复杂的变换函数
- 天然支持离线编辑、自动合并冲突
- 浏览器原生支持（WebSocket / WebRTC）
- 体积 20KB gzip

如果用户坚持 OT，文末提供自建 OT 的简化方案。

## 架构

```
┌─────────────┐      WebSocket      ┌─────────────────┐
│  Device A   │◄──────────────────►│ Cloudflare      │
│  (Yjs doc)  │                     │ Worker (Signaling│
└──────┬──────┘                     │ + KV persist)   │
       │                            └────────┬────────┘
       │    WebRTC P2P (数据通道)              │
       │◄────────────────────────────────────►│
       │                                     │
┌──────┴──────┐                              │
│  Device B   │                              │
│  (Yjs doc)  │                              │
└─────────────┘                              │
                                             │
                                        ┌────┴────┐
                                        │ KV Store│
                                        │ (states)│
                                        └─────────┘
```

### 为什么 P2P + Signaling？

1. **Cloudflare Worker 不保持连接** — Worker 是无状态的，不能做 WebSocket relay。但可以做 signaling（交换 ICE candidates）。
2. **WebRTC 直连** — 两台设备通过 Worker 交换信令后，直接建立 P2P 连接传输 Yjs 更新。不需要持续连服务器。
3. **大部分时间在本地** — 只有需要同步时才建立连接，断开期间编辑完全离线。

### KV 的作用

- 存储加密后的文档状态快照（每隔 30 秒或手动触发）
- 设备不在线时，新设备可以从 KV 加载最新快照
- 不存储实时编辑流（那是 P2P 的事）

## 密钥系统

### Room Key

```
markflow-xxxxxxxxxxxx
^^^^^^^^  ^^^^^^^^^^^^
前缀      12位随机base58
```

- 安装扩展时自动生成（首次打开 sidepanel）
- 展示在设置里，可复制分享给其他设备
- 其他设备填入后绑定到同一个 room

### 安全

- Room key 只用于标识房间，**不用于加密**
- Yjs 内容用 AES-GCM 加密，密钥从 room key 派生（PBKDF2）
- Worker 只传输密文，无法读取内容

## 数据流

### 首次绑定

```
Device B (新)
  │
  ├── 输入 Room Key → 派生加密密钥
  │
  ├── 向 Worker 请求该 room 的快照
  │
  ├── Worker 从 KV 返回加密快照（如有）
  │
  └── 解密 → 初始化 Yjs doc
       │
       └── 如有其他设备在线，Worker 协助建立 WebRTC 连接
```

### 日常编辑

```
Device A 输入文字
  │
  ├── Yjs 自动编码为 Uint8Array 更新
  │
  ├── 加密更新
  │
  ├── 如果 P2P 连接存在 → 直接发送给 Device B
  │
  └── 如果连接断开 → 暂存本地，重连后同步
```

### 断线重连

```
Device A 断网期间编辑
  │
  ├── Yjs 本地维护完整编辑历史
  │
  ├── 恢复网络 → 重新 signaling → 建立 P2P
  │
  └── 与 Device B 交换缺失的更新（Yjs 自动处理）
```

## Cloudflare Worker API

```typescript
// Worker 路由

// GET /room/:roomId/snapshot
// 返回 KV 中存储的最新加密快照
// 404 = 没有快照（全新 room）

// POST /room/:roomId/snapshot
// 客户端上传加密快照
// KV TTL = 7 天

// GET /room/:roomId/signaling?deviceId=xxx
// WebSocket 升级，用于交换 ICE candidates
// Worker 只转发消息，不解析内容
```

Worker 代码约 100 行，纯信令转发。

## 前端集成（Milkdown + Yjs）

```typescript
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket'; // 或自建 WebRTC provider

// 1. 创建 Yjs document
const ydoc = new Y.Doc();

// 2. 绑定到 Milkdown（通过 ProseMirror）
// Yjs 提供 prosemirror 适配器：y-prosemirror
import { ySyncPlugin } from 'y-prosemirror';

// 3. 在 Editor.make() 中添加 ySyncPlugin
Editor.make()
  .config((ctx) => {
    // ... existing config
  })
  .use(commonmark)
  .use(ySyncPlugin(ydoc.getXmlFragment('prosemirror')))
  // ...
```

Milkdown 底层是 ProseMirror，y-prosemirror 直接提供插件，一行绑定。

## 设置 UI

```
┌──────────────┐
│   同步设置   │
├──────────────┤
│              │
│  你的 Key:   │
│  ┌────────┐  │
│  │markflow│  │ ← 可点击复制
│  │-3xK9mP │  │
│  └────────┘  │
│              │
│  绑定设备:   │
│  ┌────────┐  │
│  │输入 Key│  │ ← 其他设备的 key
│  └────────┘  │
│  [ 绑定 ]    │
│              │
│  状态: ● 在线│
│              │
│  已绑定设备: │
│  • MacBook   │
│  • iPhone    │
│              │
└──────────────┘
```

## 本地优先策略

| 场景 | 行为 |
|------|------|
| 单设备编辑 | 完全离线，不上传 |
| 绑定后双设备在线 | 实时 P2P 同步 |
| 设备 A 离线，B 编辑 | B 离线编辑，A 上线后自动合并 |
| 双设备同时离线编辑 | 上线后 Yjs 自动合并冲突 |
| 长时间未同步 | 从 KV 快照恢复，再补 P2P 增量 |

## 费用估算（Cloudflare）

| 项目 | 费用 |
|------|------|
| Worker 请求 | 免费额度 10万/天 |
| KV 读写 | 免费额度 10万/天 |
| KV 存储 | 1GB 免费 |
| 实际用量 | 纯文本 Markdown，单个 room < 100KB |

**结论：免费额度足够个人使用。**

## 替代方案：自建 OT（不推荐）

如果坚持 OT 而非 Yjs：

1. 用 ot.js 或 sharedb 库
2. Worker 需要维护一个中心化的服务端 document 状态
3. 所有操作必须经过 Worker 转换后再下发
4. Worker 需要保持 WebSocket 连接（Cloudflare Durable Objects，$5/月起步）

复杂度 ×10，可靠性 ↓。

## 实施步骤

1. 创建 Cloudflare Worker + KV
2. 编写 Worker 信令代码
3. 前端集成 Yjs + y-prosemirror
4. 实现密钥生成和设置 UI
5. 实现加密（AES-GCM）
6. 实现 P2P 连接管理（断线重连、快照恢复）
