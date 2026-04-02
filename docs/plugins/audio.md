# Audio Plugin

Package: `@gwenjs/audio`

Web Audio service for SFX and music playback.

## Install

```bash
pnpm add @gwenjs/audio
```

## Register

```ts
import { defineConfig } from '@gwenjs/kit';
import { AudioPlugin } from '@gwenjs/audio';

export default defineConfig({
  plugins: [AudioPlugin({ masterVolume: 0.8 })],
});
```

## API

Main export:
- `AudioPlugin(config?)`

Service provided:
- `audio`

`AudioService` methods:
- `preload(id, url)`
- `preloadBuffer(id, buffer)`
- `play(id, options?)`
- `stop(id)`
- `stopAll()`
- `setMasterVolume(volume)`
- `getMasterVolume()`
- `isLoaded(id)`
- `getContext()`

`SoundOptions`:
- `volume?: number`
- `pitch?: number`
- `loop?: boolean`

## Example

```ts
const audio = api.services.get('audio');

await audio.preload('laser', '/sounds/laser.wav');
audio.play('laser', { volume: 0.6, pitch: 1.1 });
```

## Source

- `packages/audio/src/index.ts`
