import { useState } from "react";
import { motion, useAnimation } from "framer-motion";

interface InvitationCardProps {
  opened: boolean;
  onOpen: () => void;
}

function getRecipientFromUrl(): string {
  if (typeof window === "undefined") return "Dear Guest";
  const params = new URLSearchParams(window.location.search);
  const val = params.get("to") || params.get("name") || params.get("recipient");
  if (!val) return "Dear Guest";
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

interface SealParticle {
  id: number;
  delay: number;
}

export default function InvitationCard({ opened, onOpen }: InvitationCardProps) {
  const [animating, setAnimating] = useState(false);
  const flapControls = useAnimation();
  const innerControls = useAnimation();
  const particleControls = useAnimation();
  const [pulled, setPulled] = useState(false);

  const recipient = getRecipientFromUrl();
  const particles: SealParticle[] = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    delay: Math.random() * 0.15,
  }));

  async function handleOpen() {
    if (opened || animating) return;
    setAnimating(true);

    // 1) initial gentle lift (create tension)
    flapControls.start({ rotateX: -28, transition: { duration: 0.26, ease: "easeOut" } });
    await new Promise((r) => setTimeout(r, 140));

    // 2) stronger lift while emitting particles (seal remains intact)
    flapControls.start({ rotateX: -120, transition: { duration: 0.78, ease: [0.22, 1, 0.36, 1] } });

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

    // let flap lift a bit before pulling card
    await new Promise((r) => setTimeout(r, 360));

    // 3) two-step pull for the inner letter: set z-index so it can appear above the front, small tug then a larger pull with spring feel
    setPulled(true);
    // allow style z-index to apply before animating (next tick)
    await new Promise((r) => setTimeout(r, 20));
    await innerControls.start({ y: -18, transition: { duration: 0.16, ease: "easeOut" } });
    await innerControls.start({ y: -160, rotate: -3, transition: { type: "spring", stiffness: 120, damping: 16 } });

    // small settle then reveal app content
    await new Promise((r) => setTimeout(r, 160));
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
        disabled={opened}
        aria-label="Open wedding invitation"
        whileTap={{ scale: 0.98 }}
      >
        <div className="envelope" style={{ transformStyle: "preserve-3d" }} >
          {/* Front face: addressed side */}
          <div className="face front" aria-hidden={false}>
            <div className="front-address">
              <div className="addr-label">To</div>
              <div className="addr-name">{recipient}</div>
            </div>
          </div>

          {/* Back face: sealed flap */}
          <div className="face back" aria-hidden={true}>
            {/* Flap that lifts up */}
            <motion.div
              className="flap"
              animate={flapControls as any}
              initial={{ rotateX: 0 }}
              style={{ transformOrigin: "top center", transformStyle: "preserve-3d" }}
            >
              {/* Seal (stays in place, centered on flap) */}
              <div className="seal-container">
                <div className="seal" role="img" aria-label="wax seal">
                  <span style={{ color: "#e6c99d", fontSize: "1.25rem" }}>✦</span>
                </div>
              </div>
            </motion.div>

            {/* Burst particles (render behind flap during animation) */}
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
          </div>

          {/* inner-wrapper masks the inner card so it looks like it's being pulled out */}
          <div className="inner-wrapper">
            <motion.div className={"inner-card" + (pulled ? " pulled" : "")} animate={innerControls as any} initial={{ y: 0, rotate: 0 }}>
              <div className="card-content">
                <div className="card-symbol">✦</div>
                <p className="card-kicker">A WEDDING INVITATION</p>

                <h2 className="card-names">M <span>&amp;</span> P</h2>

                <div className="card-divider"><span>✧</span></div>

                <p className="card-message">A new chapter<br/>begins</p>

                <motion.p className="open-label" animate={{ opacity: [0.55, 1, 0.55] }} transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}>
                  OPEN INVITATION
                </motion.p>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.button>
    </motion.div>
  );
}