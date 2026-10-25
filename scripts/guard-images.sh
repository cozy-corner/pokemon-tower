#!/bin/sh
# stdin: ファイルパスの一覧。画像は src/assets/ui/ 以外に、音源はどこにも置かせない(権利の都合)
files=$(cat)
images=$(echo "$files" | grep -Ei '\.(png|jpe?g|gif|webp|bmp|avif|ico|svg)$|(^|/)public/sprites/' | grep -v '^src/assets/ui/')
audio=$(echo "$files" | grep -Ei '\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm|weba|mid|midi)$|(^|/)public/bgm/')
if [ -n "$images$audio" ]; then
  echo "画像は src/assets/ui/ 以外に、音源はどこにも commit できません:" >&2
  printf '%s\n' "$images" "$audio" | grep . >&2
  exit 1
fi
