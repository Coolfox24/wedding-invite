import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import InvitationCard from "./components/InvitationCard";
import FloatingParticles from "./components/FloatingParticles";
import MusicToggle from "./components/MusicToggle";
import WeddingTimeline from "./components/WeddingTimeline";

const weddingDate = new Date(2027, 1, 2, 0, 0, 0);

function useCountdown() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = Math.max(0, weddingDate.getTime() - now);
  return {
    days: Math.floor(remaining / 86_400_000),
    hours: Math.floor((remaining / 3_600_000) % 24),
    minutes: Math.floor((remaining / 60_000) % 60),
    seconds: Math.floor((remaining / 1000) % 60),
  };
}

function BotanicalMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 180 260" fill="none" aria-hidden="true">
      <path d="M92 253C95 194 81 141 48 86M92 253C93 192 109 132 143 69M92 253C91 186 91 119 91 34" stroke="currentColor" strokeWidth="1.5" />
      <path d="M69 136C39 135 24 117 20 91C45 92 66 103 69 136ZM82 183C54 178 40 158 40 135C65 141 82 155 82 183ZM112 159C138 147 151 126 149 103C125 113 111 132 112 159ZM99 210C127 201 142 181 144 157C118 164 102 180 99 210Z" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="1.25" />
      <path d="M91 83C69 65 69 42 91 13C113 42 113 65 91 83Z" fill="currentColor" fillOpacity=".16" stroke="currentColor" strokeWidth="1.4" />
      <path d="M91 82V44M91 254V10" stroke="currentColor" strokeOpacity=".45" />
    </svg>
  );
}

function App() {
  const [opened, setOpened] = useState(false);
  const [opening, setOpening] = useState(false);
  const countdown = useCountdown();

  useEffect(() => {
    if (!opened) return;

    let frame = 0;
    let observer: IntersectionObserver | undefined;

    // AnimatePresence waits for the envelope screen to exit before mounting
    // the invite, so wait until its sections exist before observing them.
    const observeSections = () => {
      const site = document.querySelector(".wedding-site");
      if (!site) {
        frame = window.requestAnimationFrame(observeSections);
        return;
      }

      // The 3D envelope can briefly extend beyond the viewport; align the
      // revealed page instantly so the opening doesn't sweep across the sides.
      document.documentElement.scrollLeft = 0;
      document.documentElement.scrollTop = 0;
      document.body.scrollLeft = 0;
      document.body.scrollTop = 0;

      const sections = site.querySelectorAll<HTMLElement>("[data-scroll-reveal]");
      if (!("IntersectionObserver" in window)) {
        sections.forEach((section) => section.classList.add("is-visible"));
      } else {
        observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer?.unobserve(entry.target);
            }
          });
        }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });

        sections.forEach((section) => {
          const bounds = section.getBoundingClientRect();
          if (bounds.top < window.innerHeight && bounds.bottom > 0) {
            section.classList.add("is-visible");
          } else {
            observer?.observe(section);
          }
        });
      }
    };

    frame = window.requestAnimationFrame(observeSections);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [opened]);

  return (
    <main className={`invitation-page ${opened ? "is-open" : ""}`}>
      <FloatingParticles />
      <div className="ambient-glow" />
      <MusicToggle />

      <AnimatePresence mode="wait">
        {!opened ? (
          <motion.div
            key="closed"
            className="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.04, transition: { duration: 0.65 } }}
          >
            <motion.div
              className="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: opening ? 0 : 1, y: opening ? -12 : 0 }}
              transition={{ delay: 0.6, duration: 1 }}
            >
              <div className="intro-symbol">✦</div>
              <h1>A Special Invitation</h1>
            </motion.div>
            <InvitationCard opened={false} onOpening={() => setOpening(true)} onOpen={() => setOpened(true)} />
          </motion.div>
        ) : (
          <motion.div
            key="opened"
            className="wedding-site"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1 }}
          >
            <header className="site-header">
              <a className="wordmark" href="#top" aria-label="Matt and Sarah, home">M <span>&amp;</span> S</a>
              <nav aria-label="Main navigation">
                <a href="#invitation">Invitation</a>
                <a href="#story">Our Story</a>
                <a href="#details">The Day</a>
                <a href="#rsvp">RSVP</a>
              </nav>
              <span className="header-date">02 · 02 · 2027</span>
            </header>

            <section className="site-hero" id="top" data-scroll-reveal>
              <BotanicalMark className="hero-botanical hero-botanical-left" />
              <BotanicalMark className="hero-botanical hero-botanical-right" />
              <p className="eyebrow">Together with their families</p>
              <p className="hero-invite">joyfully invite you to celebrate their wedding day</p>
              <h1>Matt <span>&amp;</span> Sarah</h1>
              <div className="hero-rule"><i>✦</i></div>
              <p className="hero-date">Tuesday <span>·</span> 2 February 2027</p>
              <p className="hero-note">A beautiful beginning to our forever.</p>
              <a className="scroll-cue" href="#invitation">Scroll to explore <span>↓</span></a>
            </section>

            <section className="invitation-section section-shell" id="invitation" data-scroll-reveal>
              <div className="section-heading">
                <p className="eyebrow">The beginning of forever</p>
                <h2>Our Invitation</h2>
                <span className="heading-flourish">❦</span>
              </div>
              <div className="invitation-copy-card">
                <BotanicalMark className="copy-botanical" />
                <p>With grateful hearts,</p>
                <p>we invite you to join us as we exchange vows<br className="desktop-break" /> and begin our journey as husband and wife.</p>
                <p className="copy-signoff">Matt <span>&amp;</span> Sarah</p>
                <p className="copy-date">Tuesday, 2 February 2027</p>
              </div>
            </section>

            <section className="countdown-section" data-scroll-reveal>
              <div className="countdown-intro">
                <p className="eyebrow">The days are drawing near</p>
                <h2>Until We Say <em>“I Do”</em></h2>
              </div>
              <div className="countdown" data-scroll-stagger aria-label={`${countdown.days} days until the wedding`}>
                {([
                  [countdown.days, "Days"],
                  [countdown.hours, "Hours"],
                  [countdown.minutes, "Minutes"],
                  [countdown.seconds, "Seconds"],
                ] as const).map(([value, label]) => (
                  <div className="countdown-unit" key={label}>
                    <strong>{String(value).padStart(2, "0")}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <p className="countdown-date">02 <span>•</span> 02 <span>•</span> 2027</p>
            </section>

            <section className="faith-section section-shell" id="faith" data-scroll-reveal>
              <div className="faith-mark">✧</div>
              <p className="eyebrow">The heart of our home</p>
              <h2>A Cord of Three Strands</h2>
              <blockquote>“Though one may be overpowered, two can defend themselves.<br className="desktop-break" /> A cord of three strands is not quickly broken.”</blockquote>
              <p className="verse-reference">Ecclesiastes 4:12</p>
              <div className="faith-lines" data-scroll-stagger>
                <span>God at the centre of our marriage</span>
                <span>Love at the heart of our home</span>
                <span>Faith to guide our journey</span>
              </div>
            </section>

            <section className="story-section section-shell" id="story" data-scroll-reveal>
              <div className="story-art">
                <div className="story-art-frame"><BotanicalMark className="story-botanical" /><span>M <i>&amp;</i> S</span></div>
                <p className="art-caption">A woodland beginning</p>
              </div>
              <div className="story-copy">
                <p className="eyebrow">Two journeys, one story</p>
                <h2>Our Story</h2>
                <p>What began as two individual journeys became a story we never expected.</p>
                <p>Through God’s grace, love, laughter and countless little moments, our paths became one.</p>
                <p>Now, we’re beginning our greatest adventure yet — a lifetime together.</p>
                <span className="story-flourish">❦</span>
              </div>
            </section>

            <section className="gallery-section section-shell" data-scroll-reveal>
              <div className="section-heading">
                <p className="eyebrow">A little piece of our story</p>
                <h2>A Few Moments Along the Way</h2>
                <span className="heading-flourish">❦</span>
              </div>
              <div className="gallery-grid" data-scroll-stagger>
                {["Our early days", "Favourite date", "Family", "The proposal", "Road trips & adventures", "Engagement portraits"].map((caption, index) => (
                  <figure className={`gallery-frame gallery-frame-${index + 1}`} key={caption}>
                    <div className="gallery-placeholder"><BotanicalMark /><span>S <i>&amp;</i> M</span></div>
                    <figcaption>{caption}</figcaption>
                  </figure>
                ))}
              </div>
            </section>

            <section className="details-section section-shell" id="details" data-scroll-reveal>
              <div className="section-heading">
                <p className="eyebrow">Join us for the day</p>
                <h2>The Celebration</h2>
                <span className="heading-flourish">❦</span>
              </div>
              <div className="event-cards" data-scroll-stagger>
                <article className="event-card">
                  <span className="event-number">01</span>
                  <p className="eyebrow">The vows</p>
                  <h3>The Ceremony</h3>
                  <p className="event-date">Tuesday, 2 February 2027</p>
                  <div className="event-rule" />
                  <p className="event-label">GUEST ARRIVAL</p><p>3:30 pm</p>
                  <p className="event-label">CEREMONY BEGINS</p><p>4:00 pm</p>
                  <p className="event-label">VENUE</p><p>Chapel Hill Retreat</p>
                  <p className="event-address">Berambing, NSW</p>
                  <a className="text-link" href="https://www.google.com/maps/place/Chapel+Hill+Retreat+-+Wedding+and+Event+Venue/@-33.5277798,150.4432864,17z/data=!3m1!4b1!4m6!3m5!1s0x6b0d877efb40751d:0xee5590130306f843!8m2!3d-33.5277798!4d150.4458667!16s%2Fg%2F1ptx7vkk_?entry=ttu" target="_blank" rel="noreferrer">View map &amp; directions <span>↗</span></a>
                </article>
                <article className="event-card event-card-sage">
                  <span className="event-number">02</span>
                  <p className="eyebrow">The celebration</p>
                  <h3>Reception</h3>
                  <p className="event-date">Following the ceremony</p>
                  <div className="event-rule" />
                  <p className="event-label">TIME</p><p>4:45 pm</p>
                  <p className="event-description">Join us for pre-dinner drinks and canapés from 4:45 pm, followed by an evening of good food, laughter and love.</p>
                  <p className="event-label">VENUE</p><p>Chapel Hill Retreat</p>
                  <p className="event-address">Berambing, NSW — same venue as the ceremony</p>
                  <a className="text-link" href="https://www.google.com/maps/place/Chapel+Hill+Retreat+-+Wedding+and+Event+Venue/@-33.5277798,150.4432864,17z/data=!3m1!4b1!4m6!3m5!1s0x6b0d877efb40751d:0xee5590130306f843!8m2!3d-33.5277798!4d150.4458667!16s%2Fg%2F1ptx7vkk_?entry=ttu" target="_blank" rel="noreferrer">View map &amp; directions <span>↗</span></a>
                </article>
              </div>
            </section>

            <WeddingTimeline />

            <section className="style-section section-shell" data-scroll-reveal data-scroll-stagger>
              <article className="dress-code">
                <p className="eyebrow">A little guidance</p>
                <h2>Dress Code</h2>
                <p className="dress-title">Formal / Elegant Attire</p>
                <div className="dress-columns">
                  <div><h3>Ladies</h3><p>Elegant dresses in soft, neutral and earthy tones.</p></div>
                  <div><h3>Gentlemen</h3><p>Formal suits or smart formal attire.</p></div>
                </div>
                <p className="olive-note"><span>✦</span> Please reserve olive green for our bridesmaids.</p>
              </article>
              <article className="palette-card">
                <p className="eyebrow">Inspired by the garden</p>
                <h2>Our Wedding Palette</h2>
                <div className="swatches" aria-label="Ivory, warm beige, sage, olive green, and taupe">
                  <span style={{ backgroundColor: "#f5f1e6" }} />
                  <span style={{ backgroundColor: "#d9cdb8" }} />
                  <span style={{ backgroundColor: "#89b27a" }} />
                  <span style={{ backgroundColor: "#556b2f" }} />
                  <span style={{ backgroundColor: "#b7a99a" }} />
                </div>
                <p>Ivory <i>·</i> Warm Beige <i>·</i> Sage <i>·</i> Olive <i>·</i> Taupe</p>
              </article>
            </section>

            <section className="rsvp-section section-shell" id="rsvp" data-scroll-reveal>
              <div className="rsvp-card">
                <BotanicalMark className="rsvp-botanical" />
                <p className="eyebrow">We hope you can join us</p>
                <h2>Will You Join Us?</h2>
                <p>We would be honoured to celebrate this special day with you.</p>
                <div className="rsvp-questions" data-scroll-stagger>
                  <div><span>01</span><p>Will you be joining us?</p><small>Joyfully accepts &nbsp; / &nbsp; Regretfully declines</small></div>
                  <div><span>02</span><p>Who will be attending?</p><small>[Guest name]</small></div>
                  <div><span>03</span><p>Any dietary requirements or allergies?</p><small>None &nbsp; / &nbsp; Vegetarian &nbsp; / &nbsp; Other: _______</small></div>
                  <div><span>04</span><p>Any special requests or notes for us?</p><small>[Your message]</small></div>
                </div>
                <p className="rsvp-deadline">Kindly reply by <strong>Friday, 11 December 2026</strong></p>
              </div>
              <div className="plus-one-note"><span>With love,</span><p>Kindly note that invitations are intended for the guests named on the invitation. Please refer to the name(s) listed above for your invitation details.</p></div>
            </section>

            <section className="extras-section section-shell" data-scroll-reveal data-scroll-stagger>
              <article className="extra-card">
                <span className="extra-icon">♡</span>
                <p className="eyebrow">A little note from us</p>
                <h2>Your Presence Is Our Gift</h2>
                <p>Having you celebrate with us is already more than enough.</p>
                <p>Should you wish to bless us with a gift, we would be deeply grateful.</p>
                <p>For those who have kindly asked, a contribution towards our future together would be sincerely appreciated.</p>
                <a className="text-link" href="#gifts">Gift registry <span>↗</span></a>
                <div id="gifts" className="gift-link-placeholder">[LINK]</div>
              </article>
              <article className="extra-card stay-card">
                <span className="extra-icon">⌂</span>
                <p className="eyebrow">For our travelling guests</p>
                <h2>Where to Stay</h2>
                <div className="hotel-placeholder"><strong>[Hotel Name]</strong><span>[Address]</span><span>[Booking Link]</span></div>
                <div className="hotel-placeholder"><strong>[Hotel Name]</strong><span>[Address]</span><span>[Booking Link]</span></div>
              </article>
            </section>

            <section className="faq-section section-shell" data-scroll-reveal>
              <div className="section-heading">
                <p className="eyebrow">Here to help</p>
                <h2>Frequently Asked Questions</h2>
                <span className="heading-flourish">❦</span>
              </div>
              <div className="faq-list" data-scroll-stagger>
                <details><summary>What should I wear?</summary><p>Formal / elegant attire. Please reserve olive green for the bridesmaids.</p></details>
                <details><summary>Can I bring a plus-one?</summary><p>Please refer to the name(s) listed on your invitation.</p></details>
                <details>
                  <summary>Where can I find the venue?</summary>
                  <p>We’ll be celebrating at Chapel Hill Retreat in Berambing, NSW. Open the <a href="https://www.chapelhillretreat.com.au/" target="_blank" rel="noreferrer">venue website</a> or <a href="https://www.google.com/maps/place/Chapel+Hill+Retreat+-+Wedding+and+Event+Venue/@-33.5277798,150.4432864,17z/data=!3m1!4b1!4m6!3m5!1s0x6b0d877efb40751d:0xee5590130306f843!8m2!3d-33.5277798!4d150.4458667!16s%2Fg%2F1ptx7vkk_?entry=ttu" target="_blank" rel="noreferrer">get directions in Google Maps</a>.</p>
                  <div className="faq-map">
                    <iframe
                      title="Map showing Chapel Hill Retreat in Berambing, New South Wales"
                      src="https://maps.google.com/maps?q=-33.5277798%2C150.4458667&z=15&output=embed"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                    />
                  </div>
                </details>
                <details><summary>When should I RSVP?</summary><p>Please RSVP by Friday, 11 December 2026.</p></details>
                <details>
                  <summary>Who can I contact with questions?</summary>
                  <div className="faq-contacts">
                    <p><strong>Matt</strong><br /><a href="tel:+61492995379">04 9299 5379</a><br /><a href="mailto:mattjgoulden@gmail.com">mattjgoulden@gmail.com</a></p>
                    <p><strong>Sarah</strong><br /><a href="tel:+61411180585">0411 180 585</a><br /><a href="mailto:sebaitan.05@gmail.com">sebaitan.05@gmail.com</a></p>
                  </div>
                </details>
              </div>
            </section>

            <footer className="site-footer" data-scroll-reveal>
              <div className="footer-flower">❦</div>
              <p className="eyebrow">Thank You</p>
              <h2>Your presence, love and prayers<br />mean more to us than words can express.</h2>
              <p>Thank you for being part of the beginning<br />of our life together.</p>
              <span className="footer-with-love">With love,</span>
              <strong>Matt <i>&amp;</i> Sarah</strong>
              <span className="footer-date">02 <i>•</i> 02 <i>•</i> 2027</span>
              <blockquote>“Above all, love each other deeply.”</blockquote>
              <span className="verse-reference">1 Peter 4:8</span>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

export default App;
