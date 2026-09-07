import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { anneal, validateLayout } from '../scripts/anneal.mjs';
import { createSimulation } from '../site/graph-physics.mjs';

const curated = JSON.parse(await readFile(new URL('../data/curated.json', import.meta.url), 'utf8'));
const nodes = curated.issues.map(issue => ({ id: issue.number, x: issue.position[0], y: issue.position[1] })).sort((a, b) => a.id - b.id);
const pairs = [...new Set(curated.relationships.map(edge => [edge.from, edge.to].sort((a, b) => a - b).join(':')))].sort().map(pair => {
  const [from, to] = pair.split(':').map(Number); return { from, to };
});
const input = { nodes, relationships: pairs, width: 1120, height: Math.max(580, ...nodes.map(node => node.y + 50)) };

test('annealing is reproducible, preserves all issues, and improves on the jammed grid', () => {
  const original = structuredClone(input);
  const result = anneal(input);
  assert.deepEqual(anneal(input), result);
  assert.deepEqual(input, original);
  assert.deepEqual(result.nodes.map(node => node.id), nodes.map(node => node.id));
  validateLayout(result.nodes, result.width, result.height);
  const baseline = createSimulation(nodes, pairs, input.width, input.height);
  while (baseline.step()) {}
  assert.ok(result.energy < baseline.energy() * .95, 'minimization should materially improve this dataset');
  const resumed = createSimulation(result.nodes, pairs, input.width, input.height);
  for (let i = 0; i < 300; i++) resumed.step();
  const drift = Math.max(...resumed.nodes.map((node, i) => Math.hypot(node.x - result.nodes[i].x, node.y - result.nodes[i].y)));
  assert.ok(drift < 1, `normal browser forces must agree with the result, drift=${drift}`);
});

test('circular collisions allow labels to pass before expansion restores rectangular spacing', () => {
  const records = [{ id: 1, x: 400, y: 200 }, { id: 2, x: 500, y: 200 }];
  const simulation = createSimulation(records, [], 1120, 580);
  simulation.step({ shape: 0, temperature: 0 });
  assert.equal(simulation.nodes[1].x - simulation.nodes[0].x, 100);
  simulation.step({ shape: 1, temperature: 0 });
  validateLayout(simulation.nodes, 1120, 580);
});
