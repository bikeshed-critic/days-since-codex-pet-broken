// A small, deterministic force layout for the reviewed graph. No network or DOM.
const HALF_WIDTH = 80;
const HALF_HEIGHT = 29;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createSimulation(records, relationships, width, height) {
  const nodes = records.map(record => ({ ...record, vx: 0, vy: 0, fixed: false }));
  const byId = new Map(nodes.map(node => [node.id, node]));
  let links = [];
  let alpha = 1;

  function setLinks(edges) {
    const pairs = new Map();
    for (const edge of edges) {
      const a = byId.get(edge.from), b = byId.get(edge.to);
      if (!a || !b || a === b) continue;
      // Reciprocal references and multiple relationship types are one spring.
      const key = [a.id, b.id].sort((x, y) => x - y).join(':');
      pairs.set(key, { a, b });
    }
    links = [...pairs.values()];
    const degree = new Map(nodes.map(node => [node, 0]));
    for (const { a, b } of links) {
      degree.set(a, degree.get(a) + 1);
      degree.set(b, degree.get(b) + 1);
    }
    for (const link of links) link.strength = .012 / Math.sqrt(Math.max(degree.get(link.a), degree.get(link.b)));
  }

  function contain(node) {
    node.x = clamp(node.x, HALF_WIDTH + 8, width - HALF_WIDTH - 8);
    node.y = clamp(node.y, HALF_HEIGHT + 8, height - HALF_HEIGHT - 8);
  }

  function step() {
    for (const node of nodes) {
      node.vx += (width / 2 - node.x) * .0007 * alpha;
      node.vy += (height / 2 - node.y) * .0007 * alpha;
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        // Deterministic separation also handles a node dropped on another node.
        const dx = b.x - a.x || .01, dy = b.y - a.y || .01;
        const distance = Math.hypot(dx, dy);
        const force = Math.min(2, 5500 / (distance * distance)) * alpha;
        a.vx -= dx / distance * force; a.vy -= dy / distance * force;
        b.vx += dx / distance * force; b.vy += dy / distance * force;
      }
    }
    for (const { a, b, strength } of links) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 1;
      const force = (distance - 220) * strength * alpha;
      a.vx += dx / distance * force; a.vy += dy / distance * force;
      b.vx -= dx / distance * force; b.vy -= dy / distance * force;
    }
    for (const node of nodes) {
      if (node.fixed) { node.vx = node.vy = 0; continue; }
      node.vx = clamp(node.vx * .72, -6, 6);
      node.vy = clamp(node.vy * .72, -6, 6);
      node.x += node.vx; node.y += node.vy;
      contain(node);
    }
    // Rectangular collisions leave room for both the issue number and its label.
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const overlapX = 172 - Math.abs(dx), overlapY = 70 - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0 || (a.fixed && b.fixed)) continue;
          const share = a.fixed || b.fixed ? 1 : .5;
          const axis = overlapX < overlapY ? 'x' : 'y';
          const offset = (axis === 'x' ? overlapX : overlapY) * share * Math.sign((axis === 'x' ? dx : dy) || 1);
          if (!a.fixed) { a[axis] -= offset; contain(a); }
          if (!b.fixed) { b[axis] += offset; contain(b); }
        }
      }
    }
    alpha *= .985;
    return alpha > .006;
  }

  setLinks(relationships);
  return {
    nodes, setLinks, step,
    reheat() { alpha = .8; },
    move(node, x, y) { node.x = x; node.y = y; node.vx = node.vy = 0; contain(node); },
    reset() {
      nodes.forEach((node, i) => Object.assign(node, records[i], { vx: 0, vy: 0, fixed: false }));
      alpha = 1;
    },
  };
}

export function edgePath(a, b, kind) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (distance < .01) return `M ${a.x} ${a.y}`;
  const ux = dx / distance, uy = dy / distance;
  const boundary = Math.min(HALF_WIDTH / Math.abs(ux), HALF_HEIGHT / Math.abs(uy)) + 4;
  const inset = Math.min(boundary, distance / 2);
  const sx = a.x + ux * inset, sy = a.y + uy * inset;
  const ex = b.x - ux * inset, ey = b.y - uy * inset;
  const bend = { reference: 15, official_duplicate: 0, similarity: -35, hypothesis: 48, opposite: -48 }[kind] ?? 0;
  const cx = (sx + ex) / 2 - uy * bend, cy = (sy + ey) / 2 + ux * bend;
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}
