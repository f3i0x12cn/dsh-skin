#!/usr/bin/env bash
#
# dsh-skin-photo 一键安装。
#
#   curl -fsSL https://raw.githubusercontent.com/f3i0x12cn/dsh-skin-photo/main/install.sh | bash
#
# 在仓库目录里直接跑也可以，那样装的是本地这份而不是 GitHub 上的：
#
#   bash install.sh
#
# 环境变量：DSH_APP（应用路径）、DSH_PROFILE（默认 desktop）、
# DSH_SKIN_REF（git tag/分支，如 v1.0.0）、DSH_CLI（直接指定 CLI）。

set -euo pipefail

REPO="${DSH_SKIN_REPO:-github:f3i0x12cn/dsh-skin-photo}"
REF="${DSH_SKIN_REF:-}"
APP="${DSH_APP:-/Applications/DeepSeek Harness.app}"
PROFILE="${DSH_PROFILE:-desktop}"
CLI="${DSH_CLI:-$APP/Contents/Resources/runtime/cli/bin/dsh}"

say() { printf '%s\n' "$*"; }
die() { printf '错误：%s\n' "$*" >&2; exit 1; }

[ -x "$CLI" ] || die "找不到 DSH CLI：$CLI
如果应用不在默认位置，用 DSH_APP=/Applications/你的路径 指定。"

# 安装器要写 profile；应用还在跑的时候改它，重启后容易打架。
# 两道检查：进程表（某些环境里 pgrep 会被拦），以及 Electron 的单实例锁。
is_running() {
  if command -v pgrep >/dev/null 2>&1 && pgrep -f "$APP/Contents/MacOS/DeepSeek Harness" >/dev/null 2>&1; then
    return 0
  fi
  [ -L "$HOME/Library/Application Support/@deepseek-ai/dsh-desktop/SingletonLock" ]
}

if [ "$PROFILE" = "desktop" ] && [ "${DSH_SKIN_FORCE:-0}" != "1" ] && is_running; then
  die "请先完全退出 DeepSeek Harness（⌘Q），再运行这个脚本。
确认已经退出、仍被拦下时，可以加 DSH_SKIN_FORCE=1 跳过这个检查。"
fi

# 从仓库目录执行时装本地这份，从 curl 管道执行时装 GitHub 上的。
SPEC="$REPO"
SOURCE="${BASH_SOURCE[0]:-}"
if [ -n "$SOURCE" ] && [ -f "$SOURCE" ]; then
  DIR=$(cd "$(dirname "$SOURCE")" && pwd)
  if [ -f "$DIR/package.json" ]; then
    SPEC="$DIR"
  fi
fi
[ -n "$REF" ] && SPEC="$SPEC#$REF"

say "安装来源：$SPEC"
say "目标 profile：$PROFILE"
say ""

"$CLI" plugin --profile "$PROFILE" add "$SPEC"

say ""
say "装好了。重新打开 DeepSeek Harness，在 设置 → 通用 → 背景图皮肤 里调整。"
say "卸载：\"$CLI\" plugin --profile \"$PROFILE\" remove dsh-skin-photo"
