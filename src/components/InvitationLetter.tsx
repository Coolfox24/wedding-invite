import { motion, useAnimation } from "framer-motion";

type AnimationControls = ReturnType<typeof useAnimation>;

interface InvitationLetterProps {
  controls: AnimationControls;
  pulled: boolean;
  cleared: boolean;
  raised: boolean;
}

export default function InvitationLetter({ controls, pulled, cleared, raised }: InvitationLetterProps) {
  return (
    <div className={`inner-wrapper${pulled ? " pulled" : ""}${cleared ? " cleared" : ""}${raised ? " raised" : ""}`}>
      <motion.div
        className={`inner-card${pulled ? " pulled" : ""}`}
        animate={controls}
        initial={{ y: 0, rotate: 0, opacity: 0, scale: 0.94 }}
      >
        <div className="card-content">
          <div className="card-symbol">✦</div>
          <p className="card-kicker">A WEDDING INVITATION</p>
          <h2 className="card-names">M <span>&amp;</span> S</h2>
          <div className="card-divider"><span>✧</span></div>
          <p className="card-message">A new chapter<br />begins</p>
          <motion.p
            className="open-label"
            animate={{ opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            OPEN INVITATION
          </motion.p>
        </div>
      </motion.div>
    </div>
  );
}
