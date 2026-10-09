# Tablite 开发与发布要求

## 修改前

- 先搜索现有实现及相关测试；不要读取或提交认证、session、日志、缓存等运行态文件。
- Obsidian API 用法以[官方开发文档](https://docs.obsidian.md/)为准。开发依赖的 API 类型版本不等于最低宿主版本；新增运行时 API 必须兼容 `manifest.json` 的 `minAppVersion`，或明确调整兼容范围。

## 设置与插件实现

- 设置页实现 `getSettingDefinitions()`，让 Obsidian 1.13+ 可以索引设置。仍支持旧宿主时保留 `display()`，两条路径共用名称、说明和选项。参照[官方双版本迁移方案](https://docs.obsidian.md/plugins/guides/migrate-declarative-settings)。
- 声明式控件绑定真实的持久化设置键；定义查询不得触发写入。修改设置时验证声明式绑定及旧版界面的保存行为。
- 使用 Obsidian DOM、Vault 和生命周期 API；样式限定在插件范围内，避免 `!important` 和不必要的内联样式。计时器及事件在卸载时清理。
- 持久化数据从 `unknown` 校验后读取。涉及文件编码、异步读取或保存时，保留对过期读取、并发编辑和编码变更的回归测试。
- 剪贴板等必要能力应与实际功能一致，并在反馈中解释；不能为消除评分卡能力提示而悄悄删除功能。

## 合并前验证

依次运行：

```sh
npm ci
npm run lint
npx tsc --noEmit
npm test
npm run build
git diff --exit-code -- styles.css
git diff --check
```

- `npm run lint` 使用[官方 Obsidian ESLint 推荐规则](https://github.com/obsidianmd/eslint-plugin)，要求零错误、零警告；不要为了过检查批量禁用规则。
- 若修改样式，提交构建生成的 `styles.css`，并再次构建确认没有漂移。
- 测试替身不能代替真实 Obsidian 验证；报告中如实说明是否做过宿主 GUI 测试。

## 发布与跟进

- 用户授权发布后，完成检查、合并、发布和跟进，不停在只创建 PR；未授权时不自行发布。
- 发布前同步 `package.json`、`package-lock.json`、`manifest.json` 和 `versions.json` 的版本信息。在已合并且通过检查的提交上打标签，不覆盖既有发布标签。
- 保持发布工作流的类型检查、测试、lint、构建和 GitHub artifact attestation。发布资产为 `main.js`、`styles.css`、`manifest.json`。
- 发布后核对三个资产的版本、内容和构建证明；确认流水线成功不等于确认官方评分卡通过。
- 在已登录的 Obsidian Community 插件管理页使用 **Check for new releases** 触发扫描，确认扫描对应新版本及正确提交，并等待 `Completed` 后检查公开评分卡。不要把 `Pending` 或旧版结果报告成通过。
- 根据真实结果回复相关 issue，提供版本、发布链接和仍有的限制；未经复核不要宣称零警告或直接关闭问题。登录受阻时说明具体待办，不读取认证信息绕过登录。
