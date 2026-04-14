import { Star } from 'lucide-react';

const items = [
  { value: '500+', label: 'sites generated' },
  { value: '2,000+', label: 'conversations handled' },
  { value: '8 sec', label: 'avg. bot response' },
  { value: '4.8/5', label: 'avg. rating', star: true },
  { value: 'Meta', label: 'Business Partner' },
];

export function TrustStrip() {
  return (
    <div className="relative border-y border-ink-100 bg-ink-50">
      <div className="container-page">
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 py-5">
          {items.map((item) => (
            <div key={item.label} className="flex items-baseline gap-2">
              {item.star && <Star className="h-4 w-4 translate-y-0.5 fill-amber-400 text-amber-400" />}
              <span className="font-display text-base font-bold text-ink-900 sm:text-lg">
                {item.value}
              </span>
              <span className="text-xs font-medium text-ink-500 sm:text-sm">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
