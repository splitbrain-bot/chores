import { createContext, useContext } from 'react';
import type { Category, Me } from './types.ts';

/** Data that all screens share. */
export interface AppData {
    me: Me;
    /** True for the shared token of the wall tablet. */
    tablet: boolean;
    categories: Category[];
    reloadCategories: () => void;
}

/** Context with the shared data. */
export const AppContext = createContext<AppData | null>(null);

/** Returns the shared data. */
export function useApp(): AppData {
    const data = useContext(AppContext);
    if (!data) throw new Error('AppContext missing');
    return data;
}
