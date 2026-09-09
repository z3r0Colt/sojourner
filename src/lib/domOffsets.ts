/** Character offset of (targetNode, targetOffset) relative to root's full text content. */
export function textOffsetWithin(root: Node, targetNode: Node, targetOffset: number): number {
  let total = 0;
  let found = false;
  function walk(node: Node): boolean {
    if (node === targetNode) {
      total += targetOffset;
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      total += node.textContent?.length ?? 0;
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  }
  found = walk(root);
  return found ? total : total;
}

export function closestWithAttr(node: Node | null, attr: string): HTMLElement | null {
  let el: Node | null = node;
  while (el) {
    if (el instanceof HTMLElement && el.hasAttribute(attr)) return el;
    el = el.parentNode;
  }
  return null;
}
