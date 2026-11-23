// -----------------------------------------------------------
//  [*] Tests — utils/chunkReload.js, utils/diff.js,
//              utils/download.js
//
//  The stale-deploy recovery (which errors mean "the chunk is
//  gone", one automatic reload and no loop), the prompt
//  version diff (head/tail trim, the LCS middle, line numbers,
//  the size ceiling, CRLF), and the authenticated download
//  (bearer, the Content-Disposition name, the temporary link
//  and object URL, a JSON error hidden in a Blob).
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { isChunkLoadError, reloadOnce } from '@/utils/chunkReload';
import { diffLines, diffStats } from '@/utils/diff';
import { downloadFile, filenameFrom } from '@/utils/download';
import { errorMessage } from '@/utils/errors';
import { setToken } from '@/auth/token';
import { server, url, given } from '../support/backend/server';







// -----------------------------------------------------------
// chunkReload
// -----------------------------------------------------------

describe('isChunkLoadError', () => {

  it('recognises the browsers\' failed-chunk wordings, however wrapped', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://x/assets/Users-abc.js',
      'error loading dynamically imported module',
      'Importing a module script failed.',
      'Unable to preload CSS for /assets/index-1.css',
      'Loading chunk 42 failed.',
    ]) {
      expect(isChunkLoadError(new TypeError(message)), message).toBe(true);
      expect(isChunkLoadError(message), message).toBe(true);
    }
    expect(isChunkLoadError({ message: 'wrapped', cause: new Error('Failed to fetch dynamically imported module') })).toBe(true);
  });


  it('does not mistake other failures for a stale chunk', () => {
    for (const error of [new Error('Cannot read properties of undefined'), new TypeError('Failed to fetch'), null, undefined, {}]) {
      expect(isChunkLoadError(error)).toBe(false);
    }
  });
});


describe('reloadOnce', () => {

  it('reloads and remembers when it did', () => {
    expect(reloadOnce()).toBe(true);
    expect(window.location.reloads).toBe(1);
    expect(Number(sessionStorage.getItem('complianceChunkReloadAt'))).toBeGreaterThan(0);
  });


  it('does not reload a second time within 30 s — the error page shows instead of a loop', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z'));
    expect(reloadOnce()).toBe(true);
    vi.setSystemTime(new Date('2026-09-27T10:00:29Z'));
    expect(reloadOnce()).toBe(false);
    expect(window.location.reloads).toBe(1);
    vi.setSystemTime(new Date('2026-09-27T10:00:31Z'));
    expect(reloadOnce()).toBe(true);
    expect(window.location.reloads).toBe(2);
  });


  it('reloads anyway when storage is blocked (private mode)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    expect(reloadOnce()).toBe(true);
    expect(window.location.reloads).toBe(1);
  });
});







// -----------------------------------------------------------
// diff
// -----------------------------------------------------------

describe('diffLines', () => {

  const kinds = (rows) => rows.map((r) => `${r.type[0]}:${r.text}`);


  it('marks identical texts as all-same with matching line numbers', () => {
    const rows = diffLines('a\nb', 'a\nb');
    expect(rows).toEqual([
      { type: 'same', text: 'a', oldNo: 1, newNo: 1 },
      { type: 'same', text: 'b', oldNo: 2, newNo: 2 },
    ]);
  });


  it('finds a changed line in the middle, deletion before addition, with both numberings', () => {
    const rows = diffLines('intro\nold rule\noutro', 'intro\nnew rule\noutro');
    expect(kinds(rows)).toEqual(['s:intro', 'd:old rule', 'a:new rule', 's:outro']);
    expect(rows[1]).toEqual({ type: 'del', text: 'old rule', oldNo: 2, newNo: null });
    expect(rows[2]).toEqual({ type: 'add', text: 'new rule', oldNo: null, newNo: 2 });
    expect(rows[3]).toEqual({ type: 'same', text: 'outro', oldNo: 3, newNo: 3 });
  });


  it('numbers the tail correctly after an insertion', () => {
    const rows = diffLines('a\nc', 'a\nb\nc');
    expect(kinds(rows)).toEqual(['s:a', 'a:b', 's:c']);
    expect(rows[2]).toEqual({ type: 'same', text: 'c', oldNo: 2, newNo: 3 });
  });


  it('keeps the longest common subsequence in a reordered middle', () => {
    const rows = diffLines('x\n1\n2\n3\ny', 'x\n2\n3\n1\ny');
    expect(kinds(rows).filter((k) => k.startsWith('s:'))).toEqual(['s:x', 's:2', 's:3', 's:y']);
    expect(diffStats(rows)).toEqual({ added: 1, removed: 1 });
  });


  it('treats CRLF and LF alike and null / undefined as the empty text', () => {
    expect(kinds(diffLines('a\r\nb', 'a\nb'))).toEqual(['s:a', 's:b']);
    expect(kinds(diffLines(null, 'a'))).toEqual(['d:', 'a:a']);
    expect(kinds(diffLines(undefined, undefined))).toEqual(['s:']);
  });


  it('degrades a middle too big for the table to "all out, all in" — still correct', () => {
    const old = Array.from({ length: 2100 }, (_, i) => `old ${i}`).join('\n');
    const now = Array.from({ length: 2100 }, (_, i) => `new ${i}`).join('\n');
    const rows = diffLines(old, now);
    expect(diffStats(rows)).toEqual({ added: 2100, removed: 2100 });
    expect(rows[0]).toEqual({ type: 'del', text: 'old 0', oldNo: 1, newNo: null });
    expect(rows[2100]).toEqual({ type: 'add', text: 'new 0', oldNo: null, newNo: 1 });
  });


  it('counts added and removed lines', () => {
    expect(diffStats(diffLines('a\nb\nc', 'a\nc\nd\ne'))).toEqual({ added: 2, removed: 1 });
    expect(diffStats([])).toEqual({ added: 0, removed: 0 });
  });
});







// -----------------------------------------------------------
// download
// -----------------------------------------------------------

describe('filenameFrom', () => {

  it('prefers the RFC 6266 filename* over filename, and decodes it', () => {
    expect(filenameFrom('attachment; filename="plain.pdf"; filename*=UTF-8\'\'%C4%85%C5%BEuolas.pdf')).toBe('ąžuolas.pdf');
    expect(filenameFrom('attachment; filename="legalops-UAB-2026-09-27.pdf"')).toBe('legalops-UAB-2026-09-27.pdf');
    expect(filenameFrom('attachment; filename=report.xlsx')).toBe('report.xlsx');
  });


  it('falls back to filename when filename* is not decodable, and answers null without a name', () => {
    expect(filenameFrom('attachment; filename*=UTF-8\'\'%E0%A4%A; filename="safe.pdf"')).toBe('safe.pdf');
    expect(filenameFrom('attachment')).toBeNull();
    expect(filenameFrom(null)).toBeNull();
    expect(filenameFrom('')).toBeNull();
  });
});


describe('downloadFile', () => {

  it('fetches with the bearer, saves under the server\'s name through a temporary link, then revokes the URL', async () => {
    setToken('tok');
    let auth = null;
    server.use(http.get(url('/api/reports/:id/export'), ({ request }) => {
      auth = request.headers.get('authorization');
      return new HttpResponse(new Uint8Array([37, 80, 68, 70]), {
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="report-UAB.pdf"' },
      });
    }));
    const clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clicked.push({ href: this.href, download: this.download, attached: document.body.contains(this) });
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    // Spied, not faked: the request itself must keep its real
    // timers; the revoke is found by its 1 s delay and run
    const timers = vi.spyOn(globalThis, 'setTimeout');

    const name = await downloadFile('/api/reports/r1/export?format=pdf', 'report.pdf');

    expect(name).toBe('report-UAB.pdf');
    expect(auth).toBe('Bearer tok');
    expect(clicked).toEqual([{ href: 'blob:test', download: 'report-UAB.pdf', attached: true }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    const [later] = timers.mock.calls.find(([, ms]) => ms === 1000);
    later();
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });


  it('uses the caller\'s name when the server sends none', async () => {
    server.use(http.get(url('/api/reports/:id/export'), () => new HttpResponse('xlsx-bytes', { headers: { 'Content-Type': 'application/octet-stream' } })));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await downloadFile('/api/reports/r1/export?format=xlsx', 'report.xlsx')).toBe('report.xlsx');
  });


  it('rejects with the backend\'s code readable — the JSON error came as a Blob', async () => {
    given.apiError('get', '/api/reports/:id/export', 'NOT_FINISHED', { status: 409 });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const error = await downloadFile('/api/reports/r1/export?format=pdf', 'report.pdf').catch((e) => e);
    expect(error.response.data).toEqual({ error: 'NOT_FINISHED (test)', code: 'NOT_FINISHED' });
    expect(errorMessage(error, { locale: 'en' })).toBe('Only finished reports can be exported.');
    expect(click).not.toHaveBeenCalled();
  });


  it('rejects with the status sentence for a proxy page', async () => {
    given.html('get', '/api/reports/:id/export', 504, '<html>Gateway Timeout</html>');
    const error = await downloadFile('/api/reports/r1/export?format=pdf', 'report.pdf').catch((e) => e);
    expect(errorMessage(error, { locale: 'en' })).toBe('The server did not answer in time. Try again.');
  });
});
