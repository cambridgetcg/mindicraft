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
const STEP = /^\d+\. /;
const ITEM = /^(?:\d+\.|-) /;

// headings: the three section titles of this language, e.g.
// { need: 'You need', steps: 'Steps', watch: 'Watch out' }.
// Returns null when the guide lacks one of them or has them out of order;
// the page then renders exactly as it always has.
export function splitFieldCard(body, headings) {
  const marks = [...body.matchAll(SECTION)].map((m) => ({ title: m[1].trim(), at: m.index }));
  const find = (title) => marks.findIndex((mark) => mark.title === title);
  const need = find(headings.need);
  const steps = find(headings.steps);
  const watch = find(headings.watch);
  if (need < 0 || !(need < steps && steps < watch)) return null;

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

// The bold opening words of every step, in order — or null unless every
// step has one, so a glance never shows some steps and silently skips others.
export function stepLeads(stepsMarkdown) {
  const steps = stepsMarkdown.split('\n').filter((line) => STEP.test(line));
  const leads = steps.map((line) => line.match(/^\d+\. \*\*(.+?)\*\*/)?.[1]);
  return steps.length && leads.every(Boolean) ? leads : null;
}

// Top-level list items in a section: things to have, or warnings.
export const countItems = (markdown) =>
  markdown.split('\n').filter((line) => ITEM.test(line)).length;

// Top-level numbered steps — the same items numberSteps anchors.
export const countSteps = (markdown) =>
  markdown.split('\n').filter((line) => STEP.test(line)).length;

// Give each top-level step an anchor (#step-1, #step-2, …) so the glance can
// point at it. Nested lists inside a step keep their plain items.
export function numberSteps(html) {
  let depth = 0;
  let n = 0;
  let inSteps = false;
  return html.replace(/<(\/?)(ol|ul)\b[^>]*>|<li>/g, (tag, close, list) => {
    if (list) {
      if (close) depth -= 1;
      else {
        if (depth === 0) inSteps = list === 'ol';
        depth += 1;
      }
      return tag;
    }
    return inSteps && depth === 1 ? `<li id="step-${++n}">` : tag;
  });
}
