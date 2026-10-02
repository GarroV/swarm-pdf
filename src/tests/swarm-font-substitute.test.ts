// @vitest-environment node
// SWARM: подмена шрифта для букв, которых нет во встроенном подмножестве (рамка «нет буквы»).
// Ошибка здесь молчаливая: файл сохраняется, а на месте буквы — квадрат.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  substituteUncoveredRuns,
  metricFamily,
} from '../js/editcore/swarm-font-substitute.js';

// Подмножество Liberation Sans только из букв «Приет» — как встраивает Word.
const SUBSET = new Uint8Array(
  readFileSync('src/tests/fixtures/subset-priet.ttf')
);
const FULL = new Uint8Array(
  readFileSync('public/pdfjs-viewer/standard_fonts/LiberationSans-Regular.ttf')
);
const local = new Map([['Liberation Sans|00', FULL]]);
const run = (text: string, extra = {}) => ({
  text,
  family: 'Arial',
  bold: false,
  italic: false,
  sourceIndex: 0,
  ...extra,
});

describe('substituteUncoveredRuns', () => {
  it('не трогает кусок, если встроенный шрифт покрывает все буквы', () => {
    const out = substituteUncoveredRuns(
      [run('Пиет')],
      () => SUBSET,
      () => 'Привет',
      local
    );
    expect(out[0]).toEqual(run('Пиет'));
  });

  it('новая буква, которой нет в подмножестве → Liberation Sans и без привязки к исходному', () => {
    const out = substituteUncoveredRuns(
      [run('Привет вам')],
      () => SUBSET,
      () => 'Приет',
      local
    );
    expect(out[0].family).toBe('Liberation Sans');
    expect(out[0].sourceIndex).toBe(-1);
    expect(out[0].text).toBe('Привет вам');
  });

  it('проверке не верим, если она не подтверждает исходные буквы куска — не трогаем', () => {
    const out = substituteUncoveredRuns(
      [run('Ж')],
      () => SUBSET,
      () => 'Шщ',
      local
    );
    expect(out[0].family).toBe('Arial');
  });

  it('без запасного шрифта нужного начертания не трогаем', () => {
    const out = substituteUncoveredRuns(
      [run('Ж', { bold: true })],
      () => SUBSET,
      () => 'Приет',
      local
    );
    expect(out[0].family).toBe('Arial');
  });

  it('новый кусок без исходного (sourceIndex -1) не трогаем — шрифт выбирает ядро', () => {
    const out = substituteUncoveredRuns(
      [run('Ж', { sourceIndex: -1 })],
      () => SUBSET,
      () => 'Приет',
      local
    );
    expect(out[0].family).toBe('Arial');
  });

  it('семейство подбирается по ширине букв: sans / serif / mono', () => {
    expect(metricFamily('Arial')).toBe('Liberation Sans');
    expect(metricFamily('Helvetica')).toBe('Liberation Sans');
    expect(metricFamily('Times New Roman')).toBe('Liberation Serif');
    expect(metricFamily('Courier New')).toBe('Liberation Mono');
    expect(metricFamily('PT Sans Serif')).toBe('Liberation Sans');
  });
});
