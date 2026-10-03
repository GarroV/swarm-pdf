const puppeteer = require('/Users/garva/sb-smoke/node_modules/puppeteer-core');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({
    executablePath: process.argv[2],
    headless: true,
    defaultViewport: { width: 1400, height: 1000 },
  });
  try {
    const p = await b.newPage();
    p.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 150)));
    await p.goto(
      process.env.BASE + '/edit-pdf-text' + (process.env.EXT || ''),
      { waitUntil: 'load' }
    );
    await (await p.$('#file-input')).uploadFile(process.argv[3]);
    await wait(20000);
    const page = await p.$eval('#page', (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const tool = () =>
      p.$$eval('[data-tool].on', (bs) =>
        bs.map((x) => x.dataset.tool).join(',')
      );
    await p.click('[data-tool="addText"]');
    await wait(300);
    console.log('tool after T:', await tool());
    const bx = page.x + 140,
      by = 495;
    await p.mouse.move(bx, by);
    await p.mouse.down();
    await p.mouse.move(bx + 200, by + 20, { steps: 5 });
    await p.mouse.up();
    await wait(600);
    await p.keyboard.type('Тестово поле', { delay: 10 });
    await wait(500);
    // щелчок мимо — на пустое место страницы
    await p.mouse.click(page.x + 900, 140);
    await wait(1200);
    console.log(
      'editing after click-away:',
      !!(await p.$('.editor [contenteditable]')),
      'tool:',
      await tool()
    );
    // щелчок по созданному полю
    await p.mouse.click(bx + 20, by + 8);
    await wait(800);
    console.log(
      'reselect:',
      await p
        .$eval('.editor [contenteditable]', (e) => e.textContent)
        .catch(() => 'NOT SELECTED')
    );
    await p.screenshot({ path: process.env.SHOT || 'textbox.png' });
  } finally {
    await b.close();
  }
})().catch((e) => console.log('ERR', e.message));
