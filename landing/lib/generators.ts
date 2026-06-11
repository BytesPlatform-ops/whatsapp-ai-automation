// Client-side data + generator functions shared by the random/name tools
// (viking, pirate, anime, superhero, gamertag, emoji, food). Pure functions —
// no deps, no network. Randomness lives here; widgets call these on the client.

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generate `n` items from `gen`, de-duplicating best-effort without looping forever.
export function batch(gen: () => string, n: number): string[] {
  const out = new Set<string>();
  let guard = 0;
  while (out.size < n && guard < n * 12) {
    out.add(gen());
    guard++;
  }
  return Array.from(out);
}

/* ---------------------------------- Viking ---------------------------------- */
const VIKING_FIRST = [
  'Ragnar', 'Bjorn', 'Erik', 'Leif', 'Sigurd', 'Ivar', 'Gunnar', 'Olaf', 'Sven', 'Harald',
  'Knut', 'Rurik', 'Ulf', 'Arne', 'Frode', 'Halfdan', 'Torvald', 'Eindride', 'Steinar', 'Vidar',
  'Astrid', 'Freydis', 'Gudrun', 'Hilda', 'Ingrid', 'Sigrid', 'Thyra', 'Solveig', 'Yrsa', 'Revna',
];
const VIKING_EPITHET = [
  'the Bold', 'Ironside', 'Bloodaxe', 'the Boneless', 'Forkbeard', 'the Red', 'Skullsplitter',
  'the Fearless', 'Longsword', 'the Wanderer', 'Bear-Heart', 'the Grim', 'Stormborn', 'Oathkeeper',
  'the Wolf', 'Shieldbreaker', 'the Tall', 'Raven-Feeder', 'Frostbeard', 'the Far-Travelled',
];
export const vikingName = () => `${pick(VIKING_FIRST)} ${pick(VIKING_EPITHET)}`;

/* ---------------------------------- Pirate ---------------------------------- */
const PIRATE_TITLE = ['Captain', 'Black', 'Mad', 'One-Eyed', 'Salty', 'Dread', 'Long', 'Iron', 'Red', 'Old'];
const PIRATE_FIRST = ['Jack', 'Anne', 'Morgan', 'Edward', 'Bart', 'Calico', 'Henry', 'Mary', 'Sam', 'Roberts', 'Ned', 'Grace'];
const PIRATE_SUR = [
  'Blackheart', 'Sparrow', 'Bones', 'Flint', 'Silver', 'Hook', 'Teach', 'Cutlass', 'Saltbeard',
  'Stormcrow', 'Deadeye', 'Gold-Tooth', 'Seadog', 'Barnacle', 'Ravenshore', 'Krakenbane',
];
export const pirateName = () =>
  Math.random() < 0.5
    ? `${pick(PIRATE_TITLE)} ${pick(PIRATE_FIRST)} ${pick(PIRATE_SUR)}`
    : `${pick(PIRATE_FIRST)} "${pick(PIRATE_TITLE)}" ${pick(PIRATE_SUR)}`;

/* ----------------------------------- Anime ---------------------------------- */
const ANIME_GIVEN = [
  'Akira', 'Haruki', 'Yuki', 'Sora', 'Ren', 'Kaito', 'Hana', 'Sakura', 'Rei', 'Aoi',
  'Kenji', 'Riku', 'Mei', 'Yuna', 'Takeshi', 'Hinata', 'Kazuki', 'Nami', 'Asuka', 'Daichi',
  'Kira', 'Itsuki', 'Mio', 'Haru', 'Tatsuya', 'Emi', 'Sho', 'Rin', 'Yamato', 'Chika',
];
const ANIME_SURNAME = [
  'Tanaka', 'Sato', 'Takahashi', 'Yamamoto', 'Kobayashi', 'Nakamura', 'Saito', 'Kuroda',
  'Fujimoto', 'Ishikawa', 'Mori', 'Hayashi', 'Shimizu', 'Arima', 'Kurosawa', 'Hoshino',
  'Akiyama', 'Minami', 'Sakamoto', 'Ueda',
];
export const animeName = () => `${pick(ANIME_GIVEN)} ${pick(ANIME_SURNAME)}`;

/* --------------------------------- Superhero -------------------------------- */
const HERO_ADJ = [
  'Crimson', 'Shadow', 'Iron', 'Mighty', 'Silver', 'Cosmic', 'Midnight', 'Thunder', 'Phantom',
  'Golden', 'Savage', 'Electric', 'Frost', 'Solar', 'Vapor', 'Steel', 'Quantum', 'Inferno',
  'Storm', 'Scarlet', 'Obsidian', 'Radiant', 'Astral', 'Nova',
];
const HERO_NOUN = [
  'Phantom', 'Guardian', 'Striker', 'Falcon', 'Specter', 'Sentinel', 'Avenger', 'Vortex', 'Blaze',
  'Titan', 'Comet', 'Warden', 'Hawk', 'Pulse', 'Knight', 'Bolt', 'Shade', 'Surge', 'Viper', 'Fury',
  'Ranger', 'Cyclone', 'Reaper', 'Hunter',
];
export const superheroName = () =>
  Math.random() < 0.5 ? `The ${pick(HERO_ADJ)} ${pick(HERO_NOUN)}` : `${pick(HERO_ADJ)} ${pick(HERO_NOUN)}`;

/* --------------------------------- Gamertag --------------------------------- */
const TAG_ADJ = [
  'Shadow', 'Toxic', 'Frost', 'Night', 'Savage', 'Rapid', 'Silent', 'Cyber', 'Iron', 'Venom',
  'Rogue', 'Chaos', 'Phantom', 'Crimson', 'Storm', 'Dark', 'Hyper', 'Lethal', 'Grim', 'Neon',
];
const TAG_NOUN = [
  'Sniper', 'Reaper', 'Wolf', 'Byte', 'Blade', 'Ghost', 'Hunter', 'Viper', 'Striker', 'Raven',
  'Demon', 'Titan', 'Fox', 'Pulse', 'Ronin', 'Hawk', 'Saber', 'Bolt', 'Specter', 'Knight',
];
const LEET: Record<string, string> = { a: '4', e: '3', i: '1', o: '0', s: '5', t: '7' };

export interface GamertagOpts {
  numbers?: boolean;
  leet?: boolean;
  decorate?: boolean;
}
export function gamertag(opts: GamertagOpts = {}): string {
  let core = `${pick(TAG_ADJ)}${pick(TAG_NOUN)}`;
  if (opts.leet) core = core.replace(/[aeiost]/gi, (c) => LEET[c.toLowerCase()] ?? c);
  if (opts.numbers) core += String(Math.floor(Math.random() * 1000)).padStart(2, '0');
  if (opts.decorate) core = `xX_${core}_Xx`;
  return core;
}

/* ----------------------------------- Emoji ---------------------------------- */
export const EMOJI_CATEGORIES: Record<string, string[]> = {
  Smileys: ['😀', '😁', '😂', '🤣', '😊', '😍', '😎', '🤔', '😴', '🥳', '😭', '😡', '🤯', '🥰', '😇', '🙃', '😜', '🤩', '😬', '🤤'],
  Animals: ['🐶', '🐱', '🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🦄', '🐸', '🐵', '🐧', '🦉', '🦅', '🦋', '🐙', '🦖', '🐢', '🐝', '🦔'],
  Food: ['🍕', '🍔', '🌮', '🍣', '🍜', '🍩', '🍪', '🍰', '🍓', '🍉', '🥑', '🌭', '🍟', '🍫', '🧁', '🍦', '🥨', '🍇', '🍑', '🥗'],
  Hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '❣️', '💟'],
  Hands: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '👏', '🙌', '🙏', '🤝', '💪', '👋', '🤙', '✋', '🖖', '👊', '🫶'],
  Travel: ['✈️', '🚗', '🚀', '🚲', '⛵', '🏝️', '🗺️', '🏔️', '🎡', '🗽', '🏰', '⛺', '🚁', '🛸', '🌋', '🏖️', '🎢', '🚂'],
  Symbols: ['⭐', '🔥', '✨', '💯', '⚡', '🌈', '💥', '❄️', '🎉', '🎯', '🔮', '💎', '🏆', '🎵', '☀️', '🌙', '☁️', '⚠️'],
};
export const EMOJI_ALL = Object.values(EMOJI_CATEGORIES).flat();
export function randomEmoji(category: string): string {
  const pool = category === 'All' ? EMOJI_ALL : EMOJI_CATEGORIES[category] ?? EMOJI_ALL;
  return pick(pool);
}

/* ----------------------------------- Food ----------------------------------- */
export const FOOD_CATEGORIES: Record<string, string[]> = {
  Breakfast: ['Pancakes', 'Avocado toast', 'Omelette', 'Greek yogurt with granola', 'Breakfast burrito', 'French toast', 'Shakshuka', 'Bagel with cream cheese', 'Oatmeal with berries', 'Waffles', 'Eggs Benedict', 'Smoothie bowl'],
  Lunch: ['Chicken Caesar salad', 'Turkey sandwich', 'Sushi rolls', 'Margherita pizza', 'Falafel wrap', 'Ramen', 'Burrito bowl', 'Caprese panini', 'Pho', 'Poke bowl', 'Grilled cheese & tomato soup', 'Bánh mì'],
  Dinner: ['Spaghetti carbonara', 'Butter chicken', 'Steak with fries', 'Pad thai', 'Beef tacos', 'Salmon with veggies', 'Chicken biryani', 'Lasagna', 'Stir-fry noodles', 'BBQ ribs', 'Mushroom risotto', 'Fish & chips'],
  Dessert: ['Chocolate brownie', 'Cheesecake', 'Tiramisu', 'Ice cream sundae', 'Apple pie', 'Macarons', 'Churros', 'Mango sticky rice', 'Crème brûlée', 'Banoffee pie', 'Gulab jamun', 'Lemon tart'],
  Snack: ['Hummus & pita', 'Trail mix', 'Popcorn', 'Nachos', 'Fruit & nut bar', 'Pretzels', 'Edamame', 'Cheese & crackers', 'Spring rolls', 'Chips & salsa', 'Yogurt parfait', 'Samosa'],
};
export const FOOD_ALL = Object.values(FOOD_CATEGORIES).flat();
export function randomFood(category: string): string {
  const pool = category === 'Any' ? FOOD_ALL : FOOD_CATEGORIES[category] ?? FOOD_ALL;
  return pick(pool);
}

/* ------------------------------- Business name ----------------------------- */
const BIZ_PREFIX = ['Get', 'Go', 'Try', 'My', 'Neo', 'Pro', 'Smart', 'True', 'Prime', 'Next'];
const BIZ_SUFFIX = ['Hub', 'Labs', 'io', 'Co', 'Works', 'Spot', 'Base', 'Nest', 'Forge', 'Pulse', 'Wave', 'Mate', 'Genix', 'Sphere', 'Loop'];
const BIZ_GENERIC = ['Brand', 'Venture', 'Studio', 'Craft', 'Summit', 'Vertex', 'Pixel', 'Orbit', 'Cobalt', 'Maple', 'Atlas', 'Nova', 'Ember', 'Quill'];

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Generates one business-name idea, optionally seeded with a keyword.
export function businessName(keyword: string): string {
  const raw = (keyword || '').trim().split(/\s+/)[0].replace(/[^a-zA-Z]/g, '');
  const base = raw ? cap(raw.toLowerCase()) : cap(pick(BIZ_GENERIC).toLowerCase());
  const r = Math.random();
  if (r < 0.24) return `${base}${pick(BIZ_SUFFIX)}`;
  if (r < 0.42) return `${pick(BIZ_PREFIX)}${base}`;
  if (r < 0.56) return `${base}ly`;
  if (r < 0.68) return `The ${base} Co.`;
  if (r < 0.8) return `${base}ify`;
  if (r < 0.9) return `${base} ${pick(['Labs', 'Studio', 'Works', 'Collective', 'Group'])}`;
  return `${base}${pick(BIZ_SUFFIX)}`;
}
