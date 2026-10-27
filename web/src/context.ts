import { createContext, useContext } from 'react';
import type { Category, ConditionStatus, Me, Person } from './types.ts';

/** Data that all screens share. */
export interface AppData {
    me: Me;
    /** True for the shared token of the wall tablet. */
    tablet: boolean;
    categories: Category[];
    reloadCategories: () => void;
    /** The persons. Without the right to manage, a person has only the id, the name, the sort and the color. */
    persons: Person[];
    reloadPersons: () => void;
    conditions: ConditionStatus[];
    reloadConditions: () => void;
}

/** Context with the shared data. */
export const AppContext = createContext<AppData | null>(null);

/** Returns the shared data. */
export function useApp(): AppData {
    const data = useContext(AppContext);
    if (!data) throw new Error('AppContext missing');
    return data;
}
