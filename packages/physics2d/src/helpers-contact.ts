// Tree-shakable contact helpers entry.
export {
  selectContactsForEntityId,
  dedupeContactsByPair,
  toResolvedContacts,
  selectResolvedContactsForEntityId,
  getEntityCollisionContacts,
} from './helpers/contact.js';
export type { ResolvedCollisionContact } from './types.js';
