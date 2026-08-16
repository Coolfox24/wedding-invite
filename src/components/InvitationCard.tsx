import { motion, useAnimation } from "framer-motion";
import { useState } from "react";

interface InvitationCardProps {
  opened: boolean;
  onOpen: () => void;
}

const FRAG_COUNT = 10;

function InvitationCard({ opened, onOpen }: InvitationCardProps) {
  const flapControls = useAnimation();
  const fragControls = useAnimation();
  const innerControls = useAnimation();
  const [animating, setAnimating] = useState(false);

  async function handleOpen() {
    if (opened || animating) return;
    setAnimating(true);

    // 1) explode seal fragments quickly
    fragControls.start((i) => ({
      opacity: [1, 1, 0],
      x: [0, (Math.random() - 0.5) * 160],
      y: [0, (Math.random() - 0.4) * -140],
      rotate: [(Math.random() - 0.5) * 80],
      scale: [1, 0.9, 0.6],
      transition: { duration: 0.6 + Math.random() * 0.25 },
    }));
n    // small delay as fragments fly
    await new Promise((r) => setTimeout(r, 420));
n    // 2) open the flap (rotate up)
    await flapControls.start({ rotateX: -140, transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] } });
n    // 3) lift the inner card a bit to reveal
    await innerControls.start({ y: -84, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } });
n    // done — notify parent to show the full invitation content
    onOpen();
  }

  return (
    <motion.div
      className="card-wrapper"
      initial={{ opacity: 0, y: 60, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
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
        <div className="envelope">
          <motion.div className="flap" animate={flapControls as any} initial={{ rotateX: 0 }} />

          <motion.div className="card-seal" aria-hidden>
            <div className="seal" role="img" aria-label="wax seal">
              <span style={{ color: "#e6c99d", fontSize: "1.25rem" }}>✦</span>

              {/* fragments positioned around the seal */}
              {Array.from({ length: FRAG_COUNT }).map((_, i) => (
                <motion.span
                  custom={i}
                  key={i}
                  className="seal-frag"
                  initial={{ opacity: 0 }}
                  animate={fragControls}
                />
              ))}
            </div>
          </motion.div>
n          <motion.div className="inner-card" animate={innerControls as any} initial={{ y: 0 }}>
            <div className="card-content">
              <div className="card-symbol">✦</div>
              <p className="card-kicker">A WEDDING INVITATION</p>
n              <h2 className="card-names">M <span>&amp;</span> P</h2>
n              <div className="card-divider"><span>✧</span></div>
n              <p className="card-message">
                A new chapter
                <br />
                begins
              </p>
n              <motion.p
                className="open-label"
                animate={{ opacity: [0.55, 1, 0.55] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              >
                OPEN INVITATION
              </motion.p>
            </div>
          </motion.div>
        </div>
      </motion.button>
    </motion.div>
  );
}

export default InvitationCard;
