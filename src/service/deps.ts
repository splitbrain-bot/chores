import type { Database } from '../db/database.ts';
import type { HaApi } from '../ha/connection.ts';

/** Dependencies of the service functions. */
export interface Deps {
    db: Database;
    /** The Home Assistant connection, null when no connection is configured. */
    ha: HaApi | null;
    /** Returns the current time. */
    now: () => number;
    /** Called after a change of the conditions, for the template subscriptions. */
    onConditionsChanged?: () => void;
    /** Called after a change of the persons, for the watched entities and the calendars. */
    onPersonsChanged?: () => void;
    /** Called after a change of the settings, for the forecast, the holidays and the calendars. */
    onSettingsChanged?: () => void;
}
