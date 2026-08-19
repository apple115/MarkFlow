# 本地多笔记本功能设计

> 对应 issue: [APP-15](mention://issue/db604675-c13a-41c3-96e5-c596caf1e8aa)  
> 状态：已确认（方案 A2）  
> 范围：本地优先，暂不同步

---

## 1. 目标

让 MarkFlow 从「单本」变成「多本」，用户可以在 sidepanel 里创建、切换、重命名、删除多个笔记本。第一期只做本地存储，隐藏同步入口，避免与未经验证的同步功能产生预期冲突。

## 2. 当前架构

- **编辑层**：`entrypoints/sidepanel/useMilkdown.ts` 维护单个 `Y.Doc`，通过 `ySyncPlugin` 绑定到 Milkdown。
- **状态层**：`entrypoints/sidepanel/sync.ts` 以 roomKey 为维度把整份 Yjs state 加密上传到 KV；本地仅在 `localStorage` 保存同步配置。
- **UI 层**：`entrypoints/sidepanel/App.tsx` 顶部无「本」的概念，仅有 copy / 截图 / 清空 / 设置。

## 3. 数据模型

```typescript
type Notebook = {
  id: string;           // crypto.randomUUID()
  name: string;         // 可编辑，默认 "笔记本 1"
  updatedAt: number;    // 最后修改时间戳
  state: string;        // Yjs update 经 base64 编码
};

type NotebookStore = {
  notebooks: Notebook[];
  activeId: string;
};
```

存储 key：`markflow_notebooks`，使用 `chrome.storage.local`（`storage` 权限已开，无需改 manifest）。

## 4. 关键设计决策

### 4.1 编辑器生命周期

`useMilkdown` 需要支持按笔记本重建：

- 新增参数 `initialState?: Uint8Array` 与 `notebookId: string`。
- `notebookId` 变化时销毁旧编辑器，创建新的 `Y.Doc` 并 `applyUpdate(initialState)`。
- 返回新的 `ydoc` 供自动保存监听。

切换笔记本时必须先 flush 当前本的 state，再加载目标本的 state。

### 4.2 自动保存

- 监听 `ydoc.on('update')`，debounce 1s 后编码为 base64 写入 `chrome.storage.local`。
- `document.visibilitychange` → hidden 时立即 flush。
- 新建 / 重命名 / 删除笔记本时同步更新 store。

### 4.3 UI：顶部下拉选择器

Header 左侧改为：

```
[● 状态点] [当前笔记本名 ▼]      [Copy][截图▼][清空][设置]
```

下拉菜单内容：

- 笔记本列表，当前项高亮。
- 每项 hover 显示 ⋮ 菜单：重命名 / 删除。
- 底部固定「+ 新建笔记本」按钮。
- 样式复用现有 `DropdownMenu` 动画与配色。

**边界**：删除最后一个笔记本时，自动新建一个空本，保证始终有本可写。

### 4.4 同步入口

本期暂时隐藏设置菜单里的「同步设置」入口（方案 A2），等同步多本方案设计完成后再打开。

### 4.5 数据迁移

首次加载新 schema 时：

- 若当前编辑器非空，将现有 Yjs doc 打包为第一个笔记本，命名为「默认笔记本」。
- 若为空，创建空默认笔记本。
- 之后不再兼容旧单本 state。

## 5. 不在本期范围

- 多笔记本之间的同步 / 绑定。
- 笔记本搜索、排序、标签、图标、导入导出。
- 笔记本级别的设置（如独立的拖拽元信息配置）。

## 6. 验收标准

- [ ] 顶部下拉可新建、切换、重命名、删除笔记本。
- [ ] 切换笔记本后编辑器内容正确加载。
- [ ] 关闭并重新打开 sidepanel 后，上次激活的笔记本与内容恢复。
- [ ] 删除最后一个笔记本时自动创建新空本。
- [ ] 现有单本内容迁移为「默认笔记本」。
- [ ] `typecheck` 与 `build` 通过。

## 7. 预计改动文件

- `entrypoints/sidepanel/App.tsx`：新增 notebook store 管理、header 下拉 UI、隐藏同步入口。
- `entrypoints/sidepanel/useMilkdown.ts`：支持按 `notebookId` 重建编辑器并加载初始 state。
- 新增 `entrypoints/sidepanel/notebooks.ts`：NotebookStore 的 CRUD、持久化、迁移逻辑。
- `entrypoints/sidepanel/settings.ts` 或新增常量：默认笔记本名等配置。
- 可选：调整 header 高度/间距以容纳笔记本名。

## 8. 风险与注意事项

- `chrome.storage.local` 单 key 存储整个 store，笔记本较多或图片较多时可能接近配额。本期暂不做分片，后续若出现性能问题再拆分为 `markflow_notebook_<id>`。
- 同步功能已存在但未经验证；本期隐藏入口不影响底层代码，保留未来扩展可能。
