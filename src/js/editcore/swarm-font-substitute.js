// SWARM: подмена шрифта для букв, которых нет во встроенном шрифте документа.
//
// Почему. Word и другие программы встраивают шрифт подмножеством — только буквы, что были в
// тексте. Ядро редактора (wasm) переиспользует встроенный шрифт и для новых букв, а если буквы в
// нём нет, рисует на её месте рамку «нет буквы». К запасным шрифтам ядро идёт само только для
// «экзотических» письменностей, кириллица и латиница туда не попадают.
//
// Что делаем. Перед превью и сохранением абзаца проверяем каждый кусок текста: покрывает ли его
// встроенный шрифт все буквы. Нет — меняем семейство на метрически совместимое Liberation
// (та же ширина букв, что у Arial/Times/Courier, строка не меняет длину) и снимаем привязку к
// исходному куску, чтобы ядро запросило шрифт у провайдера (`PdfEngine.localFonts`).
//
// Проверка покрытия читает cmap; у части встроенных шрифтов её нет или она символьная — тогда
// проверка врёт «нет» на всё подряд. Поэтому подменяем, только если та же проверка подтверждает
// буквы, бывшие в куске изначально: иначе её ответу не верим и кусок не трогаем.

import { sfntCovers } from './core.js';

export const METRIC_FAMILIES = {
  sans: 'Liberation Sans',
  serif: 'Liberation Serif',
  mono: 'Liberation Mono',
};

const SERIF_RE = /times|serif|georgia|cambria|garamond|book ?antiqua|palatino/i;
const MONO_RE = /courier|mono|consol/i;

export function metricFamily(family) {
  const f = String(family || '');
  if (MONO_RE.test(f)) return METRIC_FAMILIES.mono;
  if (SERIF_RE.test(f) && !/sans/i.test(f)) return METRIC_FAMILIES.serif;
  return METRIC_FAMILIES.sans;
}

export function codepointsOf(text) {
  const out = new Set();
  for (const ch of String(text || '')) {
    if (/\s/u.test(ch)) continue;
    out.add(ch.codePointAt(0));
  }
  return [...out];
}

function styleKey(run) {
  return (run.bold ? 1 : 0) + '' + (run.italic ? 1 : 0);
}

/**
 * Куски абзаца с подменённым шрифтом там, где встроенный не покрывает новые буквы.
 * @param {(srcIndex: number) => Uint8Array | null} fontOf встроенный шрифт исходного куска
 * @param {(srcIndex: number) => string | null} sourceTextOf исходный текст куска (до правки)
 * @param {Map<string, Uint8Array>} localFonts провайдер шрифтов ядра
 */
export function substituteUncoveredRuns(
  runs,
  fontOf,
  sourceTextOf,
  localFonts
) {
  return runs.map((run, i) => {
    const src = Number.isInteger(run.sourceIndex) ? run.sourceIndex : i;
    if (src < 0) return run;
    const target = metricFamily(run.family);
    if (run.family === target) return run;
    if (!localFonts.get(`${target}|${styleKey(run)}`)?.length) return run;
    const want = codepointsOf(run.text);
    if (!want.length) return run;
    const bytes = fontOf(src);
    if (!bytes || !bytes.length) return run;
    if (sfntCovers(bytes, want)) return run;
    const known = codepointsOf(sourceTextOf(src));
    if (!known.length || !sfntCovers(bytes, known)) return run;
    return { ...run, family: target, sourceIndex: -1 };
  });
}

/**
 * Куски, которым человек сменил семейство, отвязываются от исходного куска: иначе ядро
 * переиспользует встроенный шрифт документа и выбор в списке молча не доезжает до файла.
 * Отвязываем, только если байты нового шрифта уже у провайдера — без них ядро нарисует рамки.
 * @param {(srcIndex: number) => {family?: string} | null} sourceOf исходный кусок (до правки)
 */
export function detachRestyledRuns(runs, sourceOf, localFonts) {
  return runs.map((run, i) => {
    const src = Number.isInteger(run.sourceIndex) ? run.sourceIndex : i;
    if (src < 0) return run;
    const before = sourceOf(src)?.family;
    if (!before || !run.family || run.family === before) return run;
    const hasBytes =
      localFonts.get(`${run.family}|${styleKey(run)}`)?.length ||
      localFonts.get(run.family)?.length;
    return hasBytes ? { ...run, sourceIndex: -1 } : run;
  });
}

const STYLE_FILES = {
  '00': 'Regular',
  10: 'Bold',
  '01': 'Italic',
  11: 'BoldItalic',
};

/**
 * Загрузить запасные Liberation в провайдер шрифтов ядра (`PdfEngine.localFonts`).
 * Фоном при открытии редактора: провайдер синхронный, поэтому шрифты должны лежать заранее.
 * Не загрузились — подмена просто не сработает (как было до починки), правка не ломается.
 */
export async function preloadMetricFonts(localFonts, baseUrl) {
  const base = String(baseUrl || '/').replace(/\/?$/, '/');
  const jobs = [];
  for (const family of Object.values(METRIC_FAMILIES)) {
    const file = family.replace(' ', '');
    for (const [key, style] of Object.entries(STYLE_FILES)) {
      const k = `${family}|${key}`;
      if (localFonts.get(k)?.length) continue;
      jobs.push(
        fetch(`${base}fonts/liberation/${file}-${style}.ttf`)
          .then((r) =>
            r.ok
              ? r.arrayBuffer()
              : Promise.reject(new Error(`HTTP ${r.status}`))
          )
          .then((buf) => localFonts.set(k, new Uint8Array(buf)))
          .catch((e) =>
            console.warn(
              '[swarm] запасной шрифт не загрузился:',
              k,
              e?.message ?? e
            )
          )
      );
    }
  }
  await Promise.all(jobs);
}
