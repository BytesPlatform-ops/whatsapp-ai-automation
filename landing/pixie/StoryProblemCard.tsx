import { Check } from 'lucide-react';
import type { ProblemCard } from './joinPixieData';

interface StoryProblemCardProps {
  card: ProblemCard;
  /** Card index, shown as a small "01 / 06" marker. */
  index: number;
  total: number;
  /** Optional first name — weaves the visitor in: "Ali, how many leads…". */
  name?: string;
}

/** Lowercases the first letter so a name can be prefixed as a vocative. */
function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/**
 * Pure presentational poster — a single colourful problem story card.
 * Styling is from joinPixie.css (jp-* classes); the colour world comes from the
 * card's id (.jp-poster--<id>) and tone (.jp-poster--dark/--light).
 */
export function StoryProblemCard({ card, index, total, name }: StoryProblemCardProps) {
  const { id, badge, question, solution, chip, solutions, Icon, tone } = card;

  const firstName = name?.trim().split(' ')[0] ?? '';
  const headline = firstName ? `${firstName}, ${lowerFirst(question)}` : question;

  return (
    <div className={`jp-poster jp-poster--${tone} jp-poster--${id}`}>
      {/* Decorative layers */}
      <div aria-hidden className="jp-poster__grid" />
      <div aria-hidden className="jp-poster__glow" />
      <div aria-hidden className="jp-poster__glow--soft" />

      {/* Top row: badge + index */}
      <div className="jp-poster__top">
        <span className="jp-badge">
          <Icon className="jp-badge__icon" strokeWidth={2.5} />
          {badge}
        </span>
        <span className="jp-index">
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
      </div>

      {/* Big question */}
      <div className="jp-poster__body">
        <h3 className="jp-poster__question">{headline}</h3>
        <p className="jp-poster__solution">{solution}</p>
      </div>

      {/* How Pixie solves it */}
      <ul className="jp-solutions">
        {solutions.map((point) => (
          <li key={point} className="jp-solutions__item">
            <span className="jp-solutions__check">
              <Check strokeWidth={3} />
            </span>
            <span className="jp-solutions__text">{point}</span>
          </li>
        ))}
      </ul>

      {/* Status chip */}
      <div className="jp-chip-wrap">
        <span className="jp-chip">
          <span className="jp-chip__dot" />
          {chip}
        </span>
      </div>
    </div>
  );
}
