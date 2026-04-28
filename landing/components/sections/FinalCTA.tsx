'use client';

import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { waLink } from '@/lib/config';

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden bg-navy-900 py-24 text-white sm:py-32">
      <div aria-hidden className="absolute inset-0 bg-hero-radial" />
      <div aria-hidden className="absolute inset-0 grid-noise opacity-10" />
      <div
        aria-hidden
        className="absolute -top-40 left-1/2 h-[500px] w-[80%] -translate-x-1/2 rounded-full bg-wa-green/20 blur-3xl"
      />

      <div className="container-page relative">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-wa-green/30 bg-wa-green/10 px-3 py-1 text-[12.5px] font-semibold uppercase tracking-wider text-wa-green"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-wa-green" />
            Bot is online — reply in 10 seconds
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mt-6 font-display text-display-xl text-balance"
          >
            One message. <span className="text-wa-green">Three minutes.</span> A live website.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mx-auto mt-5 max-w-2xl text-lg text-white/70"
          >
            No credit card. No signup. No meeting. Just open WhatsApp and say hi — we&apos;ll take it from there.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-10 flex flex-col items-center gap-5"
          >
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
              <WhatsAppButton
                size="xl"
                label="Start on WhatsApp"
                prefill="Hi! I want to build a website for my business — saw your landing page."
              />
              <a
                href="/examples"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-white/15 px-6 text-base font-semibold text-white/85 transition hover:border-wa-green/40 hover:bg-white/5 hover:text-white"
              >
                Or browse examples first
              </a>
            </div>
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-white/60">
              {['Free to start', 'No signup', 'Works on any phone'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-wa-green" />
                  {t}
                </li>
              ))}
            </ul>
          </motion.div>

          {/* QR for desktop */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-14 hidden max-w-md items-center gap-5 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur md:flex"
          >
            <div className="shrink-0 rounded-xl bg-white p-2">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=0&data=${encodeURIComponent(
                  waLink('Hi from your landing page QR!')
                )}`}
                alt="Scan to chat on WhatsApp"
                width={120}
                height={120}
              />
            </div>
            <div className="text-left">
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                <WhatsAppIcon className="h-4 w-4 text-wa-green" />
                On desktop?
              </p>
              <p className="mt-1 text-sm text-white/65">
                Scan this QR with your phone to open the chat directly on your WhatsApp.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
