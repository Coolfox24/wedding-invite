import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import InvitationCard from "./components/InvitationCard";
import FloatingParticles from "./components/FloatingParticles";

function App() {
  const [opened, setOpened] = useState(false);

  return (
    <main className={`invitation-page ${opened ? "is-open" : ""}`}>
      <FloatingParticles />
      <div className="ambient-glow" />

      <AnimatePresence mode="wait">
        {!opened ? (
          <motion.div
            key="closed"
            className="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05, transition: { duration: 0.6 } }}
          >
            <motion.div
              className="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 1 }}
            >
              <div className="intro-symbol">✦</div>
              <p className="intro-kicker">A message awaits you</p>
              <h1>An Invitation</h1>
              <p className="intro-hint">Open the seal to discover what awaits</p>
            </motion.div>

            <InvitationCard opened={false} onOpen={() => setOpened(true)} />
          </motion.div>
        ) : (
          <motion.div
            key="opened"
            className="revealed-invitation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2 }}
          >
            <div className="revealed-ornament">❦</div>
            <p className="revealed-kicker">With joy in our hearts</p>

            <h2>
              Matt
              <span>&amp;</span>
              Sarah
            </h2>

            <div className="ornamental-divider"><span>✦</span></div>

            <p className="invitation-copy">
              request the pleasure of your company
              <br />
              as we begin our journey together
            </p>

            <div className="date">
              <span>Sunday</span>
              <strong>7th</strong>
              <span>February 2027</span>
            </div>

            <div className="venue">
              <span className="venue-label">THE CELEBRATION</span>
              <strong>[VENUE]</strong>
              <span>[LOCATION]</span>
            </div>

            <div className="ornamental-divider"><span>❦</span></div>
            <p className="continue">More details await...</p>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

export default App;
