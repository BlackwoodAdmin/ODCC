import { describe, it, expect } from 'vitest';
import { simpleParser } from 'mailparser';

const fixture = [
  'From: tester@example.com',
  'To: me@opendoorchristian.church',
  'Subject: cid contract',
  'MIME-Version: 1.0',
  'Content-Type: multipart/related; boundary="b"',
  '',
  '--b',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p><img src="cid:abc@x" alt="x"></p>',
  '--b',
  'Content-Type: image/png',
  'Content-Transfer-Encoding: base64',
  'Content-ID: <abc@x>',
  'Content-Disposition: inline; filename="x.png"',
  '',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  '--b--',
].join('\r\n');

describe('mailparser keepCidLinks contract', () => {
  it('preserves cid: in html when keepCidLinks=true', async () => {
    const parsed = await simpleParser(fixture, { keepCidLinks: true });
    expect(parsed.html).toContain('cid:abc@x');
    expect(parsed.html).not.toMatch(/data:image/i);
  });

  it('rewrites cid: to data: when keepCidLinks is unset (pins default)', async () => {
    const parsed = await simpleParser(fixture);
    expect(parsed.html).toMatch(/data:image\/png/i);
    expect(parsed.html).not.toContain('cid:abc@x');
  });
});

describe('mailparser empty-content MIME parts', () => {
  const emptyPartFixture = [
    'From: tester@example.com',
    'To: me@opendoorchristian.church',
    'Subject: empty inline part',
    'MIME-Version: 1.0',
    'Content-Type: multipart/related; boundary="b"',
    '',
    '--b',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p><img src="cid:empty@x" alt="x"></p>',
    '--b',
    'Content-Type: image/png',
    'Content-ID: <empty@x>',
    'Content-Disposition: inline; filename="empty.png"',
    'Content-Transfer-Encoding: base64',
    '',
    '',
    '--b--',
  ].join('\r\n');

  it('produces an attachment object with falsy or zero-length content for an empty inline part', async () => {
    const parsed = await simpleParser(emptyPartFixture, { keepCidLinks: true });
    expect(parsed.attachments).toHaveLength(1);
    const att = parsed.attachments[0];
    expect(att.contentId).toBe('<empty@x>');
    // `content` is either undefined or zero-length Buffer; both fail the
    // `att.content && att.content.length > 0` guard in the inbound handler
    // and fall into the defensive else branch.
    expect(!att.content || att.content.length === 0).toBe(true);
  });
});
