import type {
    Capacity, Category, ChoreEvent, ChoreWithNeed, Hint, Person, PresenceState, Settings, Suggestion,
} from '../../src/core/types.ts';
import type { ConditionStatus } from '../../src/service/conditions.ts';

export type { Capacity, Category, ChoreEvent, ChoreWithNeed, ConditionStatus, Hint, Person, Settings, Suggestion };

/** Presence of a person with the name. */
export interface PersonPresence extends PresenceState {
    name: string;
}

/** Identity of the stored token. */
export interface Me {
    kind: 'person' | 'shared' | 'mcp';
    person?: Person;
}

/** Response of the suggestions endpoint. */
export interface SuggestionsResponse {
    suggestions: Suggestion[];
    capacity: Capacity;
    nextSlotAt: number | null;
    presence: PersonPresence[];
    hints: Hint[];
}

/** A token without its hash. */
export interface Token {
    id: number;
    kind: 'person' | 'shared' | 'mcp';
    personId: number | null;
    label: string;
    createdAt: number;
    lastUsedAt: number | null;
    revokedAt: number | null;
}
