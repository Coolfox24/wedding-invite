import { motion } from "framer-motion";

interface InvitationCardProps {
  opened: boolean;
  onOpen: () => void;
}

function InvitationCard({ opened, onOpen }: InvitationCardProps) {
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
        onClick={onOpen}
        disabled={opened}
        aria-label="Open wedding invitation"
        whileTap={{ scale: 0.98 }}
      >
        <div className="card-border outer" />
        <div className="card-border inner" />

        <div className="corner corner-tl">❧</div>
        <div className="corner corner-tr">❧</div>
        <div className="corner corner-bl">❧</div>
        <div className="corner corner-br">❧</div>

        <div className="card-content">
          <motion.div
            className="card-symbol"
            animate={{ opacity: [0.65, 1, 0.65], scale: [1, 1.03, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            ✦
          </motion.div>

          <p className="card-kicker">A WEDDING INVITATION</p>

          <h2 className="card-names">
            M <span>&amp;</span> P
          </h2>

          <div className="card-divider"><span>✧</span></div>

          <p className="card-message">
            A new chapter
            <br />
            begins
          </p>

          <div className="card-seal">
            <motion.div
              className="seal"
              whileHover={{ scale: 1.08, rotate: -4 }}
              animate={{
                boxShadow: [
                  "0 0 0 rgba(200,168,91,0)",
                  "0 0 22px rgba(200,168,91,0.25)",
                  "0 0 0 rgba(200,168,91,0)"
                ]
              }}
              transition={{ boxShadow: { duration: 3, repeat: Infinity } }}
            >
              <span>✦</span>
            </motion.div>
          </div>

          <motion.p
            className="open-label"
            animate={{ opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            OPEN INVITATION
          </motion.p>
        </div>

        <motion.div
          className="card-shine"
          initial={{ x: "-120%" }}
          animate={{ x: "120%" }}
          transition={{
            duration: 2,
            delay: 1.8,
            repeat: Infinity,
            repeatDelay: 7
          }}
        />
      </motion.button>
    </motion.div>
  );
}

export default InvitationCard;
