import type { HaApi } from './connection.ts';

/**
 * Sends a message through a notify action of Home Assistant. A failed call is logged and returns false.
 *
 * @param ha the Home Assistant connection
 * @param action the action, for example notify.mobile_app_cronk
 * @param title the title
 * @param message the message
 * @returns true when Home Assistant accepted the call
 */
export async function notify(ha: HaApi, action: string, title: string, message: string): Promise<boolean> {
    const [domain, service] = action.split('.', 2);
    if (domain !== 'notify' || !service) {
        console.error(`Invalid notify action ${action}`);
        return false;
    }
    try {
        await ha.callService(domain, service, { title, message });
        return true;
    } catch (err) {
        console.error(`Notification through ${action} failed`, err);
        return false;
    }
}
