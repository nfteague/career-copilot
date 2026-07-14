// Local .docx text extraction — no model call, nothing leaves the browser.
// mammoth's browser build is dynamically imported so it lands in its own lazy
// chunk instead of the deliberately slim side-panel shell.

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function isDocxFile(file: File): boolean {
  return file.type === DOCX_MIME || file.name.toLowerCase().endsWith('.docx');
}

// Legacy binary Word files — mammoth can't read them.
export function isLegacyDocFile(file: File): boolean {
  return file.type === 'application/msword' || file.name.toLowerCase().endsWith('.doc');
}

export async function docxToText(file: File): Promise<string> {
  try {
    // Inside the try: if the lazy chunk fails to load (e.g. a stale panel
    // after an extension update), the error should read as a file problem
    // with a retry path, not as a network problem.
    const mammoth = await import('mammoth/mammoth.browser');
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value.trim();
  } catch {
    throw new Error("Couldn't read that file — is it a valid .docx?");
  }
}
