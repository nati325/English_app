// SM-2 מפושט. grade: 0=שוב 1=קשה 2=טוב 3=קל
import { state, save } from './store.js';

const DAY = 864e5;
export const get = (id) => state.cards[id];
export function learn(id) { if (!state.cards[id]) { state.cards[id] = { ease: 2.5, ivl: 0, reps: 0, lapses: 0, due: Date.now() }; save(); } }
export function dueIds() { const n = Date.now(); return Object.entries(state.cards).filter(([,c]) => c.due <= n).sort((a,b)=>a[1].due-b[1].due).map(([id])=>id); }

export function preview(id) { // כמה זמן עד החזרה הבאה לכל ציון
  const c = state.cards[id]; return [0,1,2,3].map(g => fmt(next(c, g).ivl));
}
function next(c, g) {
  let { ease, ivl, reps, lapses } = c;
  if (g === 0) { reps = 0; lapses++; ivl = 0; ease = Math.max(1.3, ease - .2); }
  else {
    reps++;
    if (reps === 1) ivl = g === 3 ? 3 : g === 1 ? .5 : 1;
    else if (reps === 2) ivl = g === 3 ? 7 : g === 1 ? 2 : 4;
    else ivl = Math.round(ivl * ease * (g === 1 ? .8 : g === 3 ? 1.35 : 1)) || 1;
    ease = Math.max(1.3, ease + (g === 3 ? .15 : g === 1 ? -.15 : 0));
  }
  return { ease, ivl, reps, lapses };
}
export function grade(id, g) {
  const c = state.cards[id]; const n = next(c, g);
  Object.assign(c, n, { due: Date.now() + (g === 0 ? 5 * 60e3 : n.ivl * DAY) });
  save(); return c;
}
const fmt = (d) => d <= 0 ? '5 ד׳' : d < 1 ? 'שעות' : d < 30 ? `${Math.round(d)} י׳` : `${Math.round(d/30)} ח׳`;
export const mature = () => Object.values(state.cards).filter(c => c.ivl >= 21).length;
