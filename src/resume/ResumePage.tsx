import { useEffect, useState } from 'react';
import { TailoredResume } from '../lib/types';

// Renders the tailored resume handed off by the side panel via
// chrome.storage.session, as a print-first page: real text (ATS-parseable),
// letter-sized, everything editable in place before printing.
export default function ResumePage() {
  const [resume, setResume] = useState<TailoredResume | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    chrome.storage.session.get('pendingResume').then((stored) => {
      const r = stored.pendingResume as TailoredResume | undefined;
      if (r) setResume(r);
      else setMissing(true);
    });
  }, []);

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
  if (!resume) return null;

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
          {noName && ' No name set — click the heading to type it, or add it in Profile → Review.'}
        </p>
        <button onClick={() => window.print()}>Print / Save as PDF</button>
      </div>

      <article className="page" contentEditable suppressContentEditableWarning>
        <header>
          <h1>{noName ? 'Your Name' : resume.header.name}</h1>
          {resume.header.headline.trim() && <p className="headline">{resume.header.headline}</p>}
          {contact.length > 0 && <p className="contact">{contact.join(' · ')}</p>}
        </header>

        {resume.summary.trim() && <p className="summary">{resume.summary}</p>}

        {resume.experience.length > 0 && (
          <section>
            <h2>Experience</h2>
            {resume.experience.map((e, i) => (
              <div className="entry" key={i}>
                <div className="entry-head">
                  <strong>{e.title}</strong>
                  <span className="entry-sub">{e.company}</span>
                  {e.dates.trim() && <span className="dates">{e.dates}</span>}
                </div>
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
          <section>
            <h2>Projects</h2>
            {resume.projects.map((p, i) => (
              <div className="entry" key={i}>
                <div className="entry-head">
                  <strong>{p.name}</strong>
                  {p.description.trim() && <span className="entry-sub">{p.description}</span>}
                </div>
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
          <section>
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
          <section>
            <h2>Certifications</h2>
            <p className="inline-list">{resume.certifications.join(' · ')}</p>
          </section>
        )}

        {resume.skills.length > 0 && (
          <section>
            <h2>Skills</h2>
            <p className="inline-list">{resume.skills.join(', ')}</p>
          </section>
        )}
      </article>
    </>
  );
}
