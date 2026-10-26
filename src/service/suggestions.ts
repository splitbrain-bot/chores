import { selectSuggestions } from '../core/select.ts';
import type { Capacity, Hint, Suggestion, Viewer } from '../core/types.ts';
import type { Deps } from './deps.ts';
import { evaluate } from './evaluate.ts';
import { getLookahead } from './lookahead.ts';
import { listPresence, type PersonPresence } from './presence.ts';

/** Number of look-ahead hints on the suggestions screen. */
const HINT_COUNT = 3;

/** The data of the suggestions screen. */
export interface SuggestionsResult {
    suggestions: Suggestion[];
    /** Capacity of the viewer. The shared device gets the largest values of the persons at home. */
    capacity: Capacity;
    /** Start of the next capacity slot when the viewer has no capacity now. */
    nextSlotAt: number | null;
    presence: PersonPresence[];
    hints: Hint[];
    /** Seconds in which the app offers the tap "necessary earlier" after a done tap. */
    earlierWindowSeconds: number;
}

/**
 * Returns the suggestions for a viewer.
 *
 * @param deps the dependencies
 * @param viewer the viewer
 */
export async function getSuggestions(deps: Deps, viewer: Viewer): Promise<SuggestionsResult> {
    const { state, chores } = await evaluate(deps, viewer);
    const suggestions = selectSuggestions(chores, state.settings);

    let capacity: Capacity = { minutes: 0, energy: 0 };
    if (viewer.kind === 'person') {
        capacity = state.capacities.get(viewer.personId)?.capacity ?? capacity;
    } else {
        for (const [id, c] of state.capacities) {
            if (!state.presence.get(id)?.home) continue;
            capacity = {
                minutes: Math.max(capacity.minutes, c.capacity.minutes),
                energy: Math.max(capacity.energy, c.capacity.energy),
            };
        }
    }

    const { hints } = await getLookahead(deps);
    return {
        suggestions,
        capacity,
        nextSlotAt: capacity.minutes === 0 ? state.nextSlotAt : null,
        presence: await listPresence(deps),
        hints: hints.slice(0, HINT_COUNT),
        earlierWindowSeconds: state.settings.earlier_window_seconds,
    };
}
