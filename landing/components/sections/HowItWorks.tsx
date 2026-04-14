'use client';

import { motion } from 'framer-motion';
import { MessageSquareText, Sparkles, Rocket } from 'lucide-react';
import { Section, SectionHeading } from '@/components/Section';
import { PhoneMockup } from '@/components/PhoneMockup';
import { ChatBubble, LinkPreview, TypingBubble } from '@/components/ChatBubble';
import { WhatsAppButton } from '@/components/WhatsAppButton';

const steps = [
  {
    icon: MessageSquareText,
    title: 'Send a message',
    body: 'Tell the bot what you need in plain language — any language. No forms, no account, just chat.',
  },
  {
    icon: Sparkles,
    title: 'Answer 2–3 quick questions',
    body: 'The bot asks only what it needs: your business name, style, offer. That\'s it.',
  },
  {
    icon: Rocket,
    title: 'Get your result in minutes',
    body: 'Live website link, ad creative, or SEO audit — delivered right inside WhatsApp.',
  },
];

export function HowItWorks() {
  return (
    <Section id="how" soft>
      <SectionHeading
        eyebrow="How it works"
        title={
          <>
            From <span className="text-wa-teal">message</span> to <span className="text-wa-teal">live website</span> in 3 minutes.
          </>
        }
        subtitle="Not a SaaS dashboard. Not a 30-minute demo. Just one honest conversation on a channel you already use."
      />

      <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        {/* Steps list */}
        <ol className="relative space-y-10">
          <div
            aria-hidden
            className="absolute left-[22px] top-2 bottom-2 w-px bg-gradient-to-b from-wa-green/60 via-wa-green/30 to-transparent"
          />
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.li
                key={step.title}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="relative flex gap-5"
              >
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white shadow-card ring-1 ring-wa-green/20">
                  <Icon className="h-5 w-5 text-wa-teal" />
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-wa-green text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                </div>
                <div className="pt-1.5">
                  <h3 className="font-display text-xl font-bold text-ink-900">{step.title}</h3>
                  <p className="mt-1.5 text-ink-500 leading-relaxed">{step.body}</p>
                </div>
              </motion.li>
            );
          })}
          <div className="pt-2 pl-16">
            <WhatsAppButton
              size="lg"
              label="Try it — send 'hi' now"
              prefill="hi"
            />
          </div>
        </ol>

        {/* Phone mockup with a full sample conversation */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="flex justify-center lg:justify-end"
        >
          <PhoneMockup contactName="BytesPlatform AI" contactSub="typing…">
            <div className="flex h-full flex-col justify-end">
              <ChatBubble from="bot" time="10:22">
                Hey! I can build you a website, design an ad, or run a free SEO audit. What are you looking for?
              </ChatBubble>
              <ChatBubble from="user" time="10:23">
                Website for my gym — Flex Studios 💪
              </ChatBubble>
              <ChatBubble from="bot" time="10:23">
                Nice. Modern, bold, or minimal look?
              </ChatBubble>
              <ChatBubble from="user" time="10:24">
                Bold with dark theme
              </ChatBubble>
              <TypingBubble />
              <ChatBubble from="bot" time="10:25">
                On it — building your preview 🔨
              </ChatBubble>
              <LinkPreview
                title="Flex Studios · Premier Gym"
                description="Dark theme · 5 sections · mobile ready"
                url="flex-studios.bytesplatform.site"
                thumbColor="from-ink-900 to-wa-green"
              />
            </div>
          </PhoneMockup>
        </motion.div>
      </div>
    </Section>
  );
}
