// @vitest-environment jsdom
// Schema round-trips through the real editor extensions: what survives
// generateJSON(html) → generateHTML is exactly what survives setContent in
// the editor, so these lock the table-stripping fix without mounting a view.
// Regression for: tables silently discarded by the visual editor (no table
// nodes in the schema), both on HTML-source toggle and on loading saved posts.
import { describe, it, expect } from 'vitest';
import { generateJSON, generateHTML } from '@tiptap/core';
import sanitizeHtml from 'sanitize-html';
import { SANITIZE_OPTIONS } from '@server/data/sanitize-config.js';
import { buildExtensions } from '../../src/components/editors/RichTextEditor.jsx';

const CONFIGS = {
  'plain (events/bulletin)': buildExtensions({}),
  'alignment+fontSize (posts)': buildExtensions({ alignment: true, fontSize: true }),
};

const roundTrip = (html, exts) => generateHTML(generateJSON(html, exts), exts);

for (const [name, exts] of Object.entries(CONFIGS)) {
  describe(`tables survive the ${name} schema`, () => {
    it('keeps a basic table with a header row', () => {
      const html = '<table><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody><tr><td>Anna</td><td>Elder</td></tr></tbody></table>';
      const json = generateJSON(html, exts);
      const table = json.content.find(n => n.type === 'table');
      expect(table).toBeTruthy();
      expect(table.content[0].content.every(c => c.type === 'tableHeader')).toBe(true);
      const out = roundTrip(html, exts);
      // No <thead> assertion: TipTap renders a single <tbody>; the <th>
      // header cells are what survive.
      expect(out).toContain('<table');
      expect(out).toContain('<th');
      expect(out).toContain('Anna');
    });

    it('keeps colspan and rowspan', () => {
      const html = '<table><tbody><tr><td colspan="2">wide</td></tr><tr><td rowspan="2">tall</td><td>a</td></tr><tr><td>b</td></tr></tbody></table>';
      const out = roundTrip(html, exts);
      expect(out).toContain('colspan="2"');
      expect(out).toContain('rowspan="2"');
    });

    it('keeps the sanitizer-allowed presentation attributes', () => {
      const html = '<table style="background-color: #eeeeee" bgcolor="#ffffff" width="600" align="center" border="1" cellpadding="4"><tbody><tr>'
        + '<td style="padding: 4px" bgcolor="#f0f0f0" align="right" valign="top">x</td></tr></tbody></table>';
      const out = roundTrip(html, exts);
      // The user's table style wins over the generated min-width. jsdom's
      // CSSOM re-serializes hex colors as rgb(), so accept either form.
      expect(out).toMatch(/<table style="background-color: (#eeeeee|rgb\(238, 238, 238\));?"/);
      expect(out).toContain('bgcolor="#ffffff"');
      expect(out).toContain('width="600"');
      expect(out).toContain('align="center"');
      expect(out).toContain('border="1"');
      expect(out).toContain('cellpadding="4"');
      expect(out).toContain('bgcolor="#f0f0f0"');
      expect(out).toContain('align="right"');
      expect(out).toContain('valign="top"');
    });

    it('keeps a mid-document table in place', () => {
      const html = '<p>before</p><table><tbody><tr><td>mid</td></tr></tbody></table><p>after</p>';
      const json = generateJSON(html, exts);
      expect(json.content.map(n => n.type)).toEqual(['paragraph', 'table', 'paragraph']);
      const out = roundTrip(html, exts);
      expect(out.indexOf('before')).toBeLessThan(out.indexOf('<table'));
      expect(out.indexOf('<table')).toBeLessThan(out.indexOf('after'));
    });

    it('keeps a tbody-less pasted table (the original bug shape)', () => {
      const out = roundTrip('<table><tr><td>x</td></tr></table>', exts);
      expect(out).toContain('<table');
      // Cell content is block+, so bare text gets wrapped in a paragraph
      expect(out).toMatch(/<td[^>]*><p>x<\/p><\/td>/);
    });

    it('keeps nested tables (legacy email HTML)', () => {
      const html = '<table><tbody><tr><td><table><tbody><tr><td>inner</td></tr></tbody></table></td></tr></tbody></table>';
      const json = generateJSON(html, exts);
      const outer = json.content.find(n => n.type === 'table');
      expect(outer).toBeTruthy();
      expect(JSON.stringify(outer.content)).toContain('"type":"table"');
      const out = roundTrip(html, exts);
      expect(out).toContain('inner');
      expect((out.match(/<table/g) || []).length).toBe(2);
    });

    it('editor output survives the sanitizer and stored HTML is round-trip stable', () => {
      // The fixture must carry NO table style: a user style suppresses the
      // generated min-width that the first assertion locks (it proves the
      // sanitize-config 'min-width' allowance).
      const html = '<table><tbody><tr><th>Day</th></tr><tr><td>Sunday</td></tr></tbody></table>';
      const saved = sanitizeHtml(roundTrip(html, exts), SANITIZE_OPTIONS);
      expect(saved).toContain('min-width');
      // Save → load into the editor → save again: stored bytes are stable
      expect(sanitizeHtml(roundTrip(saved, exts), SANITIZE_OPTIONS)).toBe(saved);
    });
  });
}
