import { describe, expect, it } from 'vitest';
import { sanitizeEmailSubject, escapeHtml } from '../lib/sanitize';
import { sanitizeSubject } from '../../supabase/functions/_shared/sanitize';
import { emailSchema, fileUploadSchema, sanitizeString } from '../services/inputValidationService';

describe('input safety baseline', () => {
  it('removes C0/C1 subject controls consistently in browser and edge code', () => {
    const controls = Array.from({ length: 160 }, (_, n) => n)
      .filter((n) => n < 32 || n >= 127).map((n) => String.fromCharCode(n)).join('');
    const subject = `  GDG${controls} at Georgia Tech 🎉  `;
    expect(sanitizeEmailSubject(subject)).toBe('GDG at Georgia Tech 🎉');
    expect(sanitizeSubject(subject)).toBe(sanitizeEmailSubject(subject));
    expect(sanitizeSubject('a'.repeat(201))).toHaveLength(200);
  });
  it('preserves multiline text while removing null and unsafe controls', () => {
    expect(sanitizeString(' \u0000Hello\tthere\nnext\rline\u000b\u000c\u001f\u007f 🎉 '))
      .toBe('Hello\tthere\nnext\rline 🎉');
  });
  it('normalizes email before validating it', () => {
    expect(emailSchema.parse('  Person@Example.Test  ')).toBe('person@example.test');
    expect(emailSchema.safeParse('person@example.test\r\nBcc: somebody').success).toBe(false);
  });
  it('retains the MIME grammar (destination policy still needs separate enforcement)', () => {
    for (const mimeType of ['image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/svg+xml']) {
      expect(fileUploadSchema.safeParse({ fileName: 'test', fileSize: 1, mimeType }).success).toBe(true);
    }
    expect(fileUploadSchema.safeParse({ fileName: 'test', fileSize: 1, mimeType: 'image/png;anything' }).success).toBe(false);
  });
  it('escapes text inserted into HTML', () => {
    expect(escapeHtml('<img src="x" onerror=alert(1)>')).toBe('&lt;img src=&quot;x&quot; onerror=alert(1)&gt;');
  });
});
