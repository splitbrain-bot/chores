import { computeNeed, type NeedContext } from './need.ts';
import { blocks, type PossibleContext } from './possible.ts';
import type { Chore, ChoreWithNeed, Settings, Suggestion } from './types.ts';

/**
 * Computes the need level and the filter result of every chore.
 *
 * @param chores the chores
 * @param needCtx the need context
 * @param possibleCtx the filter context
 */
export function evaluateChores(chores: readonly Chore[], needCtx: NeedContext, possibleCtx: PossibleContext): ChoreWithNeed[] {
    return chores.map((chore) => {
        const n = computeNeed(chore, needCtx);
        const blockedBy = blocks(chore, n.need, n.urgent, possibleCtx);
        return {
            ...chore,
            need: n.need,
            elapsed: n.elapsed,
            elapsedUnit: n.unit,
            urgent: n.urgent,
            possible: blockedBy.length === 0,
            blockedBy,
            reason: n.reason,
        };
    });
}

/**
 * Tells if a chore of a group can be done together with the main chore. The capacity and the need threshold do not
 * apply to these chores.
 *
 * @param chore the evaluated chore
 * @param settings the settings
 */
function alsoPossible(chore: ChoreWithNeed, settings: Settings): boolean {
    return chore.need >= settings.also_threshold && chore.blockedBy.every((b) => b === 'capacity' || b === 'need');
}

/**
 * Selects the suggestions from the evaluated chores.
 *
 * @param evaluated chores with their need level and filter result
 * @param settings the settings
 * @returns the best groups, highest need first
 */
export function selectSuggestions(evaluated: readonly ChoreWithNeed[], settings: Settings): Suggestion[] {
    const groups = new Map<string, ChoreWithNeed[]>();
    for (const chore of evaluated) {
        const key = chore.groupKey ?? `#${chore.id}`;
        const list = groups.get(key) ?? [];
        list.push(chore);
        groups.set(key, list);
    }

    const suggestions: Suggestion[] = [];
    for (const members of groups.values()) {
        const main = members.filter((c) => c.possible).sort((a, b) => b.need - a.need)[0];
        if (!main) continue;
        const also = members
            .filter((c) => c !== main && alsoPossible(c, settings))
            .sort((a, b) => b.need - a.need);
        suggestions.push({ chore: main, also, need: main.need, reason: main.reason });
    }

    return suggestions.sort((a, b) => b.need - a.need).slice(0, settings.suggestion_count);
}
