/**
 * Minimal safe-by-construction DOM builder shared by the UI modules: every
 * string ends up as textContent or an explicit attribute, never innerHTML,
 * since song data (titles, lyrics, labels) is untrusted imported content.
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (key === 'className') node.className = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key.startsWith('on') && typeof value === 'function') node[key] = value;
    else if (key === 'checked') node.checked = value;
    else node.setAttribute(key, value);
  });
  children.forEach((child) => node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child));
  return node;
}
