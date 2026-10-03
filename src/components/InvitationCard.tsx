import { useState } from "react";
import { motion, useAnimation } from "framer-motion";

interface InvitationCardProps {
  opened: boolean;
  onOpen: () => void;
}

interface SealParticle {
  id: number;
  delay: number;
}

export default function InvitationCard({ opened, onOpen }: InvitationCardProps) {
  const [animating, setAnimating] = useState(false);
  const flapControls = useAnimation();
  const envelopeControls = useAnimation();
  const innerControls = useAnimation();
  const particleControls = useAnimation();
  const lightControls = useAnimation();
  const [pulled, setPulled] = useState(false);
  const [flapMovedBack, setFlapMovedBack] = useState(false);
  const [bursting, setBursting] = useState(false);

  const particles: SealParticle[] = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    delay: Math.random() * 0.15,
  }));

  async function handleOpen() {
    if (opened || animating) return;
    setAnimating(true);

    // Turn the addressed front over to reveal the wax-sealed back.
    await envelopeControls.start({
      rotateY: 180,
      rotateX: [0, 8, 3, 0],
      rotateZ: [0, 3, -1, 0],
      scale: [1, 0.94, 0.96, 1],
      transition: { duration: 1.25, times: [0, 0.35, 0.72, 1], ease: [0.22, 1, 0.36, 1] },
    });
    // Give guests a clear look at the M & S wax seal before it opens.
    await new Promise((r) => setTimeout(r, 520));

    // Lift the sealed flap, then let warm light fill the envelope.
    flapControls.start({ rotateX: -28, transition: { duration: 0.26, ease: "easeOut" } });
    await new Promise((r) => setTimeout(r, 140));

    // 2) open the flap fully while light blooms beneath it.
    const flapOpening = flapControls.start({ rotateX: -120, transition: { duration: 0.78, ease: [0.22, 1, 0.36, 1] } });
    lightControls.start({
      opacity: [0, 1, 0.82],
      scale: [0.72, 1.18, 1.35],
      transition: { duration: 1.25, ease: "easeOut" },
    });

    setBursting(true);
    particleControls.start((i: number) => {
      const angle = (i / particles.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const distance = 110 + Math.random() * 130;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - 30 - Math.random() * 30;
      const rot = (Math.random() - 0.5) * 220;
      const dur = 0.7 + Math.random() * 0.45;
      return {
        opacity: [1, 1, 0],
        x: [0, dx],
        y: [0, dy],
        rotate: [0, rot],
        scale: [1, 0.6],
        transition: { duration: dur, ease: "easeOut", delay: particles[i].delay },
      };
    });
    await flapOpening;

    // Let the open envelope glow for a beat before the letter rises.
    await new Promise((r) => setTimeout(r, 180));

    // move the flap to the background so the letter can appear above it
    setFlapMovedBack(true);

    // 3) two-step pull for the inner letter: set z-index so it can appear above the front, small tug then a larger pull with spring feel
    setPulled(true);
    // allow style z-index to apply before animating (next tick)
    await new Promise((r) => setTimeout(r, 20));
    // small initial tug
    await innerControls.start({ opacity: 1, y: -28, scale: 1.01, transition: { duration: 0.16, ease: "easeOut" } });
    // larger spring pull — increased negative y so the letter rises higher out of the envelope
    await innerControls.start({ opacity: 1, y: -185, rotate: -2, scale: 1.02, transition: { type: "spring", stiffness: 110, damping: 14 } });

    // small settle then reveal app content
    await new Promise((r) => setTimeout(r, 450));
    onOpen();
  }

  return (
    <motion.div
      className="card-wrapper"
      initial={{ opacity: 0, y: 60, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 1.1, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -8, rotateZ: -0.5 }}
    >
      <motion.button
        className="invitation-card"
        type="button"
        onClick={handleOpen}
        disabled={opened || animating}
        aria-label="Open wedding invitation"
        whileTap={{ scale: 0.98 }}
      >
        <motion.div className={`envelope${bursting ? " is-bursting" : ""}`} animate={envelopeControls} initial={{ rotateY: 0 }} style={{ transformStyle: "preserve-3d" }} >
          <div className="envelope-edges" aria-hidden="true">
            <span className="envelope-edge edge-top" />
            <span className="envelope-edge edge-right" />
            <span className="envelope-edge edge-bottom" />
            <span className="envelope-edge edge-left" />
          </div>
          {/* Front face: addressed side */}
          <div className="face front">
            <div className="front-address">
              <div className="addr-name">Dear Guest</div>
            </div>
            <span className="envelope-corner envelope-corner-tl" aria-hidden="true">❧</span>
            <span className="envelope-corner envelope-corner-tr" aria-hidden="true">❧</span>
            <span className="envelope-corner envelope-corner-bl" aria-hidden="true">❧</span>
            <span className="envelope-corner envelope-corner-br" aria-hidden="true">❧</span>
          </div>

          {/* Back face: sealed flap */}
          <div className="face back" />

          <div className={`seal-marker${flapMovedBack ? " broken" : ""}`} aria-hidden={flapMovedBack}>
            <div className="seal" role="img" aria-label="wax seal monogram M and S">
              <span className="seal-initials">M <i>&amp;</i> S</span>
            </div>
          </div>

          <motion.div className="envelope-light" animate={lightControls} initial={{ opacity: 0, scale: 0.72, z: -7 }} />

          {/* The flap sits between the envelope shell and the letter so it can swing behind it. */}
          <motion.div
            className={`flap${flapMovedBack ? " behind" : ""}`}
            animate={flapControls as any}
            initial={{ rotateX: 0, rotateY: 180, z: -10 }}
            style={{ transformOrigin: "top center", transformStyle: "preserve-3d" }}
          >
            <div className="flap-surface flap-outer" />
            <div className="flap-surface flap-inner" aria-hidden="true" />
          </motion.div>

          <div className="particle-burst">
            {particles.map((p) => (
              <motion.div
                key={p.id}
                className="burst-particle"
                custom={p.id}
                initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                animate={particleControls}
              />
            ))}
          </div>

          {/* inner-wrapper masks the inner card so it looks like it's being pulled out */}
          <div className={"inner-wrapper" + (pulled ? " pulled" : "")}>
            <motion.div className={"inner-card" + (pulled ? " pulled" : "")} animate={innerControls as any} initial={{ y: 0, rotate: 0, rotateY: 180, opacity: 0, scale: 1 }}>
              <div className="card-content">
                <div className="card-symbol">✦</div>
                <p className="card-kicker">A WEDDING INVITATION</p>

                <h2 className="card-names">S <span>&amp;</span> M</h2>

                <div className="card-divider"><span>✧</span></div>

                <p className="card-message">A new chapter<br/>begins</p>

                <motion.p className="open-label" animate={{ opacity: [0.55, 1, 0.55] }} transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}>
                  OPEN INVITATION
                </motion.p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.button>
    </motion.div>
  );
}
