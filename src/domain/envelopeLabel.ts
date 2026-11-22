import type { Envelope } from './types';

/** Name of an envelope preceded by its emoji and a space (spec 0056, RG7); the name alone when it has none. */
export const envelopeLabel = (e: Pick<Envelope, 'name' | 'emoji'>): string => (e.emoji ? `${e.emoji} ${e.name}` : e.name);
