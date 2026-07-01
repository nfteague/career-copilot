import { JobContext } from '../lib/types';
import { detectJobContext } from '../content/detect';

// Inject the detector into the active tab on demand and read its return value.
// This works on tabs that were already open before the extension loaded (a
// declared content script would not) and re-runs cleanly after SPA navigation.
export async function getActiveJobContext(): Promise<JobContext | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  // Can't inject into browser-internal pages.
  if (tab.url && /^(chrome|edge|brave|about|chrome-extension|moz-extension):/i.test(tab.url)) {
    return null;
  }
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: detectJobContext,
    });
    return (res?.result as JobContext) ?? null;
  } catch {
    return null;
  }
}

// Read a File as base64 (no data: prefix), for PDF upload to the model.
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
