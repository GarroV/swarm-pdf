#!/usr/bin/env bash
# SWARM: заголовок Content-Security-Policy для страниц, которые Swarm открывает во вкладках «PDF».
#
# Зачем. Файл человека обрабатывается в браузере, и единственный способ гарантировать, что он не
# уйдёт наружу даже при ошибке в чужом коде, — запретить странице обращаться куда-либо, кроме
# нашего адреса. connect-src закрывает fetch/XHR/WebSocket/beacon, img-src — вынос через адрес
# картинки, form-action — через отправку формы. frame-ancestors пускает во фрейм только Swarm.
# script-src не трогаем: инструменты исполняют wasm и встроенные скрипты BentoPDF, и запрет на них
# сломал бы инструменты, а утечку данных закрывают директивы выше.
#
# Заголовок ставится только на эти страницы: остальные инструменты BentoPDF ходят за данными на
# CDN (OCR, аннотации) и под таким запретом перестали бы работать. Пишет dist/_headers
# (формат Cloudflare Pages); вызывается из swarm/build.sh после сборки.
set -euo pipefail
cd "$(dirname "$0")/.."

PAGES=(edit-pdf-text merge-pdf split-pdf compress-pdf organize-pdf rotate-pdf sign-pdf image-to-pdf pdf-to-png pdf-to-word)
ANCESTORS="'self' https://swarm-team.app https://swarm-brain.pages.dev https://*.swarm-brain.pages.dev http://localhost:3000 http://localhost:3097"
CSP="connect-src 'self' blob: data:; img-src 'self' blob: data:; form-action 'self'; object-src 'none'; base-uri 'self'; frame-ancestors $ANCESTORS"

out=dist/_headers
: > "$out"
for p in "${PAGES[@]}"; do
  for path in "/$p" "/$p.html"; do
    printf '%s\n  Content-Security-Policy: %s\n\n' "$path" "$CSP" >> "$out"
  done
done
# Просмотрщик PDF.js открывается внутри подписи отдельным документом и тоже получает файл.
printf '%s\n  Content-Security-Policy: %s\n\n' "/pdfjs-viewer/*" "$CSP" >> "$out"
echo "заголовки: $out (${#PAGES[@]} страниц)"
