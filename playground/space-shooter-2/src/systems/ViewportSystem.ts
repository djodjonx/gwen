import { defineSystem } from '@djodjonx/gwen-engine-core';

export const ViewportSystem = defineSystem('ViewportSystem', () => {
  let onResize: (() => void) | null = null;

  return {
    onInit(api) {
      const renderer = api.services.get('renderer');

      const resizeToViewport = () => {
        renderer.resize(window.innerWidth, window.innerHeight);
      };

      // Apply full-page size immediately, then keep in sync with viewport changes.
      resizeToViewport();
      onResize = resizeToViewport;
      window.addEventListener('resize', onResize);
    },

    onDestroy() {
      if (onResize) window.removeEventListener('resize', onResize);
      onResize = null;
    },
  };
});
