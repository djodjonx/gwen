/**
 * GWEN TypeScript types and interfaces
 */

/** Entity ID */
export type EntityId = number;

/** Component definition */
export interface Component {
  name: string;
  [key: string]: unknown;
}

/** Engine API */
export interface EngineAPI {
  createEntity(): EntityId;
  deleteEntity(id: EntityId): void;
  query(components: string[]): EntityId[];
  update(deltaTime: number): void;
}

/** Plugin interface for TypeScript plugins */
export interface TsPlugin {
  name: string;
  onInit?(api: EngineAPI): void;
  onUpdate(api: EngineAPI, deltaTime: number): void;
  onCleanup?(): void;
}

