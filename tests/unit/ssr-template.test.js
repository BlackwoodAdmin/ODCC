// Template assembly and initial-data serialization: the parts of server/ssr.js
// that decide what HTML leaves the server.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initSsr, applyTemplate, serializeForScript, buildHeadTags } from '../../server/ssr.js';
import * as entry from '../../src/entry-server.jsx';

const FIXTURE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="build-id" content="dev" />
  <title>Default Title</title>
  <meta name="description" content="Default description" />
  <meta property="og:title" content="Default OG" />
  <meta name="twitter:card" content="summary" />
</head>
<body>
  <div id="root"><!--ssr-outlet--></div>
</body>
</html>`;

function makeDist(template) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-test-'));
  fs.writeFileSync(path.join(dir, 'index.html'), template);
  return dir;
}

describe('serializeForScript', () => {
  it('escapes </script> breakout attempts and stays valid JSON', () => {
    const hostile = { content: '</script><script>alert(1)</script><!--' };
    const json = serializeForScript(hostile);
    expect(json).not.toContain('</script>');
    expect(json).not.toContain('<');
    expect(JSON.parse(json)).toEqual(hostile);
  });

  it('escapes U+2028/U+2029 so the script parses as JS', () => {
    const data = { text: 'a' + String.fromCharCode(0x2028) + 'b' + String.fromCharCode(0x2029) };
    const json = serializeForScript(data);
    expect(json).not.toContain(String.fromCharCode(0x2028));
    expect(json).not.toContain(String.fromCharCode(0x2029));
    expect(JSON.parse(json)).toEqual(data);
  });
});

describe('initSsr failure modes', () => {
  it('stays disabled when the template has no outlet marker', async () => {
    const dist = makeDist(FIXTURE_TEMPLATE.replace('<!--ssr-outlet-->', ''));
    const state = await initSsr({ distDir: dist, entry });
    expect(state.ready).toBe(false);
  });

  it('stays disabled on a build-id mismatch', async () => {
    const dist = makeDist(FIXTURE_TEMPLATE.replace('content="dev"', 'content="other-build"'));
    const state = await initSsr({ distDir: dist, entry });
    expect(state.ready).toBe(false);
  });
});

describe('applyTemplate', () => {
  beforeAll(async () => {
    const state = await initSsr({ distDir: makeDist(FIXTURE_TEMPLATE), entry });
    expect(state.ready).toBe(true);
  });

  it('replaces the outlet with the app html and strips default head tags', () => {
    const page = applyTemplate({
      headTags: buildHeadTags({ title: 'Page Title', description: 'Page desc', urlPath: '/x' }),
      appHtml: '<main>APP CONTENT</main>',
      initialDataJson: serializeForScript({ '/posts?limit=3': { posts: [] } }),
    });
    expect(page).toContain('<main>APP CONTENT</main>');
    expect(page).not.toContain('ssr-outlet');
    expect(page.match(/<title/g)).toHaveLength(1);
    expect(page).toContain('<title data-rh="true">Page Title</title>');
    expect(page).not.toContain('Default OG');
    expect(page).toContain('window.__INITIAL_DATA__=');
  });

  it('keeps hostile initial data inert inside the script tag', () => {
    const page = applyTemplate({
      headTags: null,
      appHtml: '<main>x</main>',
      initialDataJson: serializeForScript({ k: '</script><script>alert(1)</script>' }),
    });
    // headTags null → no data script is injected by applyTemplate's applyHead
    // path, so build one through the full path instead:
    const page2 = applyTemplate({
      headTags: buildHeadTags({ title: 't', description: 'd', urlPath: '/x' }),
      appHtml: '<main>x</main>',
      initialDataJson: serializeForScript({ k: '</script><script>alert(1)</script>' }),
    });
    const script = page2.slice(page2.indexOf('window.__INITIAL_DATA__'));
    expect(script.slice(0, script.indexOf('\n'))).not.toContain('</script><script>alert(1)');
    expect(page).toContain('<main>x</main>');
  });

  it('escapes the request path in og:url', () => {
    const head = buildHeadTags({ title: 't', description: 'd', urlPath: '/x"><script>' });
    expect(head).not.toContain('"><script>');
  });
});
