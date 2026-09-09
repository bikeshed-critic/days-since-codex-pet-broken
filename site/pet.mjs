export function initPet(pet) {
  if (!pet) return;
  const viewport = pet.ownerDocument.defaultView;
  let drag = null;
  let moved = false;

  function place(x, y) {
    const { width, height } = pet.getBoundingClientRect();
    const root = pet.ownerDocument.documentElement;
    pet.style.left = `${Math.max(0, Math.min(x, root.clientWidth - width))}px`;
    pet.style.top = `${Math.max(0, Math.min(y, root.clientHeight - height))}px`;
    pet.style.right = 'auto';
    pet.style.bottom = 'auto';
    moved = true;
  }

  pet.disabled = false;
  pet.removeAttribute('aria-hidden');
  pet.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || drag) return;
    const rect = pet.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
    pet.setPointerCapture(event.pointerId);
    pet.classList.add('dragging');
  });
  pet.addEventListener('pointermove', event => {
    if (event.pointerId !== drag?.id) return;
    place(event.clientX - drag.x, event.clientY - drag.y);
  });
  function release(event) {
    if (event.pointerId !== drag?.id) return;
    drag = null;
    pet.classList.remove('dragging');
    if (pet.hasPointerCapture(event.pointerId)) pet.releasePointerCapture(event.pointerId);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) pet.addEventListener(type, release);
  pet.addEventListener('keydown', event => {
    if (drag) return;
    if (event.key === 'Home') {
      event.preventDefault();
      for (const property of ['left', 'top', 'right', 'bottom']) pet.style.removeProperty(property);
      moved = false;
      return;
    }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    const rect = pet.getBoundingClientRect();
    const step = event.shiftKey ? 40 : 10;
    place(rect.left + direction[0] * step, rect.top + direction[1] * step);
  });
  viewport.addEventListener('resize', () => {
    if (!moved) return;
    const rect = pet.getBoundingClientRect();
    place(rect.left, rect.top);
  });
}
