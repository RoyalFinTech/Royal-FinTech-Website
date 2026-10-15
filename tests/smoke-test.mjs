import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const htmlPath = resolve(process.cwd(), 'royal_fintech_website.html');
const html = readFileSync(htmlPath, 'utf8');
const passed = [];
function check(name, fn) {
  fn();
  passed.push(name);
}
function count(re, source = html) {
  return [...source.matchAll(re)].length;
}

check('primary HTML is present and non-empty', () => {
  assert.ok(html.length > 100_000, 'Primary HTML unexpectedly small');
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /<\/html>\s*$/i);
});

check('all inline JavaScript compiles', () => {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match, index) => ({ source: match[1], index: index + 1 }))
    .filter((item) => item.source.trim());
  assert.ok(scripts.length >= 8, `Expected inline scripts, found ${scripts.length}`);
  for (const script of scripts) {
    assert.doesNotThrow(
      () => new Function(script.source),
      `Inline script #${script.index} failed syntax compilation`
    );
  }
});

check('official logo source and primary branding references exist', () => {
  assert.match(html, /ROYAL_LOGO_SRC\s*=\s*["']data:image\/png;base64,iVBORw0KGgo/);
  assert.ok(count(/data-brand-logo="true"/g) >= 10, 'Expected official-logo placeholders across the site');
  assert.match(html, /foot-wordmark-main[\s\S]{0,100}FINTECH/i);
  assert.match(html, /foot-wordmark-sub[^>]*>COMPANY<\/span>/i);
});

check('top navigation and accessible responsive menu exist', () => {
  const nav = html.match(/<nav id="mainNav">([\s\S]*?)<\/nav>/i);
  assert.ok(nav, 'Main navigation element missing');
  assert.ok(count(/<a\b[^>]*onclick="event\.preventDefault\(\);gotoSection/g, nav[1]) >= 7,
    'Top navigation has too few working destination links');
  assert.match(html, /id="menuBtn"[^>]*aria-controls="drawer"/);
  assert.match(html, /id="drawer"/);
  assert.match(html, /@media\s*\(max-width:\s*1279px\)[\s\S]{0,260}#mainNav \.hamburger\{display:flex!important\}/);
  assert.match(html, /@media\s*\(min-width:\s*1280px\)[\s\S]{0,900}#mainNav \.nav-links\{display:flex!important/);
});

check('all route-view targets exist in the primary HTML', () => {
  const routeBlock = html.match(/var RFT_ROUTE_VIEWS\s*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(routeBlock, 'Route mapping missing');
  const entries = [...routeBlock[1].matchAll(/^\s*([a-zA-Z_$][\w$]*):\s*\[([^\]]*)\],?\s*$/gm)];
  assert.ok(entries.length >= 8, 'Route mapping appears incomplete');
  for (const entry of entries) {
    const targets = [...entry[2].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    for (const target of targets) {
      if (target === 'rf-live-strip') {
        assert.match(html, /class="rf-live-strip"/, `Missing route target: ${target}`);
      } else if (target === 'stats-banner') {
        assert.match(html, /class="stats-banner"/, `Missing route target: ${target}`);
      } else {
        assert.ok(html.includes('id="' + target + '"') || html.includes("id='" + target + "'"),
          `Missing route target: ${target}`);
      }
    }
  }
  assert.match(html, /window\.addEventListener\('popstate'/);
  assert.match(html, /window\.history\.pushState/);
});

check('currency and language dropdowns have theme-aware option contrast', () => {
  assert.match(html, /id="langSelect"/);
  assert.match(html, /id="langSelectMob"/);
  assert.match(html, /id="currSelect"/);
  assert.match(html, /id="currSelectMob"/);
  assert.match(html, /body:not\(\.light\) #mainSite select option[^}]*background:#0b1730!important;color:#f8fafc!important/);
  assert.match(html, /body\.light #mainSite select option[^}]*background:#fff!important;color:#0f172a!important/);
});

check('footer has one visible TikTok icon and no duplicate Contact-page TikTok card', () => {
  const footerStart = html.indexOf('<footer>');
  const footerEnd = html.indexOf('</footer>', footerStart);
  assert.ok(footerStart >= 0 && footerEnd > footerStart, 'Footer missing');
  const footer = html.slice(footerStart, footerEnd);
  const contactStart = html.indexOf('<section id="contact">');
  const contactEnd = html.indexOf('</section>', contactStart);
  assert.ok(contactStart >= 0 && contactEnd > contactStart, 'Contact section missing');
  const contact = html.slice(contactStart, contactEnd);
  assert.equal(count(/data-rft-tiktok="true"/g, footer), 1, 'Footer must contain exactly one TikTok button');
  assert.match(footer, /href="https:\/\/www\.tiktok\.com\/@royal_fintech"[^>]*data-rft-tiktok="true"/);
  assert.match(footer, /footer \.socials \.foot-tiktok-link\{display:inline-flex!important\}/);
  assert.equal(count(/data-social="tiktok"/g, contact), 0, 'Duplicate TikTok card remains in Contact section');
  assert.match(html, /footer a\[data-rft-tiktok="true"\]/);
});

check('footer wordmark, contact links and readable contrast are explicitly styled', () => {
  assert.match(html, /footer \.foot-wordmark-main strong\{color:#fbbf24!important;-webkit-text-fill-color:#fbbf24!important/);
  assert.match(html, /footer \.foot-wordmark-main\{[^}]*color:#f8fafc!important;-webkit-text-fill-color:#f8fafc!important/);
  assert.match(html, /href="tel:\+2204071510"/);
  assert.match(html, /href="https:\/\/wa\.me\/2204071510"/);
  assert.match(html, /href="mailto:royalfintechcompany@gmail\.com"/);
});

check('admin login remains branded and split-screen responsive', () => {
  assert.match(html, /id="adminLogin"/);
  assert.match(html, /class="rft-admin-login-shell"/);
  assert.match(html, /class="rft-admin-login-photo" src="data:image\/webp;base64,UklGR/);
  assert.match(html, /class="rft-admin-brand-lockup"/);
  assert.match(html, /#adminLogin \.rft-admin-login-shell\{display:grid!important;grid-template-columns:minmax\(0,1\.05fr\) minmax\(0,\.95fr\)!important/);
  assert.match(html, /@media\(max-width:760px\)[\s\S]{0,500}#adminLogin \.rft-admin-login-shell\{grid-template-columns:minmax\(0,1fr\)!important/);
});

check('admin timeout returns to public Home without navigating to Admin Login', () => {
  const guardStart = html.indexOf('window.rftLockAdminSession = function()');
  const watcherStart = html.indexOf('// Admin timeout is scoped to an authenticated admin dashboard only.');
  const watcherEnd = html.indexOf('// ---- ADMIN CLOCK ----', watcherStart);
  assert.ok(guardStart >= 0 && watcherStart > guardStart && watcherEnd > watcherStart, 'Admin timeout guard not found');
  const guard = html.slice(guardStart, watcherStart);
  const watcher = html.slice(watcherStart, watcherEnd);
  assert.match(guard, /showPage\('mainSite'\)/);
  assert.doesNotMatch(guard, /showPage\('adminLogin'\)/);
  assert.doesNotMatch(watcher, /showPage\('adminLogin'\)/);
  assert.doesNotMatch(guard + watcher, /session ended\. You are back|session ended\. The public website/i,
    'Old visible timeout banner text remains');
});

check('photo placements and mobile layout safeguards exist', () => {
  assert.ok(count(/https:\/\/images\.unsplash\.com\//g) >= 12, 'Expected workplace/product photography across site');
  assert.match(html, /id="rfHomeGallery"/);
  assert.match(html, /class="rf-services-photo-band"/);
  assert.match(html, /class="rf-contact-banner"/);
  assert.match(html, /overflow-x:clip/);
  assert.match(html, /@media\(max-width:640px\)/);
});

console.log(`Royal FinTech front-end smoke test passed: ${passed.length} checks.\n- ${passed.join('\n- ')}`);
