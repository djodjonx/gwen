---
name: gwen-audio
description: Expert skill for managing asset-based audio systems, playback control, and Web Audio API lifecycle handling.
---

# Audio Expert Skill

## Context
GWEN Audio abstracts the Web Audio API. It handles asset preloading (buffer decoding) and playback instances (multiple simultaneous voices per asset).

## Instructions

### 1. Advanced Preloading
Sounds must be pre-decoded for low-latency playback.
```typescript
const audio = api.services.get('audio');
// Returns a promise that resolves when the sound is ready.
await audio.preload('shoot', '/assets/sfx/shoot.wav');
// Or manual buffer injection (useful for procedurally generated audio)
audio.preloadBuffer('pulse', decodedAudioBuffer);
```

### 2. Voice Control (`AudioService` API)
- `play(id, options)`: Returns an `AudioBufferSourceNode` for direct control.
  - Options: `volume` (0..1), `pitch` (playback speed), `loop` (bool).
- `stop(id)`: Stops **all** currently playing instances of this asset.
- `stopAll()`: Emergency stop for all sounds.

### 3. Master Management
- `setMasterVolume(volume)`: Updates the global gain node (0 to 1).
- `getContext()`: Access the raw `AudioContext` for custom processing (e.g., analyzers, custom effects).

### 4. Browser Interop
The AudioContext starts `suspended`. It resumes automatically on the first user input (handled by `InputPlugin` if present). Use `audio.getContext().resume()` if managing custom UI.

## Available Resources
- `packages/@gwenjs/plugin-audio/src/index.ts`: The `AudioService` interface and gain node logic.

## Constraints
- **Race Condition**: `play()` will warn and fail if the asset has not been `preload()`ed successfully.
- **Resource Management**: Each `play()` creates a new node that is cleaned up when it ends. For high-frequency sounds, ensure they are short to prevent node accumulation.
