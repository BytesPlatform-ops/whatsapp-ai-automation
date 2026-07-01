'use client';

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { PhoneField } from './PhoneField';

interface IntroCardProps {
  /** Fired when the visitor starts. Any field may be empty. */
  onStart: (name: string, business: string, contact: string) => void;
}

/**
 * First card of the deck — collects the visitor's name, business and contact
 * number so the following problem questions can be personalised and the
 * waitlist signup carries real contact info. Styled via joinPixie.css.
 */
export function IntroCard({ onStart }: IntroCardProps) {
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [contact, setContact] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onStart(name.trim(), business.trim(), contact.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="jp-intro">
      <div aria-hidden className="jp-intro__glow--fuchsia" />
      <div aria-hidden className="jp-intro__glow--cyan" />

      <div className="jp-intro__head">
        <span className="jp-eyebrow">
          <Sparkles className="jp-eyebrow__icon" strokeWidth={2.5} />
          Let&apos;s start
        </span>

        <h3 className="jp-intro__title">First — tell Pixie about you</h3>
        <p className="jp-intro__sub">We&apos;ll make the next questions about you.</p>
      </div>

      <div className="jp-intro__form">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (e.g. Ali)" aria-label="Your name" autoFocus className="jp-input" />
        <input type="text" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Business name" aria-label="Business name" className="jp-input" />
        <PhoneField onChange={setContact} />

        <motion.button type="submit" whileTap={{ scale: 0.98 }} className="jp-submit">
          {name.trim() ? `Let's go, ${name.trim().split(' ')[0]}` : 'Start swiping'}
          <ArrowRight className="jp-submit__icon" strokeWidth={2.5} />
        </motion.button>
      </div>
    </form>
  );
}
