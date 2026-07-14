import { useEffect, useRef, useState } from 'react';
import { ResumeSectionKey, ResumeStyle, TailoredResume } from '../lib/types';
import { getResumeTemplateChoice, saveResumeTemplateChoice } from '../lib/storage';
import {
  DEFAULT_TEMPLATE,
  TEMPLATES,
  TEMPLATE_LABELS,
  TemplateId,
  safeStyle,
} from './templates';

// What the side panel hands off via chrome.storage.session.
interface ResumeHandoff {
  resume: TailoredResume;
  // Design tokens extracted from the user's own uploaded resume, if any.
  matchStyle: ResumeStyle | null;
  // Feed the document title → Chrome's default Save-as-PDF filename.
  company?: string;
  role?: string;
}

// "{name}_{company}_{role}.pdf" — tells the user which file to pick in an
// application, and reads professionally if a recruiter ever sees it.
function documentTitle(h: ResumeHandoff): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  const parts = [h.resume.header.name, h.company ?? '', h.role ?? ''].map(clean).filter(Boolean);
  return parts.length ? parts.join('_') : 'Tailored resume';
}

// Printable inches per letter page after the @page margins (11in − 2×0.6in).
const PRINTABLE_IN_PER_PAGE = 9.8;
const PX_PER_IN = 96;

// Renders the tailored resume as a print-first page: real text
// (ATS-parseable), letter-sized, everything editable in place.
//
// Templates apply ONLY as CSS classes and flex-order values on the page —
// attribute-level updates React can make without touching children — so
// switching templates never destroys the user's in-place edits.
export default function ResumePage() {
  const [handoff, setHandoff] = useState<ResumeHandoff | null>(null);
  const [missing, setMissing] = useState(false);
  const [template, setTemplate] = useState<TemplateId>(DEFAULT_TEMPLATE);
  // Estimated printed page count, measured from the rendered content.
  const [pageCount, setPageCount] = useState(1);
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    (async () => {
      const stored = await chrome.storage.session.get('pendingResume');
      const raw = stored.pendingResume as ResumeHandoff | TailoredResume | undefined;
      if (!raw) {
        setMissing(true);
        return;
      }
      const h: ResumeHandoff =
        'resume' in raw ? (raw as ResumeHandoff) : { resume: raw as TailoredResume, matchStyle: null };
      setHandoff(h);
      document.title = documentTitle(h);
      const choice = (await getResumeTemplateChoice()) as TemplateId | '';
      if (choice && (choice !== 'match' || h.matchStyle)) setTemplate(choice);
      else if (h.matchStyle) setTemplate('match');
    })();
  }, []);

  // Screen padding doesn't print, so subtract it before converting the
  // rendered height into printed pages.
  function measurePages() {
    const el = pageRef.current;
    if (!el) return;
    const styles = getComputedStyle(el);
    const padding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const contentIn = (el.scrollHeight - padding) / PX_PER_IN;
    setPageCount(Math.max(1, Math.ceil(contentIn / PRINTABLE_IN_PER_PAGE)));
  }

  useEffect(() => {
    measurePages();
  }, [handoff, template]);

  function chooseTemplate(id: TemplateId) {
    setTemplate(id);
    void saveResumeTemplateChoice(id);
  }

  if (missing) {
    return (
      <div className="empty">
        <h1>No resume waiting</h1>
        <p>
          Generate one from the Career Copilot side panel: open a job posting, click “Get Job,”
          then choose “Tailored resume.”
        </p>
      </div>
    );
  }
  if (!handoff) return null;

  const { resume, matchStyle } = handoff;
  const style =
    template === 'match' && matchStyle
      ? safeStyle(matchStyle)
      : TEMPLATES[template as Exclude<TemplateId, 'match'>] ?? TEMPLATES.modern;
  // Sections keep a fixed JSX order; templates reorder them visually via
  // flex order (see note above).
  const orderOf = (key: ResumeSectionKey) => {
    const i = style.sectionOrder.indexOf(key);
    return i === -1 ? 99 : i + 1;
  };
  const pageClass = [
    'page',
    `font-${style.font}`,
    `align-${style.headerAlign}`,
    `density-${style.density}`,
    `case-${style.sectionCase}`,
    `divider-${style.divider}`,
  ].join(' ');

  const contact = [
    resume.header.location,
    resume.header.email,
    resume.header.phone,
    ...resume.header.links,
  ].filter((x) => x.trim());
  const noName = !resume.header.name.trim();

  return (
    <>
      <div className="toolbar">
        <p>
          Click into the resume to edit anything, then save it as a PDF.
          {pageCount === 1
            ? ' Fits on one page.'
            : ` About ${pageCount} pages when printed — trim bullets or try the Compact template.`}
          {noName && ' No name set — click the heading to type it, or add it in Profile → Review.'}
        </p>
        <div className="controls">
          <select
            value={template}
            onChange={(e) => chooseTemplate(e.target.value as TemplateId)}
            aria-label="Resume template"
          >
            {matchStyle && <option value="match">My resume’s look</option>}
            {(Object.keys(TEMPLATES) as Exclude<TemplateId, 'match'>[]).map((id) => (
              <option key={id} value={id}>
                {TEMPLATE_LABELS[id]}
              </option>
            ))}
          </select>
          <button onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>

      <article
        ref={pageRef}
        className={pageClass}
        style={style.accent ? ({ '--accent': style.accent } as React.CSSProperties) : undefined}
        contentEditable
        suppressContentEditableWarning
        onInput={measurePages}
      >
        <header style={{ order: 0 }}>
          <h1>{noName ? 'Your Name' : resume.header.name}</h1>
          {resume.header.headline.trim() && <p className="headline">{resume.header.headline}</p>}
          {contact.length > 0 && <p className="contact">{contact.join(' · ')}</p>}
        </header>

        {resume.summary.trim() && (
          <p className="summary" style={{ order: orderOf('summary') }}>
            {resume.summary}
          </p>
        )}

        {resume.experience.length > 0 && (
          <section style={{ order: orderOf('experience') }}>
            <h2>Experience</h2>
            {resume.experience.map((e, i) => (
              <div className="entry" key={i}>
                <div className="entry-head">
                  <strong>{e.title}</strong>
                  <span className="entry-sub">{e.company}</span>
                  {e.dates.trim() && <span className="dates">{e.dates}</span>}
                </div>
                {e.description?.trim() && <p className="entry-desc">{e.description}</p>}
                {e.bullets.length > 0 && (
                  <ul>
                    {e.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}

        {resume.projects.length > 0 && (
          <section style={{ order: orderOf('projects') }}>
            <h2>Projects</h2>
            {resume.projects.map((p, i) => (
              <div className="entry" key={i}>
                <div className="entry-head">
                  <strong>{p.name}</strong>
                </div>
                {p.description?.trim() && <p className="entry-desc">{p.description}</p>}
                {p.bullets.length > 0 && (
                  <ul>
                    {p.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}

        {resume.education.length > 0 && (
          <section style={{ order: orderOf('education') }}>
            <h2>Education</h2>
            {resume.education.map((ed, i) => (
              <div className="entry" key={i}>
                <div className="entry-head">
                  <strong>{ed.institution}</strong>
                  {ed.degree.trim() && <span className="entry-sub">{ed.degree}</span>}
                  {ed.dates.trim() && <span className="dates">{ed.dates}</span>}
                </div>
              </div>
            ))}
          </section>
        )}

        {resume.certifications.length > 0 && (
          <section style={{ order: orderOf('certifications') }}>
            <h2>Certifications</h2>
            <p className="inline-list">{resume.certifications.join(' · ')}</p>
          </section>
        )}

        {resume.skills.length > 0 && (
          <section style={{ order: orderOf('skills') }}>
            <h2>Skills</h2>
            <p className="inline-list">{resume.skills.join(', ')}</p>
          </section>
        )}
      </article>
    </>
  );
}
