import "./WeddingTimeline.css";

const moments = [
  { time: "3:30 pm", label: "Guest arrival", icon: "arrival" },
  { time: "4:00 pm", label: "Ceremony", icon: "rings" },
  { time: "4:45 pm", label: "Drinks & canapés", icon: "glasses" },
  { time: "6:00 pm", label: "Dinner", icon: "dinner" },
  { time: "7:30 pm", label: "Dancing", icon: "dancing" },
  { time: "9:30 pm", label: "Farewell", icon: "farewell" },
] as const;

function MomentIcon({ kind }: { kind: typeof moments[number]["icon"] }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "arrival" && <>
        <path d="M28 78V39a20 20 0 0 1 40 0v39M34 78V39a14 14 0 0 1 28 0v39M48 25v53M26 78h44M23 83h50" />
        <path d="M14 77c-2-17 0-33 9-45M13 67c-8-2-10-8-9-13 7 1 10 6 9 13ZM16 54c-6-5-6-11-3-15 5 4 6 9 3 15ZM20 44c0-7 3-11 8-12 1 6-2 10-8 12M82 77c2-17 0-33-9-45M83 67c8-2 10-8 9-13-7 1-10 6-9 13ZM80 54c6-5 6-11 3-15-5 4-6 9-3 15ZM76 44c0-7-3-11-8-12-1 6 2 10 8 12" />
        <circle cx="43" cy="53" r="1" /><circle cx="53" cy="53" r="1" />
        <path d="m44 10 4-5 4 5M48 5v10" />
      </>}
      {kind === "rings" && <>
        <circle cx="35" cy="58" r="22" /><circle cx="35" cy="58" r="17" />
        <path d="M54 38a22 22 0 1 1-6 36M56 44a17 17 0 1 1-4 27" />
        <path d="m49 32 9-10 15 5 2 13-17 10-9-18ZM49 32l26 8M58 22l-1 13 1 15M73 27 57 35M30 25l2-7M19 32l-6-4M42 22l5-5M80 55l7-1" />
      </>}
      {kind === "glasses" && <>
        <path d="m25 17 20 6-7 22a10 10 0 0 1-19-6l6-22ZM22 30l19 6M28 46l-8 26M10 72l17 5M51 24l20-7 8 22a10 10 0 0 1-19 7l-9-22ZM56 37l19-7M70 47l9 25M71 77l17-6" />
        <path d="m45 10 3 6 3-6M48 4v3M37 8l3 4M58 8l-3 4M41 82h15" />
        <circle cx="29" cy="38" r="1" /><circle cx="66" cy="38" r="1" />
      </>}
      {kind === "dinner" && <>
        <circle cx="48" cy="49" r="25" /><circle cx="48" cy="49" r="19" />
        <path d="M11 20v20c0 6 8 6 8 0V20M15 20v62M11 33h8M83 82V20c-7 7-7 20 0 25M36 48c5-8 12-8 16-1 5-7 12-4 12 2 0 7-9 12-12 15-5-4-16-9-16-16Z" />
        <path d="M37 11c3-4 3-7 0-10M48 11c3-4 3-7 0-10M59 11c3-4 3-7 0-10M37 83h22" />
      </>}
      {kind === "dancing" && <>
        <path d="M48 7v10" /><circle cx="48" cy="37" r="20" />
        <ellipse cx="48" cy="37" rx="10" ry="20" />
        <path d="M30 28h36M28 37h40M30 46h36M48 17v40M32 72V58l13-3v14M32 62l13-3M64 80V65l13-3v14" />
        <ellipse cx="28" cy="72" rx="4" ry="3" /><ellipse cx="41" cy="69" rx="4" ry="3" /><ellipse cx="60" cy="80" rx="4" ry="3" /><ellipse cx="73" cy="76" rx="4" ry="3" />
        <path d="m12 34 3-5 3 5-3 5-3-5ZM77 23l3-5 3 5-3 5-3-5ZM49 76l3-5 3 5-3 5-3-5M17 51l-4 3M76 47l6 3" />
      </>}
      {kind === "farewell" && <>
        <path d="m21 79 21-36M75 79 54 43M42 43l-2-14M42 43l-13-3M42 43l-11 12M42 43l10-9M54 43l4-15M54 43l14-3M54 43l12 12M54 43l-5-11" />
        <path d="M48 24c-5-4-13-9-13-15 0-7 9-8 13-2 4-6 13-5 13 2 0 6-8 11-13 15ZM20 24l-4-5M75 25l5-5M18 43h-7M77 43h8M31 12l-3-6M67 13l3-6M27 66l-6-2M71 65l6-2M39 82h18" />
        <circle cx="24" cy="34" r="1" /><circle cx="72" cy="34" r="1" /><circle cx="48" cy="59" r="1" />
      </>}
    </svg>
  );
}

export default function WeddingTimeline() {
  return (
    <section className="wedding-timeline-section section-shell" id="timeline" aria-labelledby="timeline-heading" data-scroll-reveal>
      <div className="wedding-timeline-card">
        <div className="section-heading">
          <p className="eyebrow">A day to remember</p>
          <h2 id="timeline-heading">Wedding Timeline</h2>
          <span className="heading-flourish">❦</span>
        </div>
        <ol className="wedding-moments" data-scroll-stagger>
          {moments.map(({ time, label, icon }) => (
            <li className="wedding-moment" key={icon}>
              <MomentIcon kind={icon} />
              <span className="wedding-moment-time">{time}</span>
              <span className="wedding-moment-label">{label}</span>
            </li>
          ))}
        </ol>
        <p className="wedding-timeline-note">2 February 2027 <span>·</span> Chapel Hill Retreat</p>
      </div>
    </section>
  );
}
