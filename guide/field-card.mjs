// Field cards: a guide's reviewed words, laid out for doing.
//
// The front of the card is everything up to the end of the warnings: the
// opening, what you need, the steps, any section the author placed between
// them, and the warnings themselves. The back is everything after — how it
// works, and where to go further. The split is a cut, never an edit:
// front + back is the guide body byte for byte, so no word is hidden,
// dropped, reordered, or rewritten to make the card. The glance above the
// card only points into that text; it never stands in for it.

const SECTION = /^## (.*)$/gm;
const ITEM = /^(?:\d+\.|-) /;

// headings: the three section titles of this language, e.g.
// { need: 'You need', steps: 'Steps', watch: 'Watch out' }.
// Returns null when the guide lacks one of them, repeats one, or has them out
// of order; the page then renders exactly as it always has. A second "Watch
// out" after the steps would otherwise land on the back, off the printed card.
export function splitFieldCard(body, headings) {
  const marks = [...body.matchAll(SECTION)].map((m) => ({ title: m[1].trim(), at: m.index }));
  const find = (title) => marks.findIndex((mark) => mark.title === title);
  const once = (title) => marks.filter((mark) => mark.title === title).length === 1;
  if (![headings.need, headings.steps, headings.watch].every(once)) return null;
  const need = find(headings.need);
  const steps = find(headings.steps);
  const watch = find(headings.watch);
  if (!(need < steps && steps < watch)) return null;

  const kindOf = (i) => (i === need ? 'need' : i === steps ? 'steps' : i === watch ? 'watch' : null);
  const sections = marks.map((mark, i) => ({
    title: mark.title,
    kind: kindOf(i),
    markdown: body.slice(mark.at, i + 1 < marks.length ? marks[i + 1].at : body.length),
  }));
  return {
    intro: body.slice(0, marks[0].at),
    front: sections.slice(0, watch + 1),
    back: sections.slice(watch + 1),
  };
}

// Top-level list items in a section: things to have, or warnings.
export const countItems = (markdown) =>
  markdown.split('\n').filter((line) => ITEM.test(line)).length;

// A step's lead is the bold text the step opens with, as the page renders it.
const LEAD = /^(?:<p>)?<strong>([\s\S]*?)<\/strong>(.?)/u;
// A lead is whole when the author ended a sentence or a clause with it:
// "Stop moving." is; "Dig roots in autumn and winter," is not.
const ENDS = /[.!?。！？…:：]["'”’」』)）]*$/u;
const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

// Give each top-level step an anchor (#step-1, #step-2, …) so the glance can
// point at it; nested lists inside a step keep their plain items. Returns the
// numbered html, the step count, and the leads for the glance as
// { html, whole } — or null leads unless every step opens with bold that
// renders as bold, and the steps are one list, so the glance's numbers are
// the page's.
export function numberSteps(html) {
  let depth = 0;
  let lists = 0;
  let inSteps = false;
  const leads = [];
  const numbered = html.replace(/<(\/?)(ol|ul)\b[^>]*>|<li>/g, (tag, close, list, at) => {
    if (list) {
      if (close) depth -= 1;
      else {
        if (depth === 0) {
          inSteps = list === 'ol';
          if (inSteps) lists += 1;
        }
        depth += 1;
      }
      return tag;
    }
    if (!(inSteps && depth === 1)) return tag;
    const lead = html.slice(at + tag.length).match(LEAD);
    leads.push(lead && { html: lead[1], whole: ENDS.test(textOf(lead[1]) + lead[2].trim()) });
    return `<li id="step-${leads.length}">`;
  });
  return {
    html: numbered,
    count: leads.length,
    leads: leads.length && lists === 1 && leads.every(Boolean) ? leads : null,
  };
}
