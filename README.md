# dsh-skin-photo

给 DeepSeek Harness Web 客户端用的「图片背景 + 玻璃面板」换肤插件。不改 `app.asar`，
不碰随包发布的代码，装成普通 cordis 插件；开关、透明度、模糊、换图都在
**设置 → 通用 → 背景图皮肤** 里，不用改配置文件。

## 它做了什么

- **宿主半** `lib/index.js`：在 DSH 的 web server 上注册 `/dsh-skin-photo` 前缀路由，
  提供内置图片、配置读写、自定义图片上传。
- **客户端半** `lib/client.js`：注入一段样式，给 `<html>` 打属性，并往
  `settings.general.item` 插槽注册一行设置项。
  - `html::before` 是固定定位的照片层（`background-size: cover`，不随对话滚动）；
  - `html::after` 是蒙版层，负责把照片压到文字可读的对比度；
  - `body` 上的 `--dsw-alias-*` 语义色被重声明为半透明，让原生玻璃面板透出照片，
    每个 alpha 都乘 `--dsh-skin-photo-glass`，所以透明度是实时可调的。

  `--dsw-alias-bg-base` 会同时铺在 `body`、layout frame 和中间列三层，alpha 会叠加，
  所以它压得很低（14% / 18%），可读性主要交给蒙版层。

## 设置面板

| 控件 | 作用 |
| --- | --- |
| 启用 | 摘掉根属性，立刻回到原生外观（不动配置文件） |
| 不透明度 0–150% | 所有玻璃面板 alpha 的倍率，100% 是调好的默认 |
| 模糊 0–24px | 照片柔化程度；0 是原图，字会变难读 |
| 选择图片… | 本地选图，浏览器里缩到 2560 长边、转 WebP 后交给宿主保存 |
| 恢复默认 | 三个数值 + 图片一起回到内置栈桥 |

## 状态存在哪

`~/.dsh/skins/skin-photo/`

```
config.json    { "glass": 100, "blur": 6, "enabled": true }
current.webp   自定义图片（没有就是内置图）
```

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
| `/dsh-skin-photo/assets/<file>` | GET | 内置图，immutable 缓存 |
| `/dsh-skin-photo/config` | GET / PUT | 读/合并配置，数值会夹到合法区间 |
| `/dsh-skin-photo/image` | GET / POST / DELETE | 自定义图片，POST 只收 WebP 魔数 |

写操作要求 `x-dsh-skin-photo: 1` 头。这不是鉴权——这些路由在宿主的浏览器 cookie
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
curl -fsSL https://raw.githubusercontent.com/f3i0x12cn/dsh-skin-photo/main/install.sh | bash
```

脚本会定位应用自带的 CLI、检查应用确实已退出，然后把本包作为 profile 的一层装进去。
装完重新打开应用即可。想固定版本：`DSH_SKIN_REF=v1.0.0`。

从仓库里跑脚本时（`bash install.sh`）装的是本地这份，方便改完直接试。

### 用官方安装器（脚本做的就是这件事）

这个包声明了 `dsh.bundle.patch`，所以安装器会把它当成 profile 的一层：装完自动写进
profile 的 `dsh.profile.bundles`，插件条目由包内 `cordis.patch.yml` 提供，**不需要手写 YAML**。

```bash
# 桌面端必须完全退出后再执行
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop add github:f3i0x12cn/dsh-skin-photo
```

来源也可以换成 npm 包名（需先发布）或本地绝对路径。`dsh` 不在 PATH 里，
所以上面用的是应用自带的 CLI 全路径。

**更新**：`"$DSH" plugin --profile desktop update dsh-skin-photo`，然后重启。

**卸载**：`"$DSH" plugin --profile desktop remove dsh-skin-photo`，重启。
`~/.dsh/skins/skin-photo/`（配置和你换的图）会留着，不需要可以手删。

### 手工安装（不想用安装器和脚本时）

把包目录软链进 `~/.dsh/profiles/desktop/node_modules/dsh-skin-photo`，
在 profile 的 `package.json` 里加依赖 `"dsh-skin-photo": "link:/绝对路径"`，
再把 `dsh-skin-photo` 加进 `dsh.profile.bundles` 数组。条目不写进
`cordis.patch.yml`——那是给用户自己的覆盖层用的。

## 许可证

代码用 MIT，见 [LICENSE](LICENSE)。

`assets/bridge.webp`（内置的栈桥背景）**不包含在 MIT 授权内**：它是本插件的默认素材，
再分发和商用前请自行确认来源与权利。要换掉它只需替换该文件；
用户在界面里选的图只存在自己机器的 `~/.dsh/skins/skin-photo/`，不会进这个仓库。


