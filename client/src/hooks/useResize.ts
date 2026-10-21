import type { ElementRef } from '../lib/teact/teact';
import { beginHeavyAnimation, useLayoutEffect } from '../lib/teact/teact';

import { requestMutation } from '../lib/fasterdom/fasterdom';
import { getIsLeftColumnCollapsed, setIsLeftColumnCollapsed } from '../util/leftColumnCollapsed';
import useLastCallback from './useLastCallback';

const DEFAULT_NORMAL_WIDTH = 432; // 27rem
const MIN_EXPANDED_WIDTH = 260; // 16.25rem
const MAX_EXPANDED_WIDTH = 560; // 35rem
const COLLAPSE_THRESHOLD = 170;

export function useResize(
  elementRef: ElementRef<HTMLElement>,
  onResize: (width: number) => void,
  onReset: NoneToVoidFunction,
  initialWidth?: number,
  cssPropertyName?: string,
) {
  const setElementStyle = useLastCallback((width?: number) => {
    requestMutation(() => {
      if (!elementRef.current) {
        return;
      }

      const isCollapsed = getIsLeftColumnCollapsed();
      const isProfileOpen = typeof document !== 'undefined' && Boolean(
        document.getElementById('Main')?.classList.contains('right-column-open')
        && !document.getElementById('Main')?.classList.contains('right-column-closing')
      );
      const widthPx = width ? `${width}px` : '';

      elementRef.current.style.width = widthPx;
      elementRef.current.style.minWidth = isCollapsed ? '4.25rem' : `${MIN_EXPANDED_WIDTH}px`;
      elementRef.current.style.maxWidth = isProfileOpen ? '23rem' : '30rem';

      if (cssPropertyName && widthPx) {
        elementRef.current.style.setProperty(cssPropertyName, widthPx);
        document.documentElement.style.setProperty(cssPropertyName, widthPx);
      }
    });
  });

  useLayoutEffect(() => {
    if (!elementRef.current) {
      return;
    }

    const isCollapsed = getIsLeftColumnCollapsed();
    const isChatList = typeof document !== 'undefined'
      && document.documentElement.getAttribute('data-left-column-is-chat-list') !== 'false';

    if (isCollapsed && isChatList) {
      setElementStyle(68);
      return;
    }

    const isProfileOpen = typeof document !== 'undefined' && Boolean(
      document.getElementById('Main')?.classList.contains('right-column-open')
      && !document.getElementById('Main')?.classList.contains('right-column-closing')
    );
    const rem = (typeof document !== 'undefined' && parseFloat(getComputedStyle(document.documentElement).fontSize)) || 16;
    const maxExpandedWidth = isProfileOpen ? Math.round(23 * rem) : Math.round(30 * rem);

    const saved = typeof document !== 'undefined'
      ? parseFloat(document.documentElement.style.getPropertyValue('--saved-left-column-width'))
      : NaN;
    const rawTargetWidth = (initialWidth && initialWidth >= MIN_EXPANDED_WIDTH)
      ? initialWidth
      : ((saved && saved >= MIN_EXPANDED_WIDTH) ? saved : (isProfileOpen ? maxExpandedWidth : DEFAULT_NORMAL_WIDTH));
    const targetWidth = Math.min(maxExpandedWidth, rawTargetWidth);

    elementRef.current.style.minWidth = `${MIN_EXPANDED_WIDTH}px`;
    elementRef.current.style.maxWidth = isProfileOpen ? '23rem' : '30rem';

    const widthPx = `${targetWidth}px`;
    elementRef.current.style.width = widthPx;
    if (cssPropertyName) {
      elementRef.current.style.setProperty(cssPropertyName, widthPx);
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty(cssPropertyName, widthPx);
        document.documentElement.style.setProperty('--saved-left-column-width', widthPx);
      }
    }
  }, [cssPropertyName, elementRef, initialWidth, setElementStyle]);

  function handleMouseUp() {
    document.body.classList.remove('cursor-ew-resize', 'is-resizing-left-column');
    document.documentElement.classList.remove('is-resizing-left-column', 'left-column-is-collapsed');
  }

  function initResize(e: React.MouseEvent<HTMLElement, MouseEvent>) {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const isInitiallyCollapsed = getIsLeftColumnCollapsed();
    const isProfileOpen = typeof document !== 'undefined' && Boolean(
      document.getElementById('Main')?.classList.contains('right-column-open')
      && !document.getElementById('Main')?.classList.contains('right-column-closing')
    );
    const rem = (typeof document !== 'undefined' && parseFloat(getComputedStyle(document.documentElement).fontSize)) || 16;
    const maxExpandedWidth = isProfileOpen ? Math.round(23 * rem) : Math.round(30 * rem);

    const saved = parseFloat(document.documentElement.style.getPropertyValue('--saved-left-column-width'));
    const savedLeftWidth = (saved && saved >= MIN_EXPANDED_WIDTH && saved <= maxExpandedWidth)
      ? saved
      : ((initialWidth && initialWidth >= MIN_EXPANDED_WIDTH && initialWidth <= maxExpandedWidth) ? initialWidth : (isProfileOpen ? maxExpandedWidth : DEFAULT_NORMAL_WIDTH));
    const startWidth = isInitiallyCollapsed ? 68 : (elementRef.current?.offsetWidth || (isProfileOpen ? maxExpandedWidth : DEFAULT_NORMAL_WIDTH));

    const isChatList = typeof document !== 'undefined'
      && document.documentElement.getAttribute('data-left-column-is-chat-list') !== 'false';

    let isCurrentlyCollapsed = isChatList && isInitiallyCollapsed;
    let hasMoved = false;
    let latestWidth = startWidth;

    // Immediately unlock minWidth and maxWidth on element and root so resize is never clamped
    if (elementRef.current) {
      elementRef.current.style.minWidth = isChatList ? '4.25rem' : `${MIN_EXPANDED_WIDTH}px`;
      elementRef.current.style.maxWidth = `${maxExpandedWidth}px`;
      elementRef.current.style.flexShrink = '0';
      elementRef.current.style.flexGrow = '0';
    }
    document.documentElement.style.setProperty('--left-column-min-width', isChatList ? '4.25rem' : `${MIN_EXPANDED_WIDTH}px`);
    document.documentElement.style.setProperty('--left-column-max-width', `${maxExpandedWidth}px`);

    document.body.classList.add('cursor-ew-resize', 'is-resizing-left-column');
    document.documentElement.classList.add('is-resizing-left-column');

    let isRafScheduled = false;
    let latestMouseX = startX;

    const updateFrame = () => {
      isRafScheduled = false;
      const delta = latestMouseX - startX;
      const rawWidth = Math.ceil(startWidth + delta);

      if (!isChatList) {
        const visualWidth = Math.min(maxExpandedWidth, Math.max(MIN_EXPANDED_WIDTH, rawWidth));
        latestWidth = visualWidth;
        const widthPx = `${visualWidth}px`;
        if (elementRef.current) {
          elementRef.current.style.width = widthPx;
          elementRef.current.style.flexBasis = widthPx;
          elementRef.current.style.setProperty('--left-column-width', widthPx);
        }
        return;
      }

      const COLLAPSE_SWITCH_THRESHOLD = COLLAPSE_THRESHOLD;
      const HYSTERESIS = 10;

      if (isCurrentlyCollapsed) {
        if (rawWidth >= COLLAPSE_SWITCH_THRESHOLD + HYSTERESIS) {
          isCurrentlyCollapsed = false;
        }
      } else if (rawWidth < COLLAPSE_SWITCH_THRESHOLD - HYSTERESIS) {
        isCurrentlyCollapsed = true;
      }

      if (isCurrentlyCollapsed) {
        if (!elementRef.current?.classList.contains('is-collapsed')) {
          elementRef.current?.classList.add('is-collapsed');
          document.documentElement.classList.add('left-column-is-collapsed');
        }
      } else if (elementRef.current?.classList.contains('is-collapsed')) {
        elementRef.current?.classList.remove('is-collapsed');
        document.documentElement.classList.remove('left-column-is-collapsed');
      }

      const visualWidth = Math.min(maxExpandedWidth, Math.max(68, rawWidth));

      latestWidth = visualWidth;
      const widthPx = `${visualWidth}px`;
      if (elementRef.current) {
        elementRef.current.style.width = widthPx;
        elementRef.current.style.flexBasis = widthPx;
        elementRef.current.style.setProperty('--left-column-width', widthPx);
      }
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      latestMouseX = moveEvent.clientX;
      const delta = latestMouseX - startX;
      if (Math.abs(delta) > 3) {
        hasMoved = true;
      }

      if (!isRafScheduled) {
        isRafScheduled = true;
        requestAnimationFrame(updateFrame);
      }
    };

    const stopDrag = () => {
      isRafScheduled = false;
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('mouseup', stopDrag, true);
      window.removeEventListener('blur', stopDrag, true);

      handleMouseUp();

      if (!isChatList) {
        const finalWidth = Math.min(maxExpandedWidth, Math.max(MIN_EXPANDED_WIDTH, latestWidth));
        document.documentElement.style.setProperty('--saved-left-column-width', `${finalWidth}px`);
        document.documentElement.style.setProperty('--left-column-width', `${finalWidth}px`);
        setIsLeftColumnCollapsed(false);
        setElementStyle(finalWidth);
        onResize(finalWidth);
        return;
      }

      // If clicked without dragging while collapsed (or minimal mouse movement), immediately expand to saved width with smooth animation!
      if ((!hasMoved || Math.abs(latestMouseX - startX) < 15) && isInitiallyCollapsed) {
        document.body.classList.add('is-animating-left-column');
        document.documentElement.classList.add('is-animating-left-column');
        const endHeavy = beginHeavyAnimation(350);

        elementRef.current?.classList.remove('is-collapsed');
        document.documentElement.classList.remove('left-column-is-collapsed');
        const normalWidth = Math.min(maxExpandedWidth, Math.max(MIN_EXPANDED_WIDTH, savedLeftWidth));
        document.documentElement.style.setProperty('--saved-left-column-width', `${normalWidth}px`);
        document.documentElement.style.setProperty('--left-column-width', `${normalWidth}px`);
        setIsLeftColumnCollapsed(false);
        setElementStyle(normalWidth);
        onResize(normalWidth);

        setTimeout(() => {
          document.body.classList.remove('is-animating-left-column');
          document.documentElement.classList.remove('is-animating-left-column');
          endHeavy();
        }, 330);
        return;
      }

      if (isCurrentlyCollapsed || latestWidth < COLLAPSE_THRESHOLD) {
        document.body.classList.add('is-animating-left-column');
        document.documentElement.classList.add('is-animating-left-column');
        const endHeavy = beginHeavyAnimation(350);

        elementRef.current?.classList.add('is-collapsed');
        document.documentElement.classList.add('left-column-is-collapsed');
        setIsLeftColumnCollapsed(true, true);
        document.documentElement.style.setProperty('--left-column-width', '4.25rem');
        setElementStyle(68);
        onResize(68);

        setTimeout(() => {
          document.body.classList.remove('is-animating-left-column');
          document.documentElement.classList.remove('is-animating-left-column');
          endHeavy();
        }, 330);
      } else {
        const finalWidth = Math.min(maxExpandedWidth, Math.max(MIN_EXPANDED_WIDTH, latestWidth));
        const shouldAnimateExpand = latestWidth < MIN_EXPANDED_WIDTH;

        if (shouldAnimateExpand) {
          document.body.classList.add('is-animating-left-column');
          document.documentElement.classList.add('is-animating-left-column');
        }

        elementRef.current?.classList.remove('is-collapsed');
        document.documentElement.classList.remove('left-column-is-collapsed');
        document.documentElement.style.setProperty('--saved-left-column-width', `${finalWidth}px`);
        document.documentElement.style.setProperty('--left-column-width', `${finalWidth}px`);
        setIsLeftColumnCollapsed(false, true);
        setElementStyle(finalWidth);
        onResize(finalWidth);

        if (shouldAnimateExpand) {
          setTimeout(() => {
            document.body.classList.remove('is-animating-left-column');
            document.documentElement.classList.remove('is-animating-left-column');
          }, 330);
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('mouseup', stopDrag, true);
    window.addEventListener('blur', stopDrag, true);
  }

  function resetResize(e: React.MouseEvent<HTMLElement, MouseEvent>) {
    e.preventDefault();
    setIsLeftColumnCollapsed(false);
    if (elementRef.current) {
      elementRef.current.style.removeProperty('min-width');
      elementRef.current.style.removeProperty('max-width');
      elementRef.current.style.removeProperty('--left-column-min-width');
      elementRef.current.style.removeProperty('--left-column-max-width');
    }
    document.documentElement.style.removeProperty('--left-column-min-width');
    document.documentElement.style.removeProperty('--left-column-max-width');
    setElementStyle(undefined);
    if (cssPropertyName) {
      document.documentElement.style.removeProperty(cssPropertyName);
      document.documentElement.style.removeProperty('--saved-left-column-width');
    }
    onReset();
  }

  return { initResize, resetResize, handleMouseUp };
}
