import { useState } from "react";
import { motion, useAnimation } from "framer-motion";
import Envelope, { type SealParticle } from "./Envelope";
import InvitationLetter from "./InvitationLetter";

interface InvitationCardProps {
  opened: boolean;
  onOpening: () => void;
  onOpen: () => void;
}

export default function InvitationCard({ opened, onOpening, onOpen }: InvitationCardProps) {
  const [animating, setAnimating] = useState(false);
  const flapControls = useAnimation();
  const envelopeControls = useAnimation();
  const innerControls = useAnimation();
  const particleControls = useAnimation();
  const lightControls = useAnimation();
  const [pulled, setPulled] = useState(false);
  const [letterCleared, setLetterCleared] = useState(false);
  const [letterRaised, setLetterRaised] = useState(false);
  const [pocketOpen, setPocketOpen] = useState(false);
  const [frontHidden, setFrontHidden] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [flapMovedBack, setFlapMovedBack] = useState(false);
  const [bursting, setBursting] = useState(false);

  const particles: SealParticle[] = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    delay: Math.random() * 0.15,
  }));

  async function handleOpen() {
    if (opened || animating) return;
    setAnimating(true);
    onOpening();

    // Turn the addressed front over to reveal the wax-sealed back.
    await envelopeControls.start({
      rotateY: 90,
      rotateX: [0, 8, 3, 0],
      rotateZ: [0, 3, -1, 0],
      scale: [1, 0.94, 0.96, 1],
      transition: { duration: 0.35, times: [0, 0.35, 0.72, 1], ease: "linear" },
    });
    setFrontHidden(true);
    await envelopeControls.start({
      rotateY: 180,
      transition: { duration: 0.35, ease: "linear" },
    });
    // Swap the turned envelope to a face-on back view. The matching 180° child
    // rotations are removed at the same time, so this is visually continuous.
    setFlipped(true);
    await Promise.all([
      envelopeControls.start({ rotateY: 0, transition: { duration: 0 } }),
      flapControls.start({ rotateY: 0, transition: { duration: 0 } }),
    ]);
    // Give guests a clear look at the M & S wax seal before it opens.
    await new Promise((r) => setTimeout(r, 520));

    // Lift the sealed flap, then let warm light fill the envelope.
    flapControls.start({ rotateX: -28, transition: { duration: 0.26, ease: "easeOut" } });
    await new Promise((r) => setTimeout(r, 140));

    // 2) open the flap fully while light blooms beneath it.
    const flapOpening = flapControls.start({
      rotateX: -120,
      z: 20,
      transition: { duration: 0.78, ease: [0.22, 1, 0.36, 1] },
    });
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

    // Let the light fill the opening, then show the letter sitting in the envelope.
    await new Promise((r) => setTimeout(r, 220));

    setFlapMovedBack(true);
    setPocketOpen(true);
    await innerControls.start({
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: 0.35, ease: "easeOut" },
    });
    // Hold the letter in the envelope briefly so guests see it before it is pulled out.
    await new Promise((r) => setTimeout(r, 420));
    setPulled(true);
    // Rise inside the envelope's clipping box first.
    await innerControls.start({
      y: -130,
      scale: 1.02,
      transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
    });
    // Let the letter clear the envelope edge while it remains behind the open flap.
    setLetterCleared(true);
    await innerControls.start({
      y: -320,
      scale: 1.02,
      transition: { duration: 0.85, ease: [0.22, 1, 0.36, 1] },
    });
    // Once clear of the flap, bring it forward and let it settle above the envelope.
    setLetterRaised(true);
    await innerControls.start({
      y: -178,
      rotate: -2,
      scale: 1.02,
      transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
    });

    // small settle then reveal app content
    await new Promise((r) => setTimeout(r, 1100));
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
        <Envelope
          envelopeControls={envelopeControls}
          flapControls={flapControls}
          lightControls={lightControls}
          particleControls={particleControls}
          particles={particles}
          bursting={bursting}
          flapMovedBack={flapMovedBack}
          frontHidden={frontHidden}
          flipped={flipped}
        />
        <InvitationLetter controls={innerControls} pulled={pulled} cleared={letterCleared} raised={letterRaised} />
        <div className={`pocket-overlay${pocketOpen ? " open" : ""}`} aria-hidden="true" />
      </motion.button>
    </motion.div>
  );
}
