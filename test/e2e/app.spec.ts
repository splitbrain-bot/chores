import { expect, test, type Page } from '@playwright/test';
import { PERSON_TOKEN, SHARED_TOKEN } from './seed.ts';

/**
 * Opens the app as Andi with the seeded login token. The login form has a rate limit, so only the login tests use
 * it.
 *
 * @param page the page
 */
async function login(page: Page): Promise<void> {
    await page.addInitScript((token) => localStorage.setItem('chores.token', token), PERSON_TOKEN);
    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();
}

test.beforeEach(async ({ request }) => {
    await request.post('/__test/reset');
});

test('logs in and shows the suggestions', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Name').fill('Andi');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Wrong name or password')).toBeVisible();

    await page.getByLabel('Password').fill('andi-pw');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.badge')).toHaveText(['Andi', 'Kaddi']);
    await expect(page.getByText('up to 120 min, energy 5')).toBeVisible();
    await expect(page.locator('.card h2')).toHaveText(['Kühlschrank auswischen', 'Spiegel putzen', 'Fußboden wischen']);
    await expect(page.locator('.card').nth(2).getByText('Also possible')).toBeVisible();
});

test('marks a suggestion as done and taps necessary earlier', async ({ page, request }) => {
    await login(page);
    const card = page.locator('.card').filter({ hasText: 'Fußboden wischen' });
    await card.getByRole('checkbox').check();
    await card.getByRole('button', { name: 'Done' }).click();
    await expect(card.getByText('Done. Thank you!')).toBeVisible();
    await card.getByRole('button', { name: 'Was necessary earlier' }).click();
    await expect(card.getByText('Noted. The chore comes back sooner.')).toBeVisible();
    await expect(page.locator('.card h2')).toHaveText(['Kühlschrank auswischen', 'Spiegel putzen']);

    const late = page.locator('.card').filter({ hasText: 'Kühlschrank auswischen' });
    await late.getByRole('button', { name: 'Done' }).click();
    await expect(late.getByText('Done. Thank you!')).toBeVisible();
    await expect(late.getByRole('button', { name: 'Was necessary earlier' })).toHaveCount(0);

    const token = await page.evaluate(() => localStorage.getItem('chores.token'));
    const res = await request.get('/api/chores?q=Fußboden', { headers: { authorization: `Bearer ${token}` } });
    const { chores } = await res.json() as { chores: { interval: number; categoryIds: number[]; lastDoneAt: number }[] };
    expect(chores.map((c) => c.interval).sort()).toEqual([5.95, 7]);
    expect(chores.every((c) => Date.now() - c.lastDoneAt < 60_000)).toBe(true);
});

test('shows the notes and opens the chore from a suggestion', async ({ page }) => {
    await login(page);
    const card = page.locator('.card').filter({ hasText: 'Kühlschrank auswischen' });
    const notes = card.getByRole('button', { name: 'Notes' });
    await expect(notes).toHaveText('Alles ausräumen und mit Essigwasser auswischen.');
    await notes.click();
    await expect(notes).toHaveAttribute('aria-expanded', 'true');
    await expect(notes).toContainText('Dichtung nicht vergessen.');

    await card.getByRole('button', { name: 'Edit chore' }).click();
    await expect(page).toHaveURL(/\/chores\/\d+$/);
    await expect(page.getByLabel('Name')).toHaveValue('Kühlschrank auswischen');
});

test('postpones a suggestion with a reason', async ({ page }) => {
    await login(page);
    const card = page.locator('.card').filter({ hasText: 'Spiegel putzen' });
    await card.getByRole('button', { name: 'Later' }).click();
    await card.getByRole('button', { name: 'No energy' }).click();
    await expect(page.locator('.card h2')).toHaveText(['Kühlschrank auswischen', 'Fußboden wischen']);

    await page.getByRole('link', { name: 'Chores' }).click();
    await expect(page.locator('.chore-row').filter({ hasText: 'Spiegel putzen' })).toContainText('paused until');
});

test('opens the tablet mode with the shared token URL', async ({ page }) => {
    await page.goto(`/?token=${SHARED_TOKEN}`);
    await expect(page.locator('.card').first()).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    expect(page.url()).not.toContain('token');
    await expect(page.locator('html')).toHaveClass(/tablet/);
    await expect(page.locator('.nav a')).toHaveText(['Now', 'Chores']);
    await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit chore' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Notes' })).toBeVisible();

    await page.goto('/settings');
    await expect(page.locator('.card').first()).toBeVisible();
    await page.getByRole('link', { name: 'Chores' }).click();
    await expect(page.getByRole('button', { name: 'New chore' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mark as done' }).first().click();
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/tablet/);
});

test('groups the chore list by category or by group key', async ({ page }) => {
    await login(page);
    await page.goto('/chores');
    await expect(page.locator('.chores h2')).toHaveText(['Küche', 'Bad', 'Without category']);
    await page.getByLabel('Grouping').selectOption('groupKey');
    await expect(page.locator('.chores h2')).toHaveText(['fussboden-wischen', 'Without group key']);
    await expect(page.locator('.chores section').first().locator('.name')).toHaveText(['Fußboden wischen', 'Fußboden wischen']);
});

test('creates and edits a chore in the form', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Chores' }).click();
    await page.getByRole('button', { name: 'New chore' }).click();
    await page.getByLabel('Name').fill('Backofen reinigen');
    await page.getByRole('button', { name: 'Küche' }).click();
    await page.getByLabel('Growth').selectOption('time');
    await page.getByLabel('Interval (days)').fill('60');
    await page.getByLabel('Duration (minutes)').fill('45');
    await page.getByLabel('Effort (1 to 5)').fill('4');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page).toHaveURL(/\/chores$/);
    const row = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Küche' }) })
        .locator('.chore-row').filter({ hasText: 'Backofen reinigen' });
    await expect(row).toBeVisible();

    await row.locator('.row-main').click();
    await expect(page.getByRole('heading', { name: 'Edit chore' })).toBeVisible();
    await expect(page.getByLabel('Minimum interval')).toHaveValue('7.5');
    await page.getByLabel('Name').fill('Backofen gründlich reinigen');
    await page.getByRole('button', { name: 'Kaddi' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.chore-row').filter({ hasText: 'Backofen gründlich reinigen' })).toBeVisible();
});

test('creates a condition and uses it in a chore', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: 'Conditions' }).click();
    const form = page.locator('form.condition').last();
    await form.getByLabel('Name').fill('Trocken');
    await form.getByLabel('Template').fill('{{ is_state("sensor.rain", "off") }}');
    await form.getByRole('button', { name: 'Add condition' }).click();
    const created = page.locator('form.condition').first();
    await expect(created.getByLabel('Name')).toHaveValue('Trocken');
    await expect(created.getByText('Current result: no result')).toBeVisible();
    await expect(created.getByText('Used by 0 chores')).toBeVisible();

    await page.goto('/chores');
    await page.locator('.chore-row').filter({ hasText: 'Spiegel putzen' }).locator('.row-main').click();
    await page.getByRole('combobox', { name: /^Condition/ }).selectOption({ label: 'Trocken' });
    await expect(page.getByText('Current result: no result')).toBeVisible();
    await expect(page.getByLabel('Forecast condition').locator('option')).toHaveText(['–']);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.chore-row').filter({ hasText: 'Spiegel putzen' })).toContainText('condition');

    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Conditions' }).click();
    await expect(page.getByText('Used by 1 chores')).toBeVisible();
    await page.locator('form.condition').first().getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Chores use the condition')).toBeVisible();
});

test.describe('German browser', () => {
    test.use({ locale: 'de-DE' });

    test('shows the German texts', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
        await page.getByLabel('Name').fill('Andi');
        await page.getByLabel('Passwort').fill('andi-pw');
        await page.getByRole('button', { name: 'Anmelden' }).click();
        await expect(page.locator('.nav a')).toHaveText(['Jetzt', 'Aufgaben', 'Ausblick', 'Einstellungen']);
        await expect(page.getByRole('button', { name: 'Erledigt' }).first()).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('lang', 'de');
        await expect(page).toHaveTitle('Chores');
    });
});

test('creates and revokes a device token', async ({ page, browser }) => {
    await login(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: 'Devices and tokens' }).click();
    await page.getByLabel('Label').fill('Küchentablet');
    await page.getByRole('button', { name: 'Create device token' }).click();
    const url = await page.locator('.created-token code').textContent();
    expect(url).toMatch(/\/\?token=/);

    const tablet = await browser.newPage();
    await tablet.goto(url!);
    await expect(tablet.locator('html')).toHaveClass(/tablet/);

    await page.locator('tr').filter({ hasText: 'Küchentablet' }).getByRole('button', { name: 'Revoke' }).click();
    await expect(page.locator('tr').filter({ hasText: 'Küchentablet' })).toContainText('revoked');

    await tablet.reload();
    await expect(tablet).toHaveURL(/\/login$/);
    await tablet.close();
});

test('is an installable PWA', async ({ page, request }) => {
    await page.goto('/login');
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await request.get(`/${manifestHref!.replace(/^\//, '')}`)).json() as {
        name: string; display: string; icons: { sizes: string }[] };
    expect(manifest).toMatchObject({ name: 'Chores', display: 'standalone' });
    expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const icon of ['/icons/icon-192.png', '/icons/icon-512.png']) {
        expect((await request.get(icon)).headers()['content-type']).toBe('image/png');
    }

    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toMatch(/\/$/);
    const api = await page.evaluate(async () => {
        const r = await fetch('/api/health');
        return r.headers.get('content-security-policy');
    });
    expect(api).toBe("frame-ancestors 'self' https://ha.example.org");
});
