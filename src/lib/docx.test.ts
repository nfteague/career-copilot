import { describe, expect, it } from 'vitest';
import { DOCX_MIME, isDocxFile, isLegacyDocFile } from './docx';

const file = (name: string, type = '') => new File([], name, { type });

describe('docx file detection', () => {
  it('detects .docx by extension, case-insensitively', () => {
    expect(isDocxFile(file('resume.docx'))).toBe(true);
    expect(isDocxFile(file('RESUME.DOCX'))).toBe(true);
  });

  it('detects .docx by mime type regardless of name', () => {
    expect(isDocxFile(file('resume', DOCX_MIME))).toBe(true);
  });

  it('does not match PDFs, text files, or legacy .doc', () => {
    expect(isDocxFile(file('resume.pdf', 'application/pdf'))).toBe(false);
    expect(isDocxFile(file('notes.txt', 'text/plain'))).toBe(false);
    expect(isDocxFile(file('resume.doc', 'application/msword'))).toBe(false);
  });

  it('flags legacy .doc by extension or mime', () => {
    expect(isLegacyDocFile(file('resume.doc'))).toBe(true);
    expect(isLegacyDocFile(file('resume', 'application/msword'))).toBe(true);
    expect(isLegacyDocFile(file('resume.docx'))).toBe(false);
  });
});
