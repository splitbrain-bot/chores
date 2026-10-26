import type { Database } from '../db/database.ts';
import type { HaApi } from '../ha/connection.ts';

/** Dependencies of the service functions. */
export interface Deps {
    db: Database;
    /** The Home Assistant connection, null when no connection is configured. */
    ha: HaApi | null;
    /** Returns the current time. */
    now: () => number;
    /** Called after a change of the chores, for the template subscriptions and the watched entities. */
    onChoresChanged?: () => void;
    /** Called after a change of the persons, for the watched entities. */
    onPersonsChanged?: () => void;
}
