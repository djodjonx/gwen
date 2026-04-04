/**
 * @file Composables for @gwenjs/input.
 *
 * Must be called inside an active engine context:
 * inside `defineSystem()`, `engine.run(fn)`, or a plugin lifecycle hook.
 */

import { useEngine, GwenPluginNotFoundError } from '@gwenjs/core';
import type { KeyboardInput } from './plugin/keyboard';
import type { MouseInput } from './plugin/mouse';
import type { GamepadInput } from './plugin/gamepad';
import type { InputMapper } from './plugin/mapping/InputMapper';
import './augment';

/**
 * Returns the keyboard input service registered by `InputPlugin()`.
 *
 * @throws {GwenPluginNotFoundError} If `InputPlugin()` is not registered.
 */
export function useKeyboard(): KeyboardInput {
  const engine = useEngine();
  const service = engine.tryInject('keyboard');
  if (service) return service;
  throw new GwenPluginNotFoundError({
    pluginName: '@gwenjs/input',
    hint: 'Call engine.use(InputPlugin()) before starting the engine.',
    docsUrl: 'https://gwenengine.dev/plugins/input',
  });
}

/**
 * Returns the mouse input service registered by `InputPlugin()`.
 *
 * @throws {GwenPluginNotFoundError} If `InputPlugin()` is not registered.
 */
export function useMouse(): MouseInput {
  const engine = useEngine();
  const service = engine.tryInject('mouse');
  if (service) return service;
  throw new GwenPluginNotFoundError({
    pluginName: '@gwenjs/input',
    hint: 'Call engine.use(InputPlugin()) before starting the engine.',
    docsUrl: 'https://gwenengine.dev/plugins/input',
  });
}

/**
 * Returns the gamepad input service registered by `InputPlugin()`.
 *
 * @throws {GwenPluginNotFoundError} If `InputPlugin()` is not registered.
 */
export function useGamepad(): GamepadInput {
  const engine = useEngine();
  const service = engine.tryInject('gamepad');
  if (service) return service;
  throw new GwenPluginNotFoundError({
    pluginName: '@gwenjs/input',
    hint: 'Call engine.use(InputPlugin()) before starting the engine.',
    docsUrl: 'https://gwenengine.dev/plugins/input',
  });
}

/**
 * Returns the input mapper service (only available when `actionMap` config is set).
 *
 * @throws {GwenPluginNotFoundError} If `InputPlugin()` is not registered or `actionMap` was not provided.
 */
export function useInputMapper(): InputMapper {
  const engine = useEngine();
  const service = engine.tryInject('inputMapper');
  if (service) return service;
  throw new GwenPluginNotFoundError({
    pluginName: '@gwenjs/input',
    hint: 'Call engine.use(InputPlugin({ actionMap: ... })) with an actionMap to enable the input mapper.',
    docsUrl: 'https://gwenengine.dev/plugins/input#action-map',
  });
}
