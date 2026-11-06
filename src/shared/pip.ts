import art from './pip-art.json';

const NS = 'http://www.w3.org/2000/svg';

/** Builds the character SVG with safe DOM APIs (no innerHTML). Swap pip-art.json to restyle. */
export function buildCharacter(doc: Document = document): SVGSVGElement {
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', art.viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const el of art.elements) {
    const node = doc.createElementNS(NS, el.tag);
    for (const [k, v] of Object.entries(el.attrs)) node.setAttribute(k, v);
    svg.append(node);
  }
  return svg;
}

export const characterName = art.name;
