# Audio Plugin

**Package:** `@gwenjs/audio`
**Service key:** `audio` (`AudioService`)

Web Audio API wrapper with support for sound effects, music tracks, and per-channel volume control. Sounds are loaded once and keyed by an ID you define — no path strings scattered through game logic.

## Install

```bash
gwen add @gwenjs/audio
```

## Register

```typescript
// gwen.config.ts
import { defineConfig } from '@gwenjs/app';

export default defineConfig({
  modules: [['@gwenjs/audio', { masterVolume: 0.8 }]],
});
```

## Service API

### Loading sounds

| Method                   | Description                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `audio.preload(id, url)` | Fetch and decode an audio file. Returns a `Promise<void>`. Call during scene setup. |
| `audio.preloadAll(map)`  | Preload multiple sounds at once. `map` is `Record<string, string>` (id → url).      |

### Playback

| Method                     | Description                                                                   |
| -------------------------- | ----------------------------------------------------------------------------- |
| `audio.play(id, options?)` | Play a sound effect. Options: `{ volume?, pitch?, loop? }`. Returns a handle. |
| `audio.stop(id)`           | Stop all instances of a sound.                                                |
| `audio.pause(id)`          | Pause all instances of a sound.                                               |
| `audio.resume(id)`         | Resume a paused sound.                                                        |

### Music

Music is treated as a single, cross-fading track. Only one music track plays at a time.

| Method                           | Description                                                 |
| -------------------------------- | ----------------------------------------------------------- |
| `audio.playMusic(id, options?)`  | Start a music track. Fades out the previous one if any.     |
| `audio.stopMusic(fadeDuration?)` | Stop the current music track. Optional fade-out in seconds. |
| `audio.pauseMusic()`             | Pause current music.                                        |
| `audio.resumeMusic()`            | Resume paused music.                                        |

### Volume

| Method                     | Description                         |
| -------------------------- | ----------------------------------- |
| `audio.setMasterVolume(v)` | Set global volume (`0`–`1`).        |
| `audio.setMusicVolume(v)`  | Set music channel volume (`0`–`1`). |
| `audio.setSfxVolume(v)`    | Set SFX channel volume (`0`–`1`).   |
| `audio.getMasterVolume()`  | Returns current master volume.      |

## Options

| Option         | Type     | Default | Description                      |
| -------------- | -------- | ------- | -------------------------------- |
| `masterVolume` | `number` | `1.0`   | Initial master volume (`0`–`1`). |
| `musicVolume`  | `number` | `1.0`   | Initial music channel volume.    |
| `sfxVolume`    | `number` | `1.0`   | Initial SFX channel volume.      |

## Example

```typescript
import { defineSystem, useService, onUpdate } from '@gwenjs/core';
import { useScene } from '@gwenjs/core';

export const audioSystem = defineSystem(() => {
  const audio = useService('audio');

  // Preload during setup — resolves before the first frame
  useScene({
    async onEnter() {
      await audio.preloadAll({
        coin: '/sounds/coin.ogg',
        jump: '/sounds/jump.ogg',
        'bgm-level1': '/music/level1.ogg',
      });
      audio.playMusic('bgm-level1', { loop: true, volume: 0.6 });
    },
    onExit() {
      audio.stopMusic(0.5);
    },
  });
});

// In a separate system
export const coinSystem = defineSystem(() => {
  const audio = useService('audio');

  onUpdate(() => {
    if (playerPickedUpCoin()) {
      audio.play('coin', { volume: 0.9, pitch: 1.05 });
    }
  });
});
```

## Related

- [Input Plugin](/plugins/input) — trigger sounds on input events
- [Debug Plugin](/plugins/debug) — overlay to inspect active audio nodes during development
