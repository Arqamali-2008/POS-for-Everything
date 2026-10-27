import { useEffect } from 'react';

const FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]):not([type="color"]):not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled]):not([type="button"]):not([type="reset"]):not([aria-label*="cancel" i]):not([aria-label*="close" i]):not([aria-label*="delete" i]):not([aria-label*="decrease" i]):not([aria-label*="increase" i])',
].join(',');

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isCancelButton(button: HTMLButtonElement): boolean {
  const label = `${button.textContent || ''} ${button.getAttribute('aria-label') || ''}`.trim().toLowerCase();
  return /^(cancel|close|back|dismiss|×)/i.test(label);
}

export function useEnterNavigation(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON' || target.tagName === 'SELECT') return;
      if (target instanceof HTMLInputElement) {
        const type = target.type.toLowerCase();
        if (['checkbox', 'radio', 'file', 'range', 'color', 'submit', 'button', 'reset'].includes(type)) return;
      }

      const scope =
        (target.closest('[data-enter-nav]') as HTMLElement | null) ??
        (target.closest('form') as HTMLElement | null);
      if (!scope) return;

      const controls = Array.from(scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter(
        (element) =>
          isVisible(element) &&
          !(element instanceof HTMLButtonElement && isCancelButton(element)) &&
          !(element instanceof HTMLButtonElement && element.closest('table')),
      );
      const index = controls.indexOf(target);
      if (index < 0) return;

      const next = controls.slice(index + 1).find((element) => isVisible(element));
      if (!next) return;

      event.preventDefault();

      if (next instanceof HTMLButtonElement) {
        next.click();
      } else {
        next.focus();
        if (next instanceof HTMLInputElement && next.type !== 'number' && next.type !== 'date') {
          next.select?.();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);
}
