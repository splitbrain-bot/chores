import { inSeason, isQuietDay, localParts } from './time.ts';
import { HOUR, type BlockCode, type Capacity, type Chore, type PresenceState, type Settings, type Viewer } from './types.ts';

/** Data that the filters depend on, besides the chore. */
export interface PossibleContext {
    now: number;
    settings: Settings;
    viewer: Viewer;
    /** Ids of all persons. */
    personIds: readonly number[];
    presence: ReadonlyMap<number, PresenceState>;
    capacities: ReadonlyMap<number, Capacity>;
    holidays: ReadonlySet<string>;
}

/**
 * Returns the candidate persons of a chore. An empty list on the chore means every person.
 *
 * @param chore the chore
 * @param personIds ids of all persons
 */
export function candidates(chore: Chore, personIds: readonly number[]): number[] {
    return chore.personIds.length > 0 ? chore.personIds : [...personIds];
}

/**
 * Tells if the absence of a person is long: away for more than the handover hours or farther away than the handover
 * distance.
 *
 * @param p presence of the person
 * @param now milliseconds since the epoch
 * @param settings the settings
 */
export function longAbsence(p: PresenceState | undefined, now: number, settings: Settings): boolean {
    if (!p || p.home) return false;
    if (p.since !== null && now - p.since > settings.handover_after_hours * HOUR) return true;
    return p.distanceKm !== null && p.distanceKm > settings.handover_distance_km;
}

/**
 * Tells if another person takes over a chore because all candidate persons are away for a long time.
 *
 * @param chore the chore
 * @param ctx the filter context
 */
export function handover(chore: Chore, ctx: PossibleContext): boolean {
    if (chore.assignment !== 'any' || chore.personIds.length === 0) return false;
    if (chore.importance !== 'important' && chore.importance !== 'critical') return false;
    return chore.personIds.every((id) => longAbsence(ctx.presence.get(id), ctx.now, ctx.settings));
}

/**
 * Returns the persons who can do a chore now for the viewer, or an empty list when the person rule fails.
 *
 * @param chore the chore
 * @param ctx the filter context
 */
export function doers(chore: Chore, ctx: PossibleContext): number[] {
    const s = candidates(chore, ctx.personIds);
    const home = (id: number) => ctx.presence.get(id)?.home === true;
    const h = ctx.personIds.filter(home);

    if (chore.assignment === 'all') {
        if (!s.every(home)) return [];
        if (ctx.viewer.kind === 'shared') return s;
        return s.includes(ctx.viewer.personId) ? [ctx.viewer.personId] : [];
    }

    const sh = s.filter(home);
    const viewer = ctx.viewer;
    if (viewer.kind === 'shared') {
        if (sh.length > 0) return sh;
        return handover(chore, ctx) ? h : [];
    }
    if (!home(viewer.personId)) return [];
    if (sh.includes(viewer.personId) || (sh.length === 0 && handover(chore, ctx))) return [viewer.personId];
    return [];
}

/**
 * Applies the filters that do not depend on the need level or the capacity.
 *
 * @param chore the chore
 * @param ctx the filter context
 * @returns the codes of the failed filters
 */
export function baseBlocks(chore: Chore, ctx: PossibleContext): BlockCode[] {
    const blocks: BlockCode[] = [];
    const local = localParts(ctx.now, ctx.settings.time_zone);
    if (chore.deletedAt !== null) blocks.push('deleted');
    if (chore.snoozedUntil !== null && chore.snoozedUntil > ctx.now) blocks.push('snoozed');
    if (!inSeason(local.month, chore.seasonFrom, chore.seasonTo)) blocks.push('season');
    if (chore.noisy && isQuietDay(local.date, ctx.holidays)) blocks.push('quiet_day');
    if (chore.conditionId !== null && chore.conditionResult !== 1) blocks.push('condition');
    if (doers(chore, ctx).length === 0) blocks.push('persons');
    return blocks;
}

/**
 * Tells if a chore fits the capacity of at least one of the persons.
 *
 * @param chore the chore
 * @param persons ids of the persons who can do the chore
 * @param capacities capacity per person
 */
export function fitsCapacity(chore: Chore, persons: readonly number[], capacities: ReadonlyMap<number, Capacity>): boolean {
    return persons.some((id) => {
        const c = capacities.get(id);
        return c !== undefined && chore.durationMin <= c.minutes && chore.effort <= c.energy;
    });
}

/**
 * Applies all filters to a chore.
 *
 * @param chore the chore
 * @param need the need level of the chore
 * @param urgent true when an active deadline or boost raises the need level
 * @param ctx the filter context
 * @returns the codes of the failed filters, empty when the chore is possible now
 */
export function blocks(chore: Chore, need: number, urgent: boolean, ctx: PossibleContext): BlockCode[] {
    const result = baseBlocks(chore, ctx);
    if (!result.includes('persons') && !fitsCapacity(chore, doers(chore, ctx), ctx.capacities)) result.push('capacity');
    if (!urgent && need < ctx.settings.suggest_threshold) result.push('need');
    return result;
}
