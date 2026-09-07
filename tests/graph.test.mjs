import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSimulation, edgePath } from '../site/graph-physics.mjs';

const curated = JSON.parse(await readFile(new URL('../data/curated.json', import.meta.url), 'utf8'));
const records = curated.issues.map(issue => ({ id: issue.number, x: issue.position[0], y: issue.position[1] }));
const height = Math.max(580, ...records.map(node => node.y + 50));
const simulate = (edges = curated.relationships) => createSimulation(records, edges, 1120, height);

test('the full reviewed graph settles with finite, bounded, non-overlapping labels', () => {
  const simulation = simulate();
  let steps = 0;
  while (simulation.step()) assert.ok(++steps < 500, 'motion must finish');
  assert.ok(simulation.nodes.some((node, i) => Math.hypot(node.x - records[i].x, node.y - records[i].y) > 50));
  for (const node of simulation.nodes) {
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
    assert.ok(node.x >= 88 && node.x <= 1032);
    assert.ok(node.y >= 37 && node.y <= height - 37);
    for (const other of simulation.nodes) {
      if (node === other) continue;
      assert.ok(Math.abs(node.x - other.x) >= 160 || Math.abs(node.y - other.y) >= 58, `overlap: ${node.id}, ${other.id}`);
    }
  }
});

test('duplicate and reciprocal evidence does not multiply a pair’s spring strength', () => {
  const edge = curated.relationships[0];
  const one = simulate([edge]);
  const many = simulate([edge, edge, { ...edge, from: edge.to, to: edge.from }]);
  for (let i = 0; i < 100; i++) { one.step(); many.step(); }
  assert.deepEqual(one.nodes, many.nodes);
});

test('filters change attraction, reset restores reviewed coordinates without changing data', () => {
  const original = structuredClone(records);
  const linked = simulate(), unlinked = simulate();
  unlinked.setLinks([]);
  for (let i = 0; i < 100; i++) { linked.step(); unlinked.step(); }
  assert.notDeepEqual(linked.nodes, unlinked.nodes);
  linked.reset();
  assert.deepEqual(linked.nodes.map(({ id, x, y }) => ({ id, x, y })), original);
  assert.deepEqual(records, original);
});

test('dragging is bounded and fixed nodes survive forces and coincident collisions', () => {
  const simulation = createSimulation([{ id: 1, x: 200, y: 200 }, { id: 2, x: 200, y: 200 }], [{ from: 1, to: 2 }], 1120, 580);
  const node = simulation.nodes[0];
  node.fixed = true;
  for (let i = 0; i < 50; i++) simulation.step();
  assert.equal(node.x, 200); assert.equal(node.y, 200);
  assert.ok(Math.abs(node.x - simulation.nodes[1].x) >= 160 || Math.abs(node.y - simulation.nodes[1].y) >= 58);
  simulation.move(node, -1000, 10000);
  assert.equal(node.x, 88); assert.equal(node.y, 543);
});

test('edge endpoints stay outside node labels and coincident endpoints stay finite', () => {
  assert.equal(edgePath({ x: 100, y: 100 }, { x: 400, y: 100 }, 'reference'), 'M 184.0 100.0 Q 250.0 115.0 316.0 100.0');
  assert.equal(edgePath({ x: 100, y: 100 }, { x: 100, y: 400 }, 'official_duplicate'), 'M 100.0 133.0 Q 100.0 250.0 100.0 367.0');
  assert.equal(edgePath({ x: 100, y: 100 }, { x: 100, y: 100 }, 'reference'), 'M 100 100');
});

test('a hovered issue gently pushes its neighbour farther away', () => {
  const pair = [{ id: 1, x: 400, y: 200 }, { id: 2, x: 600, y: 200 }];
  const normal = createSimulation(pair, [], 1120, 580);
  const hovered = createSimulation(pair, [], 1120, 580);
  normal.nodes[0].fixed = hovered.nodes[0].fixed = true;
  hovered.nodes[0].hovered = true;
  for (let i = 0; i < 20; i++) { normal.step(); hovered.step(); }
  assert.ok(hovered.nodes[1].x > normal.nodes[1].x);
  assert.equal(hovered.nodes[0].x, 400);
  hovered.reset();
  assert.equal(hovered.nodes[0].hovered, false);
  assert.equal(hovered.nodes[0].fixed, false);
});

test('hover visibly opens space in the settled, crowded graph within one second', () => {
  const simulation = simulate();
  while (simulation.step()) {}
  const before = simulation.nodes.map(node => ({ ...node }));
  // This hub moved its neighbours less than one pixel with the old multiplier.
  const hub = simulation.nodes.find(node => node.id === 41513);
  const origin = { x: hub.x, y: hub.y };
  hub.hovered = hub.fixed = true;
  simulation.reheat(.18);
  for (let frame = 0; frame < 60; frame++) simulation.step();
  const nearbyMovement = simulation.nodes.flatMap((node, i) => {
    const original = before[i];
    return Math.abs(original.x - origin.x) < 204 && Math.abs(original.y - origin.y) < 102
      ? [Math.hypot(node.x - original.x, node.y - original.y)] : [];
  });
  assert.ok(Math.max(...nearbyMovement) >= 12, 'hover must be perceptible after cooldown');
  assert.deepEqual({ x: hub.x, y: hub.y }, origin, 'the link must stay under the mouse');
  for (const node of simulation.nodes) {
    for (const other of simulation.nodes) {
      if (node === other) continue;
      assert.ok(Math.abs(node.x - other.x) >= 160 || Math.abs(node.y - other.y) >= 58, `overlap: ${node.id}, ${other.id}`);
    }
  }
  hub.hovered = hub.fixed = false;
  simulation.reheat(.18);
  while (simulation.step()) {}
  assert.ok(hub.hoverAmount < .001, 'the cushion must fade away after leaving');
});
