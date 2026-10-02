// SWARM: встроенная подборка шрифтов для блока «Шрифт» редактора.
//
// Почему. В списке были зашиты названия (Verdana, Tahoma, Garamond…) без файлов: выбрать их
// можно, но ядру нечем нарисовать кириллицу — на месте букв рамки. Системные шрифты доступны
// только в Chrome/Edge и после разрешения. Теперь в списке только то, что реально встроится:
// подборка с кириллицей (OFL, лежит рядом с редактором, грузится в момент выбора) плюс
// системные, если человек их открыл. Arial / Times New Roman / Courier New подкладываются
// метрически совместимыми Liberation — ширина букв та же, вёрстка документа не плывёт.

const STYLES = {
  '00': 'Regular',
  10: 'Bold',
  '01': 'Italic',
  11: 'BoldItalic',
};

/** family → путь без начертания внутри `fonts/` (файл = `<путь>-<Style>.ttf`). */
export const FONT_CATALOG = [
  { family: 'Arial', path: 'liberation/LiberationSans' },
  { family: 'Times New Roman', path: 'liberation/LiberationSerif' },
  { family: 'Courier New', path: 'liberation/LiberationMono' },
  { family: 'PT Sans', path: 'ptsans/PTSans' },
  { family: 'PT Serif', path: 'ptserif/PTSerif' },
  { family: 'Roboto', path: 'roboto/Roboto' },
  { family: 'Open Sans', path: 'opensans/OpenSans' },
  { family: 'Montserrat', path: 'montserrat/Montserrat' },
  { family: 'Noto Sans', path: 'notosans/NotoSans' },
  { family: 'Noto Serif', path: 'notoserif/NotoSerif' },
];

/** Имена-синонимы, которые документы пишут иначе, → запись каталога. */
const ALIASES = {
  Helvetica: 'Arial',
  'Liberation Sans': 'Arial',
  'Liberation Serif': 'Times New Roman',
  'Liberation Mono': 'Courier New',
};

export function catalogEntry(family) {
  const name = ALIASES[family] || family;
  return FONT_CATALOG.find((f) => f.family === name) || null;
}

export function catalogFamilies() {
  return FONT_CATALOG.map((f) => f.family);
}

const inflight = new Map();

/**
 * Загрузить все начертания шрифта из подборки в провайдер ядра под именем `family`.
 * true — шрифт готов; false — не из подборки или файлы не загрузились (тогда правка идёт как
 * раньше, а сообщение — в консоли).
 */
export function ensureCatalogFont(family, localFonts, baseUrl) {
  const entry = catalogEntry(family);
  if (!entry) return Promise.resolve(false);
  if (
    Object.keys(STYLES).every((k) => localFonts.get(`${family}|${k}`)?.length)
  ) {
    return Promise.resolve(true);
  }
  const key = `${family}@${entry.path}`;
  if (inflight.has(key)) return inflight.get(key);
  const base = String(baseUrl || '/').replace(/\/?$/, '/');
  const job = Promise.all(
    Object.entries(STYLES).map(([k, style]) =>
      fetch(`${base}fonts/${entry.path}-${style}.ttf`)
        .then((r) =>
          r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))
        )
        .then((buf) => {
          const bytes = new Uint8Array(buf);
          localFonts.set(`${family}|${k}`, bytes);
          if (k === '00') localFonts.set(family, bytes);
        })
    )
  )
    .then(() => true)
    .catch((e) => {
      console.warn(
        '[swarm] шрифт из подборки не загрузился:',
        family,
        e?.message ?? e
      );
      return false;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}
