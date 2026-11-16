# dsh-skin

给 DeepSeek Harness Web 客户端用的外观插件：照片背景 + 半透明玻璃面板，外加品牌换色、
工作区名字配色和会话标题排版（等宽 + 可选的编号或符号标记）。四个开关互相独立，
都在 **设置 → 通用** 里。不改 `app.asar`，不碰随包发布的代码，装成普通 cordis 插件。

## 它做了什么

**背景图**（下面的照片层与玻璃面板）：

- **宿主半** `lib/index.js`：在 DSH 的 web server 上注册 `/dsh-skin` 前缀路由，
  提供内置图片、配置读写、自定义图片上传。
- **客户端半** `lib/client.js`：注入一段样式，给 `<html>` 打属性，并往
  `settings.general.item` 插槽注册一行设置项。
  - `html::before` 是固定定位的照片层（`background-size: cover`，不随对话滚动）；
  - `html::after` 是蒙版层，负责把照片压到文字可读的对比度；
  - `body` 上的 `--dsw-alias-*` 语义色被重声明为半透明，让原生玻璃面板透出照片，
    每个 alpha 都乘 `--dsh-skin-glass`，所以透明度是实时可调的。

  `--dsw-alias-bg-base` 会同时铺在 `body`、layout frame 和中间列三层，alpha 会叠加，
  所以它压得很低（14% / 18%），可读性主要交给蒙版层。

**品牌换色**（`data-dsh-skin-brand`，不依赖背景图那套属性）：

- 鲸鱼改蓝：侧边栏展开的 logo、收起后的轨道 logo、首页标题左边那条小鱼。三处都是
  单条 `<path fill="currentColor">`，给外层 `<svg>` 设 `color` 即可。
- `deepseek` 字标改横向彩虹：字母路径也是 `fill="currentColor"`，用
  `fill: url(#dsh-skin-rainbow)` 换成渐变。渐变用 `userSpaceOnUse` 定义在字标
  自己的坐标系里（`23 → 124`），所以整词是一条连续光谱，不是每个字母各自循环。
  旁边的 `HARNESS` 徽标用 `fill="var(--dsw-alias-label-primary-inverted)"` 画字，
  不匹配这个选择器，保持原样。

**工作区名字彩虹**（`data-dsh-skin-workspace`）：

- 左侧会话列表里的每个工作区名字是**一个纯色**：第一个红、第二个橙、第三个黄绿……
  七个一循环，合起来整列才是彩虹。单个名字内部不做渐变。
- 名字前面的小文件夹图标取同一个颜色（`.slot` 原本给它的是 tertiary 灰），
  名字本身换成等宽字体 + `font-weight: 600`：它是分组标题，和列表里的会话标题
  拉开区分。等宽字体来自主题的 `--ds-font-family-code`。
- 颜色不是写死的选择器（`:nth-of-type` 数不准，工作区行和会话行是混排的），而是客户端
  半按 `[data-row-key^="workspace:"]` 的文档顺序，逐行写进
  `--dsh-skin-name-color`。规则限定在 `._projectText` 下——`.title` 这个类
  会话标题也在用，直接选会连会话名一起染。
- 列表会变（展开分组、搜索、拖动排序、React 换行），所以挂了一个只监听 `childList`
  的 MutationObserver，按 `requestAnimationFrame` 节流后重上色；只写自定义属性、不监听
  属性变化，所以不会被自己触发。
- 色板是给文字调过的（`#e5484d` / `#f76b15` / `#a67c00` / `#30a46c` / `#0d9488` /
  `#3b82f6` / `#8b5cf6`），没用纯 `#ff0000` 那种，浅色和深色主题下都还能读。

**会话标题**（`data-dsh-skin-sessions`）：

- 工作区下面的会话标题换成同一套等宽字体，但保持 `font-weight: 400`：和工作区名字
  同字体不同字重，层级还在。
- 前面自动加标记，可以在设置里选：数字（默认，每个工作区从 1 数起）、圆点、空心圆、
  方块、三角、菱形、星号、箭头、短横，以及「随机符号」。标记是客户端半在同一趟 DOM
  遍历里算出来的，写进标题元素的 `data-dsh-skin-index`，CSS 用
  `content: attr(data-dsh-skin-index)` 显示。
- 随机符号不是每次重绘都换：按会话 id 做一次哈希取池子里的一个，所以同一行在重排、
  展开、切页之后还是同一个符号，不会闪。
- 标记颜色跟着工作区走（和工作区名字同一个色），不是灰的。会话行是工作区行的兄弟节点、
  不是子节点，CSS 变量不会自己降下来，所以客户端半把那行的颜色也写到会话行上。
- 为什么不用 CSS counter：整棵树是一层扁平兄弟节点（工作区行和会话行混排），counter
  没法在"遇到工作区行时归零"——`counter-reset` 只作用于元素的子树，不管兄弟。
- 序号和点一起放进属性值，而不是 `content: attr(x) "."`：`attr()` 缺省值是空串，
  属性还没写上时会渲染出一个孤零零的点。


## 设置面板

设置 → 通用里的「外观皮肤」这一行，四个开关互相独立：

| 控件 | 作用 |
| --- | --- |
| 背景图 → 启用 | 摘掉根属性，立刻回到原生外观（不动配置文件） |
| 不透明度 0–150% | 所有玻璃面板 alpha 的倍率，100% 是调好的默认 |
| 模糊 0–24px | 照片柔化程度；0 是原图，字会变难读 |
| 选择图片… | 本地选图，浏览器里缩到 2560 长边、转 WebP 后交给宿主保存 |
| 品牌换色 → 启用 | 鲸鱼变蓝 + `deepseek` 横向彩虹；`HARNESS` 徽标不动。和背景图开关无关 |
| 工作区名字 → 启用 | 左侧工作区名字逐行纯色、七色循环，小文件夹同色。和背景图开关无关 |
| 会话标题 → 启用 | 会话标题等宽字体 + 按工作区分组自动编号。和前两个开关无关 |
| 会话标题 → 标记 | 数字（默认）/ 圆点 / 空心圆 / 方块 / 三角 / 菱形 / 星号 / 箭头 / 短横 / 随机符号 |
| 恢复默认 | 三个数值、图片和三个配色/排版开关一起回到默认 |

## 状态存在哪

`~/.dsh/skins/skin/`

```
config.json    { "glass": 100, "blur": 6, "enabled": true, "brand": true,
                 "workspaceName": true, "sessions": true, "markers": "number" }
current.webp   自定义图片（没有就是内置图）
```

目录以前叫 `~/.dsh/skins/skin-photo`（包名从 `dsh-skin-photo` 改成 `dsh-skin` 之前）。
宿主启动时会把它整体 rename 成 `skin`，配置和你换的图都不会丢；新目录已经存在时不再动
旧目录，设了 `DSH_SKIN_STATE` 则完全不介入。

**为什么不用 localStorage/IndexedDB**：桌面端每次启动会绑一个新端口
（实测 61199 → 60767 → 57139），而这两个存储都按 origin 隔离，端口一变就全空。
配置放宿主侧才跨重启有效。

图片按 `mtime` 做版本号，URL 带 `?v=`，所以替换后不会被 immutable 缓存挡住。

## 换内置图（不通过界面）

把新图放进 `assets/`，改 `lib/client.js` 里的 `DEFAULT_IMAGE` 文件名并把 `?v=1` 递增。
界面选图那条路不需要这一步——宿主每次上传都会换版本号。

## 接口

| 路由 | 方法 | 说明 |
| --- | --- | --- |
| `/dsh-skin/assets/<file>` | GET | 内置图，immutable 缓存 |
| `/dsh-skin/config` | GET / PUT | 读/合并配置，数值会夹到合法区间 |
| `/dsh-skin/image` | GET / POST / DELETE | 自定义图片，POST 只收 WebP 魔数 |

写操作要求 `x-dsh-skin: 1` 头。这不是鉴权——这些路由在宿主的浏览器 cookie
门禁之外——但它会让跨域页面必须先过 CORS 预检，挡住别的网站顺手改皮肤。

## 测试

这两个脚本只在仓库里有，不进安装包（`files` 白名单不含 `scripts/`，git 安装同样按它裁决）：

```bash
node scripts/smoke.mjs        # 假 DOM + 假 fetch：注册、boot、配置采纳、设置行渲染
python3 scripts/preview.py    # 按真实 alpha 合成预览图 + 算文字对比度
```

`smoke.mjs` 覆盖不了「看起来对不对」，那仍然要开窗口看。
`preview.py` 从 `lib/client.js` 解析 alpha，不会和实际样式漂移（蒙版梯度在 `VEILS` 里镜像一份）。

当前对比度最差处：浅色 6.7:1，深色 7.4:1（WCAG AA 要求 4.5:1）。

## 安装

**一键安装**（先完全退出 DeepSeek Harness）：

```bash
curl -fsSL https://raw.githubusercontent.com/f3i0x12cn/dsh-skin/main/install.sh | bash
```

脚本会定位应用自带的 CLI、检查应用确实已退出，然后把本包作为 profile 的一层装进去。
装完重新打开应用即可。想固定版本：`DSH_SKIN_REF=v1.1.1`（1.1 的功能：品牌换色、
工作区配色、会话标记；1.1.1 修掉内置图 404）。

包名和仓库现在都叫 `dsh-skin`。旧地址（`f3i0x12cn/dsh-skin-photo`）GitHub 会自动重定向，
但建议换成上面的新地址。安装和卸载都以包名为准：`dsh plugin --profile desktop remove dsh-skin`。

从仓库里跑脚本时（`bash install.sh`）装的是本地这份，方便改完直接试。

### 用官方安装器（脚本做的就是这件事）

这个包声明了 `dsh.bundle.patch`，所以安装器会把它当成 profile 的一层：装完自动写进
profile 的 `dsh.profile.bundles`，插件条目由包内 `cordis.patch.yml` 提供，**不需要手写 YAML**。

```bash
# 桌面端必须完全退出后再执行
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop add github:f3i0x12cn/dsh-skin
```

来源也可以换成 npm 包名（需先发布）或本地绝对路径。`dsh` 不在 PATH 里，
所以上面用的是应用自带的 CLI 全路径。

**更新**：`"$DSH" plugin --profile desktop update dsh-skin`，然后重启。

**卸载**：`"$DSH" plugin --profile desktop remove dsh-skin`，重启。
`~/.dsh/skins/skin/`（配置和你换的图）会留着，不需要可以手删。

### 手工安装（不想用安装器和脚本时）

把包目录软链进 `~/.dsh/profiles/desktop/node_modules/dsh-skin`，
在 profile 的 `package.json` 里加依赖 `"dsh-skin": "link:/绝对路径"`，
再把 `dsh-skin` 加进 `dsh.profile.bundles` 数组。条目不写进
`cordis.patch.yml`——那是给用户自己的覆盖层用的。

## 许可证

代码用 MIT，见 [LICENSE](LICENSE)。

`assets/bridge.webp`（内置的栈桥背景）**不包含在 MIT 授权内**：它是本插件的默认素材，
再分发和商用前请自行确认来源与权利。要换掉它只需替换该文件；
用户在界面里选的图只存在自己机器的 `~/.dsh/skins/skin/`，不会进这个仓库。


