# 代码块展示优化实现计划（可行性与体验优化版）

## 目标与范围

### 目标

1. 长代码默认折叠，减少滚动负担
2. 预览内容优先展示渲染结果，提高可读性
3. 下载能力可扩展，覆盖源文件与渲染结果
4. 预览失败可恢复，避免卡死或空白

### 非目标（本期不做）

1. 代码块编辑与在线运行
2. 复杂格式导出（如 PDF、PPT）
3. 新增数据类预览（JSON/CSV）

### 成功标准（可验证）

1. 典型对话中长代码块滚动长度下降
2. 预览型内容点击率高于 Code 视图
3. 预览失败时可一键回退到 Code
4. 下载功能无命名冲突、无非法文件名

---

## 体验原则

1. 默认状态不打扰：长代码折叠，预览内容优先渲染
2. 一步可达：任意状态下 1 次点击可到达 Code
3. 失败有退路：预览失败时明确提示并可切换
4. 可预期：同类内容在不同设备上行为一致

---

## 一、三视图架构

```
┌─────────────────────────────────────────────────────┐
│  [📁 Title] [</> Code] [👁️ Preview]    [⬇️] [📋]   │
├─────────────────────────────────────────────────────┤
│                                                      │
│                     内容区域                          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

| 视图        | 用途       | 显示内容                             |
| ----------- | ---------- | ------------------------------------ |
| **Title**   | 卡片式概览 | 文件名、语言类型、行数、可选首行摘要 |
| **Code**    | 源码显示   | 语法高亮的代码                       |
| **Preview** | 渲染预览   | HTML/SVG/Markdown 的渲染结果         |

Title 视图保持轻量，首行摘要为可选项，避免引入额外解析复杂度。

---

## 二、智能默认视图策略（优化规则）

### 语言分类配置

| 分类         | 语言                                   | 默认视图  | 说明               |
| ------------ | -------------------------------------- | --------- | ------------------ |
| **可预览**   | html, svg, xml(svg), markdown, md      | `Preview` | 优先展示渲染结果   |
| **纯文本**   | txt, text, plain                       | `Code`    | 直接显示内容       |
| **编程语言** | js, ts, py, java, go, rust, cpp, c, 等 | `Title`   | 折叠状态，减少滚动 |
| **Mermaid**  | mermaid                                | 独立渲染  | 保持现有逻辑       |

### 优先级规则（从上到下匹配）

1. `Mermaid` → 走现有逻辑
2. `可预览` 且预览可用 → `Preview`
3. 视口 < 640px 且 `编程语言` → `Title`
4. `编程语言` 且行数 <= 12 → `Code`（避免多一次点击）
5. `编程语言` 且行数 > 50 → `Title`
6. `纯文本` → `Code`
7. 其他 → `Title`

### 特殊规则

1. **Preview 未就绪**：可预览内容但预览未完成时，默认为 Title
2. **用户手动切换**：当前会话内保持用户选择（每个代码块独立）

---

## 三、Title 视图设计

```
┌───────────────────────────────────────────────────────┐
│  ┌─────┐  utils.ts                      42 lines    → │
│  │ 📄 │  typescript                                 │
│  └─────┘                                              │
└───────────────────────────────────────────────────────┘
```

### 交互方式（方案 A：纯展示卡片）

- Title 视图只显示标题、语言、行数
- 点击卡片 → 切换到 Code 视图
- 不自动折叠回 Title（减少状态复杂度）
- Tab 按钮允许手动切换回 Title

### Title 解析逻辑

支持的 AI 回复格式：

````markdown
```typescript:utils.ts // 格式1: language:filename.ext
function hello() {}
```
````

````markdown
```html [index.html]          // 格式2: language [filename]
<div>Hello</div>
```
````

````markdown
```python (script.py)          // 格式3: language (filename)
print("Hello")
```
````

**上下文推断（备用）**：

- 解析代码块前的文本
- 匹配模式：`Create file: xxx.ext`, `File: xxx.ext`
- 默认命名：`code_snippet.{ext}`

**文件名清理**：

- 复用后端的 `sanitizeFileName` 逻辑
- 移除危险字符：`< > : " | ? *`
- 限制长度：最大 255 字符

---

## 四、Preview 状态与错误处理

### 状态设计

1. **Loading**：渲染中显示骨架或轻提示
2. **Success**：正常渲染
3. **Error**：显示错误提示与退路按钮

### 错误边界组件

```
┌─────────────────────────────────────────────────────┐
│                    ⚠️ Preview failed                 │
│              An error occurred while...             │
│                                                      │
│              [🔄 View Code]                         │
└─────────────────────────────────────────────────────┘
```

- iframe 渲染错误时显示友好提示
- 提供 "View Code" 按钮切换到源码视图
- 记录错误日志（含语言、文件名、错误信息）

---

## 五、下载功能增强（更可行的分层实现）

### 下拉菜单设计

```
┌──────────────────┐
│ 📥 Download      │
├──────────────────┤
│ 📄 utils.ts      │  ← 源文件
│ 🖼️ Export as PNG │  ← 渲染结果（仅 SVG/HTML）
└──────────────────┘
```

### 支持的下载格式

| 语言     | 源文件  | 渲染结果                     |
| -------- | ------- | ---------------------------- |
| SVG      | `.svg`  | `.png`                       |
| HTML     | `.html` | `.png`（懒加载 html2canvas） |
| Markdown | `.md`   | -（本期不做）                |
| 其他     | `{ext}` | -                            |

**实现策略**：

1. 源文件下载（已有）
2. SVG → PNG（已有）
3. HTML → PNG（新增，按需加载依赖）

**命名策略**：

- 多个代码块同名时追加序号后缀 `-2`, `-3`
- 下载时统一走 `sanitizeFileName`

---

## 六、实现步骤（更可执行）

### Phase 0: 现状梳理

1. 确认现有 Code/Preview 的默认行为与状态管理方式
2. 盘点现有下载逻辑与依赖

### Phase 1: 基础设施

1. 创建 `languageConfig.ts`
   - 语言分类配置
   - 导出 `getLanguageConfig()`

2. 创建 `titleParser.ts`
   - `parseCodeBlockTitle()`
   - `inferTitleFromContext()`
   - `generateFriendlyTitle()`

3. 创建 `tabSelector.ts`
   - `getDefaultTab()`（优先级规则）

4. 更新 `types.ts`
   - `CodeBlockTab = 'title' | 'code' | 'preview'`
   - `LanguageCategory`
   - `CodeBlockMeta`
   - `DownloadOption`

### Phase 2: 新组件

1. `TitleView.tsx`
   - 卡片式 UI
   - 点击切换到 Code

2. `PreviewErrorBoundary.tsx`
   - 错误边界
   - "View Code" 退路

3. `DropdownMenu.tsx`
   - 下载选项
   - 点击外部关闭

### Phase 3: 核心重构

1. `DownloadButton.tsx`
   - 支持多格式
   - 下拉菜单逻辑

2. `CodeBlockWithPreview.tsx`
   - 三视图切换
   - 智能默认 Tab
   - Preview 状态处理

3. `index.tsx`
   - 传递上下文信息用于标题推断
   - 保持 Mermaid 与 KaTeX 独立处理

4. 新增客户端 `sanitizeFileName.ts`
   - 放在 `apps/web/app/lib/`

### Phase 4: 测试与优化

1. 单元测试
   - `titleParser.test.ts`
   - `tabSelector.test.ts`
   - `sanitizeFileName.test.ts`

2. 集成测试
   - 语言类型渲染覆盖
   - Preview 失败场景
   - 下载功能验证

3. 性能优化
   - 大代码块只渲染可见区域
   - Preview 延迟加载
   - HTML → PNG 依赖按需加载

---

## 关键文件清单

### 需要修改的文件

| 文件路径                                              | 改动类型 | 说明           |
| ----------------------------------------------------- | -------- | -------------- |
| `apps/web/app/components/chat/markdown/CodeBlock.tsx` | 重构     | 集成三个 Tab   |
| `apps/web/app/components/chat/markdown/types.ts`      | 扩展     | 新类型定义     |
| `apps/web/app/components/chat/markdown/utils.ts`      | 扩展     | 标题解析等工具 |
| `apps/web/app/components/chat/markdown/index.tsx`     | 小改     | 传递上下文     |

### 需要新建的文件

| 文件路径                                                         | 说明          |
| ---------------------------------------------------------------- | ------------- |
| `apps/web/app/components/chat/markdown/languageConfig.ts`        | 语言分类配置  |
| `apps/web/app/components/chat/markdown/titleParser.ts`           | 标题解析工具  |
| `apps/web/app/components/chat/markdown/tabSelector.ts`           | 默认 Tab 逻辑 |
| `apps/web/app/components/chat/markdown/TitleView.tsx`            | Title 视图    |
| `apps/web/app/components/chat/markdown/PreviewErrorBoundary.tsx` | 预览错误边界  |
| `apps/web/app/components/chat/markdown/DropdownMenu.tsx`         | 下载下拉      |
| `apps/web/app/lib/sanitizeFileName.ts`                           | 文件名清理    |

---

## 设计决策说明（补充约束与理由）

### 决策 1: Title 视图交互方式

**采用**：纯展示卡片（点击后切换到 Code，不自动折叠回）

**理由**：

- 状态管理简单
- 用户意图明确
- 视觉上更像“摘要卡片”

### 决策 2: Preview 支持范围

**采用**：HTML + SVG + Markdown（Markdown 仅渲染，暂不导出）

**理由**：

- HTML/SVG 已有支持
- Markdown 渲染常用且实现成本低
- 文档导出复杂度高，后续再评估

### 决策 3: 大代码块默认行为

**采用**：编程语言 > 50 行默认 Title；<= 12 行默认 Code

**理由**：

- 减少滚动
- 避免短代码块多一次点击

### 决策 4: 下载功能分期

**采用**：三阶段

**理由**：

- 已有能力优先复用
- 依赖加载按需，控制体积
- 复杂导出延后

---

## 验证测试

### 功能测试清单

- [ ] Title 视图正确显示文件名和行数
- [ ] 点击 Title 视图切换到 Code 视图
- [ ] 编程语言长代码块默认为 Title 视图
- [ ] 编程语言短代码块默认为 Code 视图
- [ ] HTML/SVG 代码块默认为 Preview 视图
- [ ] 纯文本代码块默认为 Code 视图
- [ ] Preview 错误时显示友好提示并可回退
- [ ] 下载按钮在多选项时显示下拉
- [ ] SVG 下载支持 SVG / PNG
- [ ] 文件名正确清理危险字符
- [ ] 标题解析正确
- [ ] 默认命名无冲突
- [ ] 移动端编程语言默认 Title 视图

### 浏览器测试

- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari
- [ ] 移动端 Safari (iOS)
- [ ] 移动端 Chrome (Android)

---

## 风险与缓解

1. **iframe 沙箱限制**：HTML 预览可能受限
   - 缓解：保持 sandbox 最小权限，失败可回退 Code
2. **文件名冲突**：多代码块同名
   - 缓解：追加序号后缀
3. **大文件性能**：超长代码块渲染慢
   - 缓解：虚拟化或延迟渲染
4. **Markdown 递归渲染**：潜在无限递归
   - 缓解：预览渲染时禁止嵌套代码块或设置最大深度

---

## 里程碑（建议）

1. Phase 0-1：基础能力可运行
2. Phase 2：Title/错误边界完成
3. Phase 3：核心三视图上线
4. Phase 4：测试与性能优化
