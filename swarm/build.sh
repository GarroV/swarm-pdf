#!/usr/bin/env bash
# SWARM: сборка форка для выкладки на Cloudflare Pages одной командой.
#
# Зачем. Инструменты BentoPDF (склейка, сжатие, конвертация) по умолчанию грузят свои движки
# (cpdf, Ghostscript, PyMuPDF) с cdn.jsdelivr.net — чужой код, который получает доступ к файлу
# в браузере. Мы раскладываем те же версии у себя под /wasm/ и указываем их адреса при сборке
# (VITE_WASM_*_URL — штатная настройка BentoPDF, src/js/utils/wasm-provider.ts). Двоичные файлы
# движков (~80 МБ) в git не кладём: скрипт скачивает их из npm при каждой сборке, версии берёт
# из wasm-provider.ts, чтобы не разъехаться с кодом.
#
#   swarm/build.sh            собрать в dist/ и подготовить ../dist-deploy (без libreoffice-wasm)
#   затем: npx wrangler pages deploy <dist-deploy> --project-name swarm-pdf --branch main
set -euo pipefail
cd "$(dirname "$0")/.."

PROVIDER=src/js/utils/wasm-provider.ts
ver() { grep -oE "$1@[0-9][0-9.]*" "$PROVIDER" | head -1 | cut -d@ -f2; }
CPDF_V=$(ver coherentpdf)
GS_V=$(ver 'gs-wasm')
PYMU_V=$(ver 'pymupdf-wasm')
[[ -n "$CPDF_V" && -n "$GS_V" && -n "$PYMU_V" ]] || { echo "не нашёл версии движков в $PROVIDER" >&2; exit 1; }

WASM=public/wasm
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
rm -rf "$WASM" && mkdir -p "$WASM"/{cpdf,gs,pymupdf}
fetch() { # <пакет@версия> <папка внутри пакета или .> <куда>
  (cd "$TMP" && rm -rf package && npm pack -q "$1" >/dev/null && tar xzf ./*.tgz && rm ./*.tgz)
  cp -R "$TMP/package/$2/." "$3/"
  rm -rf "$TMP/package"
}
fetch "coherentpdf@$CPDF_V" dist "$WASM/cpdf"
fetch "@bentopdf/gs-wasm@$GS_V" assets "$WASM/gs"
fetch "@bentopdf/pymupdf-wasm@$PYMU_V" . "$WASM/pymupdf"
echo "движки: cpdf $CPDF_V, gs $GS_V, pymupdf $PYMU_V → $WASM"

# Запасные шрифты Noto (иероглифы, арабица, индийские письменности и т.д.) BentoPDF грузит с
# rawcdn.githack.com — сторонний сервис видит, что открыт редактор и какой шрифт понадобился.
# Кладём те же файлы (закреплённые коммиты googlefonts в font-mappings.ts) к себе в fonts/noto;
# VITE_OCR_FONT_BASE_URL — штатная настройка BentoPDF (src/js/utils/font-loader.ts).
NOTO=public/fonts/noto
mkdir -p "$NOTO"
grep -oE "https://[^'\"]*githack[^'\"]*" src/js/config/font-mappings.ts | sort -u | while read -r url; do
  f="$NOTO/${url##*/}"
  [[ -s "$f" ]] || curl -fsSL --retry 3 -o "$f" "$url" || { echo "не скачался шрифт: $url" >&2; exit 1; }
done
echo "шрифты Noto: $(ls "$NOTO" | wc -l | tr -d ' ') файлов → $NOTO"

# Cloudflare Pages не принимает файлы больше 25 МиБ — проверяем до сборки, а не на выкладке.
big=$(find "$WASM" "$NOTO" -type f -size +25M)
[[ -z "$big" ]] || { echo "файлы больше 25 МиБ, Pages их не примет:" >&2; echo "$big" >&2; exit 1; }

export SIMPLE_MODE=true
export VITE_WASM_CPDF_URL=/wasm/cpdf/
export VITE_WASM_GS_URL=/wasm/gs/
export VITE_WASM_PYMUPDF_URL=/wasm/pymupdf/
export VITE_OCR_FONT_BASE_URL=/fonts/noto
npm run build
swarm/gen-headers.sh

# Сборка правит отслеживаемые файлы (блог, доку заголовков, partials) — откатываем.
git checkout -- blog security-headers-docs.conf src/partials 2>/dev/null || true

OUT=${DEPLOY_DIR:-../dist-deploy}
rm -rf "$OUT" && mkdir -p "$OUT"
rsync -a --exclude libreoffice-wasm dist/ "$OUT/"
echo "готово к выкладке: $OUT"
