# AI 读书思维导图馆 (AI Book Mindmaps)

在线交互式电子书思维导图网站，目标部署地址：**https://ai-book-mindmaps.pages.dev**

## 一、项目特性

- **双视图全景交互导图**：
  - **全书专题视图**：全书总览、人物关系与宿命终局图谱、晚明社会与版本艺术专题。
  - **分卷与逐章视图**：五卷阶段脉络导图（每卷20回）+ 全部一百回逐章精细思维导图。
- **富交互功能**：支持节点自由缩放、拖拽平移、一键全展开/精简层级、人物标签筛选、关键词实时检索、深色/浅色宣纸主题切换、Markdown 大纲导出与键盘快捷键（`←` / `→` 切换章节，`B` 折叠侧栏，`F` 居中适配）。
- **严格的源文件隔离（版权与体积保护）**：
  - `.gitignore` 已配置永久忽略 `books/` 目录及所有 `*.epub`、`*.pdf`、`*.mobi`、`*.azw3`、`*.txt` 电子书源文件。
  - **GitHub 仓库与 Cloudflare Pages 仅托管前端页面与提炼后的结构化 JSON 思维导图数据，绝不上传电子书源文件。**
- **多书架扩展架构**：后续在 `books/` 目录添加新书后，只需运行生成脚本即可自动更新 `public/data/books.json` 书架下拉列表。

---

## 二、目录结构

```text
ai-book-minimaps/
├── .gitignore                        # 严格忽略 books/ 及所有电子书源文件
├── wrangler.toml                     # Cloudflare Pages 配置文件 (指向 public 目录)
├── README.md                         # 项目说明与部署指南
├── books/                            # [本地目录，不上传Git] 存放电子书源文件 (.epub 等)
├── scripts/
│   └── generate_mindmap.py           # 本地电子书解析与 AI 思维导图生成脚本
└── public/                           # Cloudflare Pages 静态部署根目录
    ├── index.html                    # 交互式思维导图主页面
    ├── assets/
    │   ├── style.css                 # 响应式深浅双主题样式
    │   └── app.js                    # Markmap 渲染、检索、人物筛选与书架控制逻辑
    └── data/
        ├── books.json                # 馆藏书架索引
        ├── mingchao-naxieshier.json  # 《明朝那些事儿（图文增补全集）》全九部+156章完整导图数据
        └── jinpingmei-chongzhen.json # 《金瓶梅（崇祯本）》全书+百回完整导图数据
```

---

## 三、本地预览方法

使用 Python 内置 HTTP 服务器即可在本地预览（无需安装任何额外依赖）：

```powershell
python -m http.server 8080 --directory public
```

然后在浏览器访问：`http://localhost:8080`

---

## 四、后续如何添加新电子书

1. 将新的电子书（如 `红楼梦.epub`）放入本地 `books/` 目录下（该目录已被 `.gitignore` 忽略，不会被上传到 GitHub）。
2. **方式 A：直接让 AI 助手生成**
   在对话中告诉助手：“我把《XXX》放进了 `books/` 目录，请帮我解析并生成思维导图更新到网站”，助手会自动提取章节并生成高质量导图数据。
3. **方式 B：使用自动化脚本配合云端 API（DeepSeek / Gemini / OpenAI）或本地 Ollama 生成**
   ```powershell
   # 使用 DeepSeek / Gemini / OpenAI 兼容 API
   $env:LLM_API_KEY="你的API_KEY"
   $env:LLM_BASE_URL="https://api.deepseek.com/v1"
   $env:LLM_MODEL="deepseek-chat"
   python scripts/generate_mindmap.py --book "books/新书.epub" --id "new-book-id" --use-llm

   # 或使用本地 Ollama (完全离线)
   python scripts/generate_mindmap.py --book "books/新书.epub" --id "new-book-id" --use-ollama --ollama-model "qwen2.5:14b"
   ```
4. 提交生成后的 `public/data/` JSON 文件并推送至 GitHub，Cloudflare Pages 将自动完成部署更新：
   ```powershell
   git add public/data/
   git commit -m "feat: 新增图书思维导图"
   git push
   ```

---

## 五、部署到 GitHub 与 Cloudflare Pages (`ai-book-mindmaps.pages.dev`)

### 1. 推送到 GitHub
项目已初始化 Git 并排除了 `books/` 目录。如果您已登录 `gh` CLI，可直接创建远程仓库并推送：

```powershell
gh repo create ai-book-mindmaps --public --source=. --remote=origin --push
```

### 2. 连接 Cloudflare Pages 自动部署
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) -> 进入 **Workers & Pages** -> 点击 **Create application** -> 选择 **Pages** -> **Connect to Git**。
2. 选择刚刚推送的 GitHub 仓库 `ai-book-mindmaps`。
3. 配置构建参数（Build settings）：
   - **Project name（项目名称）**：填写 `ai-book-mindmaps`（这样分配的默认域名即为 `https://ai-book-mindmaps.pages.dev`）
   - **Production branch**：`main`
   - **Build command（构建命令）**：留空（无需构建步骤）
   - **Build output directory（构建输出目录）**：填写 `public`
4. 点击 **Save and Deploy**，约 10 秒即可完成全球部署，后续每次 `git push` 都会自动触发更新。
