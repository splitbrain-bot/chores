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
            urgent: n.urgent,
            possible: blockedBy.length === 0,
            blockedBy,
            reason: n.reason,
        };
    });
}

/**
 * Compares two evaluated chores: the higher need first, then the longer elapsed time.
 *
 * @param a the first chore
 * @param b the second chore
 */
export function byNeed(a: ChoreWithNeed, b: ChoreWithNeed): number {
    return b.need - a.need || b.elapsed - a.elapsed;
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
 * Selects the suggestions from the evaluated chores. Chores with the same name form a group with one suggestion.
 * At most one one-time task is in the suggestions while a recurring chore is possible.
 *
 * @param evaluated chores with their need level and filter result
 * @param settings the settings
 * @returns the best groups, highest need first
 */
export function selectSuggestions(evaluated: readonly ChoreWithNeed[], settings: Settings): Suggestion[] {
    const groups = new Map<string, ChoreWithNeed[]>();
    for (const chore of evaluated) {
        const list = groups.get(chore.name) ?? [];
        list.push(chore);
        groups.set(chore.name, list);
    }

    const suggestions: Suggestion[] = [];
    for (const members of groups.values()) {
        const main = members.filter((c) => c.possible).sort(byNeed)[0];
        if (!main) continue;
        const also = members.filter((c) => c !== main && alsoPossible(c, settings)).sort(byNeed);
        suggestions.push({ chore: main, also, need: main.need, reason: main.reason });
    }
    suggestions.sort((a, b) => byNeed(a.chore, b.chore));

    const hasRecurring = suggestions.some((s) => s.chore.kind === 'recurring');
    const result: Suggestion[] = [];
    let oneTime = 0;
    for (const s of suggestions) {
        if (result.length >= settings.suggestion_count) break;
        if (s.chore.kind === 'one_time' && hasRecurring && oneTime >= 1) continue;
        if (s.chore.kind === 'one_time') oneTime++;
        result.push(s);
    }
    return result;
}
