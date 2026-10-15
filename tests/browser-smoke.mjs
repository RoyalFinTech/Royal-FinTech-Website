import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const html = readFileSync(resolve(process.cwd(), 'royal_fintech_website.html'), 'utf8');
const passed = [];
const pageErrors = [];
function check(name, condition, detail = '') {
  assert.ok(condition, detail || name);
  passed.push(name);
}
async function waitForHome(page) {
  await page.goto(page.__baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const loader = document.getElementById('loader');
    return !loader || loader.classList.contains('out') || getComputedStyle(loader).visibility === 'hidden';
  }, null, { timeout: 8000 });
  await page.waitForTimeout(350);
}
async function routeIs(page, route) {
  return (await page.locator('#mainSite').getAttribute('data-rft-current')) === route;
}
async function navGeometry(page) {
  return page.locator('#mainNav').evaluate((nav) => {
    const n = nav.getBoundingClientRect();
    const links = [...nav.querySelectorAll('.nav-links a')].filter((a) => getComputedStyle(a).display !== 'none');
    const outOfBounds = links.filter((a) => {
      const r = a.getBoundingClientRect();
      return r.width > 0 && (r.left < n.left - 1 || r.right > n.right + 1);
    }).map((a) => a.textContent.trim());
    return {
      display: getComputedStyle(nav).display,
      right: n.right,
      width: n.width,
      linkCount: links.length,
      outOfBounds
    };
  });
}

const server = createServer((req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405).end();
    return;
  }
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(html);
});
await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(0, '127.0.0.1', resolveListen);
});
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/royal_fintech_website.html`;

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
  page.__baseUrl = baseUrl;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await waitForHome(page);

  // Desktop and common laptop widths must show actual navigation labels, not an invisible menu.
  for (const width of [1366, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await navGeometry(page);
    check(`desktop navigation visible at ${width}px`, geometry.linkCount >= 7, JSON.stringify(geometry));
    check(`desktop navigation stays inside viewport at ${width}px`, geometry.outOfBounds.length === 0, JSON.stringify(geometry));
    check(`desktop hamburger hidden at ${width}px`, await page.locator('#menuBtn').evaluate((el) => getComputedStyle(el).display === 'none'));
  }

  // The first two navigation destinations must switch the page view, not merely scroll.
  await page.locator('#mainNav .nav-links a[href="#about"]').click();
  await page.waitForFunction(() => document.getElementById('mainSite')?.dataset.rftCurrent === 'about');
  check('About navigation opens its own page view', await routeIs(page, 'about'));
  check('Home view is hidden after navigating to About', await page.locator('#hero').evaluate((el) => getComputedStyle(el).display === 'none'));
  await page.locator('#mainNav .nav-links a[href="#products"]').click();
  await page.waitForFunction(() => document.getElementById('mainSite')?.dataset.rftCurrent === 'products');
  check('Our Apps navigation opens its own page view', await routeIs(page, 'products'));
  await page.goBack();
  await page.waitForFunction(() => document.getElementById('mainSite')?.dataset.rftCurrent === 'about');
  check('browser Back restores previous site view', await routeIs(page, 'about'));

  // Verify theme changes update form controls, not only backgrounds.
  await page.locator('#themeBtn').click();
  await page.waitForFunction(() => document.body.classList.contains('light'));
  const lightSelect = await page.locator('#currSelect').evaluate((el) => {
    const c = getComputedStyle(el);
    return { color: c.color, background: c.backgroundColor };
  });
  check('light theme currency dropdown has dark readable text', lightSelect.color === 'rgb(15, 23, 42)', JSON.stringify(lightSelect));
  check('light theme currency dropdown has a white background', lightSelect.background === 'rgb(255, 255, 255)', JSON.stringify(lightSelect));
  await page.locator('#themeBtn').click();
  await page.waitForFunction(() => !document.body.classList.contains('light'));
  const darkSelect = await page.locator('#currSelect').evaluate((el) => {
    const c = getComputedStyle(el);
    return { color: c.color, background: c.backgroundColor };
  });
  check('dark theme currency dropdown has light readable text', darkSelect.color === 'rgb(248, 250, 252)', JSON.stringify(darkSelect));
  check('dark theme currency dropdown has a dark background', darkSelect.background === 'rgb(11, 23, 48)', JSON.stringify(darkSelect));

  // Footer logo, wordmark and one visible TikTok button.
  check('footer exposes exactly one TikTok button', await page.locator('footer a[data-rft-tiktok="true"]').count() === 1);
  check('footer TikTok button is visible', await page.locator('footer a[data-rft-tiktok="true"]').isVisible());
  check('footer TikTok button uses the official account URL', await page.locator('footer a[data-rft-tiktok="true"]').getAttribute('href') === 'https://www.tiktok.com/@royal_fintech');
  await page.waitForFunction(() => {
    const logo = document.querySelector('footer img[data-brand-logo="true"]');
    return logo && logo.complete && logo.naturalWidth > 0;
  }, null, { timeout: 6000 });
  check('official footer logo image loads', await page.locator('footer img[data-brand-logo="true"]').evaluate((el) => el.naturalWidth > 0));
  check('footer wordmark is rendered', (await page.locator('footer .foot-wordmark').innerText()).includes('ROYAL FINTECH') && (await page.locator('footer .foot-wordmark').innerText()).includes('COMPANY'));
  const wordmarkColors = await page.locator('footer .foot-wordmark-main').evaluate((el) => ({
    royal: getComputedStyle(el).color,
    fintech: getComputedStyle(el.querySelector('strong')).color
  }));
  check('footer wordmark has strong white/gold contrast', wordmarkColors.royal === 'rgb(248, 250, 252)' && wordmarkColors.fintech === 'rgb(251, 191, 36)', JSON.stringify(wordmarkColors));

  // Request is a dedicated view and browser history should recover the public site.
  await page.evaluate(() => showPage('requestPage'));
  check('Request App opens its dedicated view', await page.locator('#requestPage').evaluate((el) => getComputedStyle(el).display !== 'none'));
  check('Request App records a browser-history entry', await page.evaluate(() => window.location.hash === '#request'));
  await page.goBack();
  await page.waitForFunction(() => getComputedStyle(document.getElementById('mainSite')).display !== 'none');
  check('browser Back from Request App restores public Home', await page.locator('#adminLogin').evaluate((el) => getComputedStyle(el).display === 'none'));

  // Admin screen is split-screen on desktop, and its embedded visual/photo plus real logo load.
  await page.evaluate(() => showPage('adminLogin'));
  await page.waitForTimeout(200);
  const loginGrid = await page.locator('#adminLogin .rft-admin-login-shell').evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  check('admin login renders split-screen on desktop', loginGrid.split(' ').length >= 2, loginGrid);
  await page.waitForFunction(() => {
    const photo = document.querySelector('#adminLogin .rft-admin-login-photo');
    const logo = document.querySelector('#adminLogin .rft-admin-brand-lockup img[data-brand-logo="true"]');
    return photo && photo.complete && photo.naturalWidth > 0 && logo && logo.complete && logo.naturalWidth > 0;
  }, null, { timeout: 6000 });
  check('admin login photo and official logo load', true);

  await page.evaluate(() => window.rftLockAdminSession());
  await page.waitForFunction(() => getComputedStyle(document.getElementById('mainSite')).display !== 'none');
  check('admin timeout returns to public Home', await page.locator('#mainSite').evaluate((el) => getComputedStyle(el).display !== 'none'));
  check('admin timeout does not leave visitor on Admin Login', await page.locator('#adminLogin').evaluate((el) => getComputedStyle(el).display === 'none'));

  // Mobile menu control must be visible, open, navigate, and close cleanly.
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  mobile.__baseUrl = baseUrl;
  mobile.on('pageerror', (error) => pageErrors.push(error.message));
  await waitForHome(mobile);
  check('mobile hides the desktop link row', await mobile.locator('#mainNav .nav-links').evaluate((el) => getComputedStyle(el).display === 'none'));
  check('mobile hamburger is visible', await mobile.locator('#menuBtn').isVisible());
  await mobile.locator('#menuBtn').click();
  check('mobile hamburger opens the drawer', await mobile.locator('#drawer').evaluate((el) => el.classList.contains('open')));
  check('mobile hamburger reports expanded state', await mobile.locator('#menuBtn').getAttribute('aria-expanded') === 'true');
  await mobile.locator('#drawer a').filter({ hasText: 'About' }).click();
  await mobile.waitForFunction(() => document.getElementById('mainSite')?.dataset.rftCurrent === 'about');
  check('mobile drawer link opens target page view', await routeIs(mobile, 'about'));
  check('mobile drawer closes after navigation', !(await mobile.locator('#drawer').evaluate((el) => el.classList.contains('open'))));
  check('mobile page remains within viewport width', await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  // Report uncaught runtime errors as test failures.
  check('no uncaught JavaScript page errors', pageErrors.length === 0, pageErrors.join('\n'));
  console.log(`Chromium browser smoke test passed: ${passed.length} checks.\n- ${passed.join('\n- ')}`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
