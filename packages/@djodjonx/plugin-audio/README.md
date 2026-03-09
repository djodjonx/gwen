# @djodjonx/gwen-plugin-audio

**GWEN Audio Plugin — Web Audio API integration**

Manage sound effects, background music, and audio playback in your GWEN game.

## Installation

```bash
npm install @djodjonx/gwen-plugin-audio
```

## Quick Start

### Register the Plugin

```typescript
// gwen.config.ts
import { defineConfig } from '@djodjonx/gwen-kit';
import { AudioPlugin } from '@djodjonx/gwen-plugin-audio';

export default defineConfig({
  plugins: [new AudioPlugin({ masterVolume: 0.8 })],
});
```

### Preload and Play Sounds

```typescript
import type { EngineAPI } from '@djodjonx/gwen-engine-core';

export function createAudioSystem(api: EngineAPI) {
  const audio = api.services.get('audio');

  // Preload sounds
  audio.preload('jump', '/sounds/jump.wav');
  audio.preload('coin', '/sounds/coin.wav');
  audio.preload('music', '/sounds/background.mp3');

  // Play a sound effect
  audio.play('jump');

  // Play looping background music
  audio.play('music', { loop: true, volume: 0.5 });
}
```

## API Reference

### `AudioPlugin(config?)`

Creates an audio plugin instance.

**Options:**

- `masterVolume?: number` — Global volume multiplier (0-1, default: 1)

### `preload(name: string, url: string)`

Preload a sound file for later playback.

- `name` — Identifier for the sound
- `url` — Path to audio file (WAV, MP3, etc.)

### `play(name: string, options?)`

Play a preloaded sound.

**Options:**

- `volume?: number` — Volume multiplier (0-1)
- `pitch?: number` — Playback rate/pitch
- `loop?: boolean` — Loop the sound

### `stop(name: string)`

Stop all instances of a playing sound.

### `setMasterVolume(volume: number)`

Change the global master volume.

## Examples

### Background Music with Controls

```typescript
const audio = api.services.get('audio');

// Start music
audio.preload('bgm', '/music/theme.mp3');
audio.play('bgm', { loop: true, volume: 0.3 });

// Later, stop it
audio.stop('bgm');
```

### Sound Effects with Variations

```typescript
// Preload multiple hit sounds
audio.preload('hit1', '/sfx/hit1.wav');
audio.preload('hit2', '/sfx/hit2.wav');
audio.preload('hit3', '/sfx/hit3.wav');

// Play a random one on collision
const hits = ['hit1', 'hit2', 'hit3'];
const random = hits[Math.floor(Math.random() * hits.length)];
audio.play(random, { pitch: 0.8 + Math.random() * 0.4 });
```

## Browser Compatibility

Uses the Web Audio API. Supported in all modern browsers:

- Chrome/Edge 14+
- Firefox 25+
- Safari 6+

## See Also

- [@djodjonx/gwen-engine-core](../engine-core/) — Core engine
- [@djodjonx/gwen-plugin-input](../plugin-input/) — Input handling
- [@djodjonx/gwen-plugin-debug](../plugin-debug/) — Debug overlay
