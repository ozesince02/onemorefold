// Reordering habits (D-049): a calm list of names to drag into order. A row is picked up by its grip
// (or anywhere, with a mouse), follows the pointer, and the others make room; letting go saves the
// new order once. Pointer events, so it works with a mouse, a pen or a finger. The arrow buttons
// on each row do the same from a keyboard.

const GAP = 8; // matches .reorder-list's gap

export function wireReorder(root, onDrop) {
  let drag = null;

  root.addEventListener('pointerdown', (e) => {
    const item = e.target.closest('.reorder-item');
    if (!item || e.target.closest('button') || e.button > 0) return;
    // On touch, only the grip starts a drag, so the rest of the list still scrolls.
    if (e.pointerType !== 'mouse' && !e.target.closest('.reorder-grip')) return;
    e.preventDefault();
    const list = item.parentElement;
    const items = [...list.children];
    const top = list.getBoundingClientRect().top;
    drag = {
      item, list, items,
      // Each row's middle, relative to the list, as it was when picked up.
      mids: items.map((x) => { const r = x.getBoundingClientRect(); return r.top - top + r.height / 2; }),
      step: item.getBoundingClientRect().height + GAP,
      from: items.indexOf(item),
      to: items.indexOf(item),
      grab: e.clientY - item.getBoundingClientRect().top,
      startTop: item.getBoundingClientRect().top - top,
    };
    try { item.setPointerCapture(e.pointerId); } catch { /* not a live pointer: moves still reach the list */ }
    item.classList.add('is-dragging');
    list.classList.add('is-sorting');
  });

  root.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const top = drag.list.getBoundingClientRect().top;
    const y = e.clientY - top - drag.grab; // where the row's top is now, relative to the list
    drag.item.style.transform = `translateY(${y - drag.startTop}px)`;
    const mid = y + drag.step / 2 - GAP / 2;
    let to = drag.mids.filter((m, i) => i !== drag.from && m < mid).length;
    to = Math.max(0, Math.min(drag.items.length - 1, to));
    if (to !== drag.to) {
      drag.to = to;
      drag.items.forEach((x, i) => {
        if (x === drag.item) return;
        const shift = drag.from < to ? (i > drag.from && i <= to ? -drag.step : 0) : (i >= to && i < drag.from ? drag.step : 0);
        x.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    }
    // Near the window's edge, the page scrolls along.
    if (e.clientY < 60) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
  });

  const drop = () => {
    if (!drag) return;
    const { items, from, to, list } = drag;
    drag = null;
    items.forEach((x) => { x.style.transform = ''; x.classList.remove('is-dragging'); });
    list.classList.remove('is-sorting');
    if (from === to) return;
    const ids = items.map((x) => x.dataset.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    onDrop(ids);
  };
  root.addEventListener('pointerup', drop);
  root.addEventListener('pointercancel', drop);
}
