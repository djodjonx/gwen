import { describe, expect, it } from 'vitest';
import * as queries from '../src/helpers-queries.ts';
import * as movement from '../src/helpers-movement.ts';
import * as contact from '../src/helpers-contact.ts';
import * as geometry from '../src/helpers-static-geometry.ts';
import * as orchestration from '../src/helpers-orchestration.ts';

describe('helpers domain entries', () => {
  it('should expose queries helpers', () => {
    expect(typeof queries.getBodySnapshot).toBe('function');
    expect(typeof queries.getSpeed).toBe('function');
    expect(typeof queries.isSensorActive).toBe('function');
  });

  it('should expose movement helpers', () => {
    expect(typeof movement.moveKinematicByVelocity).toBe('function');
    expect(typeof movement.applyDirectionalImpulse).toBe('function');
  });

  it('should expose contact helpers', () => {
    expect(typeof contact.selectContactsForEntity).toBe('function');
    expect(typeof contact.dedupeContactsByPair).toBe('function');
    expect(typeof contact.toResolvedContacts).toBe('function');
  });

  it('should expose static geometry helpers', () => {
    expect(typeof geometry.buildStaticGeometryChunk).toBe('function');
    expect(typeof geometry.loadStaticGeometryChunk).toBe('function');
  });

  it('should expose orchestration helpers', () => {
    expect(typeof orchestration.createTilemapChunkOrchestrator).toBe('function');
  });
});
