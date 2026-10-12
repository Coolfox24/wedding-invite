import { motion, useAnimation } from "framer-motion";

type AnimationControls = ReturnType<typeof useAnimation>;

export interface SealParticle {
  id: number;
  delay: number;
}

interface EnvelopeProps {
  envelopeControls: AnimationControls;
  flapControls: AnimationControls;
  lightControls: AnimationControls;
  particleControls: AnimationControls;
  particles: SealParticle[];
  bursting: boolean;
  flapMovedBack: boolean;
  frontHidden: boolean;
  flipped: boolean;
}

export default function Envelope({
  envelopeControls,
  flapControls,
  lightControls,
  particleControls,
  particles,
  bursting,
  flapMovedBack,
  frontHidden,
  flipped,
}: EnvelopeProps) {
  return (
    <>
      <motion.div
        className={`envelope${bursting ? " is-bursting" : ""}${frontHidden ? " front-hidden" : ""}${flipped ? " flipped" : ""}`}
        animate={envelopeControls}
        initial={{ rotateY: 0 }}
        // The back-view state is flattened after the physical flip so the letter,
        // pocket, and flap can use a predictable front-to-back layer order.
        style={{ transformStyle: flipped ? "flat" : "preserve-3d" }}
      >
      <div className="envelope-edges" aria-hidden="true">
        <span className="envelope-edge edge-top" />
        <span className="envelope-edge edge-right" />
        <span className="envelope-edge edge-bottom" />
        <span className="envelope-edge edge-left" />
      </div>

      <div className="face front">
        <div className="front-address">
          <div className="addr-name">Dear Guest</div>
        </div>
        <span className="envelope-corner envelope-corner-tl" aria-hidden="true">❧</span>
        <span className="envelope-corner envelope-corner-tr" aria-hidden="true">❧</span>
        <span className="envelope-corner envelope-corner-bl" aria-hidden="true">❧</span>
        <span className="envelope-corner envelope-corner-br" aria-hidden="true">❧</span>
      </div>

      <div className="face back" />
      <div className="back-pocket-layer" aria-hidden="true" />

      <motion.div
        className={`flap${flapMovedBack ? " behind" : ""}`}
        animate={flapControls}
        initial={{ rotateX: 0, rotateY: 180, z: -10 }}
        style={{ transformOrigin: "top center", transformStyle: "preserve-3d" }}
      >
        <div className="flap-surface flap-outer" />
        <div className="flap-surface flap-inner" aria-hidden="true" />
        <div className="seal-marker">
          <div className="seal" role="img" aria-label="wax seal monogram M and S">
            <span className="seal-initials">M <i>&amp;</i> S</span>
          </div>
        </div>
      </motion.div>

      <div className="particle-burst" aria-hidden="true">
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            className="burst-particle"
            custom={particle.id}
            initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            animate={particleControls}
          />
        ))}
      </div>
      </motion.div>
      <motion.div className="envelope-light" animate={lightControls} initial={{ opacity: 0, scale: 0.72 }} aria-hidden="true" />
    </>
  );
}
