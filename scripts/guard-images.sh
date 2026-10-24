#!/bin/sh
# stdin: ファイルパスの一覧。画像は src/assets/ui/ 以外に置かせない(権利の都合)
bad=$(grep -Ei '\.(png|jpe?g|gif|webp|bmp|avif|ico|svg)$|(^|/)public/sprites/' | grep -v '^src/assets/ui/')
if [ -n "$bad" ]; then
  echo "画像は src/assets/ui/ 以外に commit できません:" >&2
  echo "$bad" >&2
  exit 1
fi
