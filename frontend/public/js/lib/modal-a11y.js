const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createModalFocusTrap(modalNode, options = {}) {
  if (!modalNode) {
    return {
      activate() {},
      deactivate() {},
      destroy() {},
    };
  }

  const onEscape = typeof options.onEscape === "function" ? options.onEscape : null;
  let previousFocused = null;
  let active = false;

  const handleKeydown = (event) => {
    if (!active) return;
    if (event.key === "Escape" && onEscape) {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = getFocusableElements(modalNode);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const focused = document.activeElement;

    if (event.shiftKey && focused === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && focused === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const activate = (activateOptions = {}) => {
    if (active) return;
    active = true;
    previousFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalNode.setAttribute("aria-modal", "true");
    modalNode.addEventListener("keydown", handleKeydown);

    const initialFocusNode =
      activateOptions.initialFocus ||
      modalNode.querySelector(activateOptions.initialSelector || "[data-modal-initial-focus]") ||
      getFocusableElements(modalNode)[0];
    if (initialFocusNode && typeof initialFocusNode.focus === "function") {
      initialFocusNode.focus();
    }
  };

  const deactivate = () => {
    if (!active) return;
    active = false;
    modalNode.removeEventListener("keydown", handleKeydown);
    modalNode.removeAttribute("aria-modal");
    if (previousFocused && typeof previousFocused.focus === "function") {
      previousFocused.focus();
    }
    previousFocused = null;
  };

  const destroy = () => {
    deactivate();
    modalNode.removeEventListener("keydown", handleKeydown);
  };

  return {
    activate,
    deactivate,
    destroy,
  };
}

function getFocusableElements(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((node) => {
    if (!(node instanceof HTMLElement)) return false;
    if (node.hasAttribute("hidden")) return false;
    if (node.getAttribute("aria-hidden") === "true") return false;
    return node.offsetParent !== null || node === document.activeElement;
  });
}
