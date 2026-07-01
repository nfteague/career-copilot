import type { JobContext } from '../lib/types';

// IMPORTANT: this function is injected into the page via
// chrome.scripting.executeScript({ func: detectJobContext }). Chrome serializes
// the function body and runs it in the page context, so it must be fully
// self-contained — every helper is nested inside, and it may reference only its
// own declarations plus page globals (document, location, CSS). Do not pull
// anything from module scope here.
export function detectJobContext(): JobContext {
  const KNOWN_ATS: Record<string, string> = {
    'greenhouse.io': 'greenhouse',
    'lever.co': 'lever',
    'myworkdayjobs.com': 'workday',
    'ashbyhq.com': 'ashby',
    'icims.com': 'icims',
    'linkedin.com': 'linkedin',
    'indeed.com': 'indeed',
  };

  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  const text = (el: Element | null) => clean(el?.textContent ?? '');
  const meta = (prop: string) =>
    clean(document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ?? '');

  const firstMatch = (selectors: string[]): string => {
    for (const sel of selectors) {
      const t = text(document.querySelector(sel));
      if (t) return t;
    }
    return '';
  };

  const detectSource = (): string => {
    const host = location.hostname;
    for (const [domain, name] of Object.entries(KNOWN_ATS)) {
      if (host.includes(domain)) return name;
    }
    return host;
  };

  const htmlToText = (html: string): string => {
    const div = document.createElement('div');
    div.innerHTML = html; // detached node — scripts don't run
    return clean(div.textContent ?? '');
  };

  // schema.org JobPosting JSON-LD — the reliable path for Lever, Ashby,
  // Greenhouse, and most modern ATS.
  const fromJsonLd = (): { company?: string; role?: string; jobDescription?: string } => {
    const scripts = document.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"]',
    );
    for (const script of scripts) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(script.textContent ?? '');
      } catch {
        continue;
      }
      const candidates: any[] = Array.isArray(parsed)
        ? parsed
        : (parsed as any)?.['@graph'] ?? [parsed];
      for (const node of candidates) {
        const type = node?.['@type'];
        const isJob = Array.isArray(type) ? type.includes('JobPosting') : type === 'JobPosting';
        if (!isJob) continue;
        const org = node.hiringOrganization;
        const company = typeof org === 'string' ? org : org?.name;
        return {
          company: typeof company === 'string' ? clean(company) : undefined,
          role: typeof node.title === 'string' ? clean(node.title) : undefined,
          jobDescription: node.description ? htmlToText(node.description).slice(0, 8000) : undefined,
        };
      }
    }
    return {};
  };

  const detectRole = (): string =>
    firstMatch([
      '[data-testid="jobTitle"]',
      '.posting-headline h2',
      '.app-title',
      'h1.posting-title',
      'h1',
    ]) || clean((document.title || '').split(/[|\-–·@]/)[0]);

  const detectCompany = (): string =>
    text(document.querySelector('.company-name, [data-testid="company"], .topcard__org-name-link')) ||
    meta('og:site_name');

  const detectDescription = (): string => {
    const candidates = [
      '#content .section-wrapper',
      '.job-description',
      '[data-testid="jobDescription"]',
      '.posting-page .section-wrapper',
      '.description',
      'article',
      'main',
    ];
    for (const sel of candidates) {
      const t = text(document.querySelector(sel));
      if (t.length > 200) return t.slice(0, 8000);
    }
    return '';
  };

  // Lever (jobs.lever.co/<company>) and Ashby (jobs.ashbyhq.com/<company>) put
  // the company in the first path segment — a fallback when nothing else yields
  // a clean name.
  const companyFromSlug = (source: string): string => {
    if (source !== 'lever' && source !== 'ashby') return '';
    const slug = location.pathname.split('/').filter(Boolean)[0];
    if (!slug) return '';
    return slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const labelFor = (field: HTMLElement): string => {
    const id = field.getAttribute('id');
    if (id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (lbl) return text(lbl);
    }
    const aria = field.getAttribute('aria-label');
    if (aria) return aria.trim();
    const wrap = field.closest('label');
    if (wrap) return text(wrap);
    let el: HTMLElement | null = field.parentElement;
    for (let i = 0; i < 3 && el; i++) {
      const lbl = el.querySelector('label, .label, legend');
      if (lbl) return text(lbl);
      el = el.parentElement;
    }
    return '';
  };

  const detectQuestions = (): string[] => {
    const out: string[] = [];
    for (const field of document.querySelectorAll<HTMLTextAreaElement>('textarea')) {
      const label = labelFor(field);
      if (label && label.length > 8 && /\?|describe|why|tell us|explain|how|what/i.test(label)) {
        out.push(label);
      }
    }
    return [...new Set(out)].slice(0, 20);
  };

  try {
    const source = detectSource();
    const ld = fromJsonLd();
    return {
      url: location.href,
      source,
      company: ld.company || detectCompany() || companyFromSlug(source) || undefined,
      role: ld.role || meta('og:title') || detectRole() || undefined,
      jobDescription: ld.jobDescription || detectDescription() || meta('og:description') || undefined,
      questions: detectQuestions(),
    };
  } catch {
    // Never reject the injection — return a minimal context so the caller can
    // distinguish "nothing found" from "couldn't access the tab".
    return { url: location.href, source: location.hostname, questions: [] };
  }
}
