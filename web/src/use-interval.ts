import { useEffect, useRef } from 'react';

/**
 * Calls a function in an interval and when the page becomes visible again.
 *
 * @param callback the function
 * @param ms the interval in milliseconds
 */
export function useInterval(callback: () => void, ms: number): void {
    const saved = useRef(callback);
    saved.current = callback;
    useEffect(() => {
        const run = () => saved.current();
        const timer = setInterval(run, ms);
        const onVisible = () => {
            if (document.visibilityState === 'visible') run();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [ms]);
}
