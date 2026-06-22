'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  animate,
  type PanInfo,
} from 'framer-motion';
import { Check, X } from 'lucide-react';
import { PROBLEM_CARDS } from './joinPixieData';
import { StoryProblemCard } from './StoryProblemCard';
import { WaitlistCard } from './WaitlistCard';
import { IntroCard } from './IntroCard';
import './joinPixie.css';

type Dir = 1 | -1;
const SWIPE_DISTANCE = 100;
const SWIPE_VELOCITY = 450;
const FLY_OUT = 700;

/**
 * The swipe game: intro (collect name/business/contact) → six problem cards
 * (swipe right = yes, left = no) → terminal waitlist card. Styled via
 * joinPixie.css (jp-* classes).
 */
export function SwipeDeck() {
  const [started, setStarted] = useState(false);
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [contact, setContact] = useState('');
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(0);
  const [hint, setHint] = useState(false);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-12, 12]);
  const yesOpacity = useTransform(x, [30, 130], [0, 1]);
  const noOpacity = useTransform(x, [-30, -130], [0, 1]);

  const animatingRef = useRef(false);
  const hintLockRef = useRef(false);

  const total = PROBLEM_CARDS.length;
  const finished = index >= total;
  const swiping = started && !finished;
  const cleared = Math.min(index, total);
  const pct = finished ? 100 : (cleared / total) * 100;

  const flyOut = useCallback(
    (dir: Dir) => {
      if (animatingRef.current || !started || finished) return;
      animatingRef.current = true;
      if (dir === 1) setPicked((p) => p + 1);
      animate(x, dir * FLY_OUT, {
        duration: 0.32,
        ease: [0.4, 0, 1, 1],
        onComplete: () => {
          flushSync(() => setIndex((i) => i + 1));
          x.set(0);
          animatingRef.current = false;
        },
      });
    },
    [started, finished, x],
  );

  const showHint = useCallback(() => {
    if (hintLockRef.current) return;
    hintLockRef.current = true;
    setHint(true);
    setTimeout(() => {
      setHint(false);
      hintLockRef.current = false;
    }, 1600);
  }, []);

  useEffect(() => {
    if (!swiping) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') flyOut(1);
      else if (e.key === 'ArrowLeft') flyOut(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flyOut, swiping]);

  function handleDrag(_: unknown, info: PanInfo) {
    if (Math.abs(info.offset.y) > 44 && Math.abs(info.offset.y) > Math.abs(info.offset.x) + 16) {
      showHint();
    }
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) flyOut(1);
    else if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) flyOut(-1);
    else animate(x, 0, { type: 'spring', stiffness: 380, damping: 30 });
  }

  return (
    <div className="jp-deck">
      {/* Progress bar */}
      <div className="jp-progress">
        <motion.div
          className="jp-progress__bar"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      {/* Card stack */}
      <div className="jp-stage">
        {/* Wrong-movement toast */}
        <AnimatePresence>
          {hint && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              className="jp-hint"
            >
              ↔ Swipe left or right only
            </motion.div>
          )}
        </AnimatePresence>

        {/* Peek cards behind */}
        {swiping &&
          PROBLEM_CARDS.slice(index + 1, index + 3).map((card, i) => (
            <div
              key={card.id}
              aria-hidden
              className="jp-peek"
              style={{
                transform: i === 0 ? 'none' : `translateY(${i * 12}px) scale(${1 - i * 0.05})`,
                opacity: i === 0 ? 1 : 0.6,
                zIndex: -i,
              }}
            >
              <StoryProblemCard card={card} index={index + 1 + i} total={total} name={name} />
            </div>
          ))}

        {/* Intro card */}
        {!started && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="jp-layer"
          >
            <IntroCard
              onStart={(n, b, c) => {
                setName(n);
                setBusiness(b);
                setContact(c);
                setStarted(true);
              }}
            />
          </motion.div>
        )}

        {/* Waitlist (terminal) */}
        {finished && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="jp-layer"
          >
            <WaitlistCard picked={picked} name={name} business={business} contact={contact} />
          </motion.div>
        )}

        {/* Active, draggable card */}
        {swiping && (
          <motion.div
            className="jp-active"
            style={{ x, rotate }}
            drag="x"
            dragElastic={0.55}
            dragConstraints={{ left: 0, right: 0 }}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            whileTap={{ scale: 0.99 }}
          >
            <StoryProblemCard card={PROBLEM_CARDS[index]} index={index} total={total} name={name} />

            {/* YES / NO drag stamps */}
            <motion.div style={{ opacity: yesOpacity }} className="jp-stamp jp-stamp--yes">
              Yes
            </motion.div>
            <motion.div style={{ opacity: noOpacity }} className="jp-stamp jp-stamp--no">
              Nope
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* Desktop-only yes/no controls */}
      {swiping && (
        <div className="jp-controls">
          <button type="button" onClick={() => flyOut(-1)} className="jp-ctrl jp-ctrl--no">
            <span className="jp-ctrl__icon">
              <X className="h-5 w-5" strokeWidth={2.75} />
            </span>
            Not for me
          </button>
          <button type="button" onClick={() => flyOut(1)} className="jp-ctrl jp-ctrl--yes">
            <span className="jp-ctrl__icon">
              <Check className="h-5 w-5" strokeWidth={2.75} />
            </span>
            Yes, that&apos;s me
          </button>
        </div>
      )}
    </div>
  );
}
