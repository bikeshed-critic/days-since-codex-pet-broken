import { createSimulation, edgePath } from './graph-physics.mjs';

export function initGraph(svg, messages) {
  if (!svg) return null;
  const document = svg.ownerDocument;
  const window = document.defaultView;
  const controls = document.getElementById('graph-controls');
  const motion = document.getElementById('graph-motion');
  const reset = document.getElementById('graph-reset');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const elements = [...svg.querySelectorAll('[data-node-id]')];
  const paths = [...svg.querySelectorAll('[data-edge-type]')];
  const records = elements.map(element => {
    const rect = element.querySelector('rect');
    return { id: Number(element.dataset.nodeId), x: Number(rect.getAttribute('x')) + 80, y: Number(rect.getAttribute('y')) + 29 };
  });
  const edges = paths.map(element => ({ element, from: Number(element.dataset.edgeFrom), to: Number(element.dataset.edgeTo) }));
  const bounds = svg.viewBox.baseVal;
  const simulation = createSimulation(records, edges, bounds.width, bounds.height);
  const byId = new Map(simulation.nodes.map(node => [node.id, node]));
  let paused = false, hot = true, frame = null, lastTime = null, accumulated = 0;
  let visible = !window.IntersectionObserver, keyboardFocus = false, drag = null, suppressedClick = null;

  function draw() {
    elements.forEach((element, i) => {
      const node = simulation.nodes[i], original = records[i];
      element.setAttribute('transform', `translate(${(node.x - original.x).toFixed(2)} ${(node.y - original.y).toFixed(2)})`);
    });
    for (const edge of edges) edge.element.setAttribute('d', edgePath(byId.get(edge.from), byId.get(edge.to), edge.element.dataset.edgeType));
  }

  function highlightConnections(nodeId = null) {
    for (const edge of edges) {
      const dimmed = nodeId !== null && edge.from !== nodeId && edge.to !== nodeId;
      edge.element.classList[dimmed ? 'add' : 'remove']('edge-dimmed');
    }
  }

  function label() {
    motion.disabled = reduced.matches;
    motion.textContent = reduced.matches ? messages.graph_motion_reduced : paused || !hot ? messages.graph_motion_resume : messages.graph_motion_pause;
  }

  function stop() {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = lastTime = null;
    accumulated = 0;
  }

  function schedule() {
    label();
    if (frame === null && hot && !paused && !reduced.matches && visible && !document.hidden && !keyboardFocus) {
      frame = window.requestAnimationFrame(animate);
    }
  }

  function animate(time) {
    frame = null;
    accumulated += lastTime === null ? 1000 / 60 : Math.min(time - lastTime, 50);
    lastTime = time;
    while (accumulated >= 1000 / 60 && hot) {
      hot = simulation.step();
      accumulated -= 1000 / 60;
    }
    draw();
    if (!hot) stop();
    schedule();
  }

  function reheat(amount = .8) {
    simulation.reheat(amount);
    hot = true;
    schedule();
  }

  motion.addEventListener('click', () => {
    if (reduced.matches) return;
    if (!hot) { paused = false; reheat(); }
    else { paused = !paused; stop(); schedule(); }
  });
  reset.addEventListener('click', () => {
    cancelDrag();
    highlightConnections();
    stop();
    simulation.reset();
    hot = true;
    draw();
    schedule();
  });
  reduced.addEventListener('change', () => { stop(); schedule(); });
  document.addEventListener('visibilitychange', () => { stop(); schedule(); });
  svg.addEventListener('focusin', event => {
    keyboardFocus = event.target.matches(':focus-visible');
    if (keyboardFocus) stop();
  });
  svg.addEventListener('focusout', event => {
    if (!svg.contains(event.relatedTarget)) { keyboardFocus = false; schedule(); }
  });
  if (window.IntersectionObserver) {
    const observer = new window.IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      stop(); schedule();
    });
    observer.observe(svg);
  }

  function point(event) {
    const transform = svg.getScreenCTM();
    if (!transform) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    return point.matrixTransform(transform.inverse());
  }

  function cancelDrag() {
    if (!drag) return;
    const previous = drag;
    drag = null;
    previous.node.fixed = previous.node.hovered;
    previous.element.classList.remove('dragging');
    if (previous.element.hasPointerCapture(previous.pointerId)) previous.element.releasePointerCapture(previous.pointerId);
    if (previous.moved) {
      suppressedClick = previous.element;
      reheat();
    }
  }

  elements.forEach((element, i) => {
    const node = simulation.nodes[i];
    element.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse') return;
      highlightConnections(node.id);
      node.hovered = true;
      // Keep the link under the cursor while its neighbours make room.
      node.fixed = true;
      node.vx = node.vy = 0;
      reheat(.18);
    });
    element.addEventListener('pointerleave', () => {
      if (!node.hovered) return;
      highlightConnections();
      node.hovered = false;
      node.fixed = drag?.node === node;
      reheat(.18);
    });
    element.addEventListener('dragstart', event => event.preventDefault());
    element.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || drag) return;
      suppressedClick = null;
      const cursor = point(event);
      if (!cursor) return;
      node.fixed = true;
      node.vx = node.vy = 0;
      drag = { element, node, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, dx: node.x - cursor.x, dy: node.y - cursor.y, moved: false };
      element.setPointerCapture(event.pointerId);
    });
    element.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 5) return;
      const cursor = point(event);
      if (!cursor) return;
      event.preventDefault();
      drag.moved = true;
      element.classList.add('dragging');
      simulation.move(drag.node, cursor.x + drag.dx, cursor.y + drag.dy);
      draw();
      reheat();
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      element.addEventListener(name, event => {
        if (drag && event.pointerId === drag.pointerId) cancelDrag();
      });
    }
    element.addEventListener('click', event => {
      // Preserve ordinary clicks, modifier clicks, and keyboard link activation.
      if (suppressedClick === element && event.detail !== 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
      }
      suppressedClick = null;
    });
  });

  controls.hidden = false;
  document.getElementById('graph-interaction').hidden = false;
  svg.classList.add('force-graph');
  schedule();
  return {
    updateLinks() {
      simulation.setLinks(edges.filter(edge => !edge.element.hasAttribute('hidden')));
      reheat();
    },
  };
}
