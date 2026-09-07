// Runs on the build machine only. Its output is baked into the static SVG.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createSimulation } from '../site/graph-physics.mjs';

function startingPositions(nodes, width, height, seed) {
  let state = seed;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  const order = nodes.map(node => ({ node, rank: random() })).sort((a, b) => a.rank - b.rank);
  return order.map(({ node }, index) => {
    const radius = Math.sqrt((index + .5) / nodes.length);
    const angle = index * Math.PI * (3 - Math.sqrt(5)) + random() * .2;
    return { id: node.id, x: width / 2 + Math.cos(angle) * radius * (width / 2 - 100), y: height / 2 + Math.sin(angle) * radius * (height / 2 - 50) };
  }).sort((a, b) => a.id - b.id);
}

export function validateLayout(nodes, width, height) {
  for (const node of nodes) {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y) || node.x < 88 || node.x > width - 88 || node.y < 37 || node.y > height - 37) {
      throw new Error(`Node ${node.id} is outside the graph`);
    }
    for (const other of nodes) {
      if (node.id !== other.id && Math.abs(node.x - other.x) < 160 && Math.abs(node.y - other.y) < 58) {
        throw new Error(`Labels ${node.id} and ${other.id} overlap`);
      }
    }
  }
}

export function anneal({ nodes, relationships, width, height }) {
  const candidates = [];
  for (const seed of [1, 29, 103]) {
    const initial = startingPositions(nodes, width, height, seed);
    const simulation = createSimulation(initial, relationships, width, height);
    for (let tick = 0; tick < 600; tick++) simulation.step({ shape: 0, temperature: .8 });
    for (let tick = 1; tick <= 1200; tick++) {
      const progress = tick / 1200;
      const shape = progress * progress * (3 - 2 * progress);
      simulation.step({ shape, temperature: .8 - .55 * progress });
    }
    // Keep the exact browser forces active until positions, not just temperature,
    // have settled. A cooldown alone can hide a poorly minimized configuration.
    let converged = false;
    for (let batch = 0; batch < 16; batch++) {
      const previous = simulation.nodes.map(({ x, y }) => ({ x, y }));
      for (let tick = 0; tick < 500; tick++) simulation.step({ temperature: 1 });
      const movement = Math.max(...simulation.nodes.map((node, i) => Math.hypot(node.x - previous[i].x, node.y - previous[i].y)));
      if (movement < .02) { converged = true; break; }
    }
    if (!converged) continue;
    while (simulation.step()) {}
    const positions = simulation.nodes.map(({ id, x, y }) => ({ id, x: +x.toFixed(6), y: +y.toFixed(6) }));
    try {
      validateLayout(positions, width, height);
      candidates.push({ seed, energy: simulation.energy(), nodes: positions });
    } catch {
      // A constrained start may jam; it cannot become the published layout.
    }
  }
  if (!candidates.length) throw new Error('No non-overlapping annealed layout found');
  candidates.sort((a, b) => a.energy - b.energy);
  const winner = candidates[0];
  return { width, height, nodes: winner.nodes, seed: winner.seed, energy: winner.energy };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify(anneal(JSON.parse(readFileSync(0, 'utf8')))) + '\n');
}
