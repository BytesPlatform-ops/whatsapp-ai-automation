import { ReactNode } from 'react';

interface SectionProps {
  id?: string;
  children: ReactNode;
  className?: string;
  dark?: boolean;
  soft?: boolean;
}

export function Section({ id, children, className = '', dark = false, soft = false }: SectionProps) {
  const bg = dark ? 'bg-navy-900 text-white' : soft ? 'bg-ink-50' : 'bg-white';
  return (
    <section id={id} className={`relative py-20 sm:py-28 ${bg} ${className}`}>
      <div className="container-page">{children}</div>
    </section>
  );
}

interface EyebrowProps {
  children: ReactNode;
  dark?: boolean;
  icon?: ReactNode;
}

export function Eyebrow({ children, dark = false, icon }: EyebrowProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] font-semibold uppercase tracking-wider ${
        dark
          ? 'border-wa-green/30 bg-wa-green/10 text-wa-green'
          : 'border-wa-green/20 bg-wa-bubble/50 text-wa-teal'
      }`}
    >
      {icon}
      {children}
    </span>
  );
}

interface SectionHeadingProps {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  center?: boolean;
  dark?: boolean;
}

export function SectionHeading({ eyebrow, title, subtitle, center = true, dark = false }: SectionHeadingProps) {
  return (
    <div className={`${center ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'} mb-14`}>
      {eyebrow && (
        <div className="mb-4">
          <Eyebrow dark={dark}>{eyebrow}</Eyebrow>
        </div>
      )}
      <h2
        className={`font-display text-display-lg text-balance ${
          dark ? 'text-white' : 'text-ink-900'
        }`}
      >
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-5 text-lg leading-relaxed ${dark ? 'text-white/70' : 'text-ink-500'}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
