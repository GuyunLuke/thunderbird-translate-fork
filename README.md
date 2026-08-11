# ![Thunderbird Translate icon](/src/assets/icon-32.png) Thunderbird Translate Fork

一键翻译邮件正文（HTML 或纯文本）的 Thunderbird 扩展，翻译结果以横幅显示在邮件顶部。

本项目是 [sully-vian/thunderbird-translate](https://github.com/sully-vian/thunderbird-translate) 的 fork，在保留原版功能（Gemini 翻译引擎、HTML 结构保留）的基础上增加了多 provider 支持与更完善的配置能力。

## 新增功能（相对原版）

- **多种 API 提供商**：Google Gemini / DeepSeek / 任意 OpenAI 兼容端点（OpenAI、DeepSeek、Ollama、LM Studio、中转站等）
- **模型自动探测**：填写 API 密钥后自动拉取 provider 的模型列表（`GET /models`）填充下拉菜单，无需手动输入
- **密钥与模型按 provider 隔离**：每个 provider 独立保存自己的 API 密钥与所选模型，切换 provider 不会串用
- **DeepSeek 专用模式**：锁定官方端点 `https://api.deepseek.com`，自动关闭思考模式（`thinking: disabled`）以获得快速响应
- **翻译目标语言**：自动（跟随界面语言，原版行为）或固定为中文 / English / Français
- **界面语言切换**：中文（默认）/ English / Français
- **重模板邮件优化**：翻译前在隐藏 iframe 中真实渲染邮件，只提取 CSS 实际显示的文本（自动跳过 `display:none` 预览段、媒体查询隐藏的变体等），并做段落级去重，避免模板冗余内容进入翻译请求

## 设置

在设置页完成配置（可从邮件横幅或附加组件管理器中打开）：

1. **API Provider**：Google Gemini / DeepSeek / OpenAI-compatible 三选一
2. **API 密钥**：当前 provider 专属密钥，输入后自动探测模型列表
3. **模型**：下拉选择探测到的模型；探测失败时留空（翻译使用该 provider 的默认模型）
4. **Base URL**（仅 OpenAI-compatible 模式）：自定义端点，如 `https://api.openai.com/v1`、`http://localhost:11434/v1`（Ollama）
5. **翻译目标语言**：自动 / 中文 / English / Français
6. 点击 **保存并测试** 验证配置并持久化

API 密钥获取：Google Gemini 可在 [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey) 免费申请；DeepSeek 在 [https://platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) 申请。

## 使用

在邮件工具栏点击翻译按钮，翻译横幅会出现在邮件顶部，带有一个打开设置页的链接。

## 隐私 / 数据发送

- 发送内容：仅邮件正文（HTML 会先提取为纯文本）发送给你配置的翻译服务商
- 不发送：账号密码、邮箱凭据、邮件头、收件人、主题、附件及任何邮箱元数据
- API 密钥：保存在扩展本地存储（`browser.storage.local`），仅用于向配置的 provider 验证请求
- 建议：请勿翻译敏感或机密内容

## 构建

```bash
# 安装依赖
npm install

# 开发构建（不压缩）
npm run build:dev

# 生产构建（压缩）
npm run build:prod

# 打包为 .xpi
npm run build:xpi
```

调试：构建后在 Thunderbird 中通过"加载临时附加组件"加载 `dist/manifest.json`，或直接安装打包好的 `.xpi`。

## 许可证

本项目使用 [MPL-2.0](LICENSE)（Mozilla Public License 2.0），与原仓库 [sully-vian/thunderbird-translate](https://github.com/sully-vian/thunderbird-translate) 一致。根据 MPL-2.0 要求，本 fork 保留原始版权声明与许可文本，修改记录可通过 git 历史追溯。

## 致谢

- 原项目：[sully-vian/thunderbird-translate](https://github.com/sully-vian/thunderbird-translate)
- 图标：[Bootstrap Icons - Translate](https://icons.getbootstrap.com/icons/translate/)
- HTML 净化：[DOMPurify](https://dompurify.com/)
