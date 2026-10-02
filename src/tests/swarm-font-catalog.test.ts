import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  catalogEntry,
  catalogFamilies,
  ensureCatalogFont,
} from '../js/editcore/swarm-font-catalog.js';

afterEach(() => vi.unstubAllGlobals());

describe('swarm font catalog', () => {
  it('maps Arial and Helvetica to metric-compatible Liberation Sans', () => {
    expect(catalogEntry('Arial')?.path).toBe('liberation/LiberationSans');
    expect(catalogEntry('Helvetica')?.path).toBe('liberation/LiberationSans');
    expect(catalogEntry('Verdana')).toBeNull();
  });

  it('lists only families that have files behind them', () => {
    expect(catalogFamilies()).toContain('PT Serif');
    expect(catalogFamilies()).not.toContain('Verdana');
  });

  it('loads all four styles under the chosen family name', async () => {
    const fetchMock = vi.fn(
      async () => new Response(new Uint8Array([1, 2, 3]))
    );
    vi.stubGlobal('fetch', fetchMock);
    const fonts = new Map<string, Uint8Array>();
    expect(await ensureCatalogFont('PT Serif', fonts, '/base')).toBe(true);
    expect([...fonts.keys()].sort()).toEqual([
      'PT Serif',
      'PT Serif|00',
      'PT Serif|01',
      'PT Serif|10',
      'PT Serif|11',
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/base/fonts/ptserif/PTSerif-BoldItalic.ttf'
    );
    expect(await ensureCatalogFont('PT Serif', fonts, '/base')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('reports failure instead of pretending the font is ready', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 }))
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await ensureCatalogFont('Roboto', new Map(), '/')).toBe(false);
    expect(await ensureCatalogFont('Verdana', new Map(), '/')).toBe(false);
  });
});
