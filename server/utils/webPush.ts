/**
 * Web Push: the notifications that survive the tab being closed.
 *
 * Two things have to outlive a restart, and both are kept in one small JSON file
 * next to the app's data:
 *
 *  * **The VAPID key pair.** It identifies this server to the browser's push
 *    service, and every subscription is bound to the public key it was created
 *    with. Generating a fresh pair on each boot would silently invalidate every
 *    subscription anyone had granted.
 *  * **The subscriptions themselves.** Each is a browser endpoint plus the keys
 *    to encrypt for it. They are per browser profile, not per user.
 *
 * Keys can also be supplied through `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`,
 * which is what a deployment with several replicas needs: they all have to speak
 * for the same identity.
 *
 * Note for whoever deploys this: browsers only allow a service worker - and
 * therefore push - on HTTPS, with `localhost` as the one exemption. Over plain
 * HTTP on a LAN address the subscribe call fails, and the app falls back to
 * notifications that need a tab open.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import webpush, { type PushSubscription } from 'web-push';
import { useLogger } from './logger';

const log = useLogger('web-push');

export interface StoredSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    /** Epoch ms it was stored, only for housekeeping. */
    createdAt: number;
    /** What the browser called itself, to make the settings list readable. */
    label?: string;
}

interface PushState {
    vapid: { publicKey: string; privateKey: string };
    subscriptions: StoredSubscription[];
}

/** Where the state file lives; one directory for anything this app has to keep. */
function statePath(): string {
    const base = process.env.AMULE_DATA_DIR || resolve(process.cwd(), '.amule-data');
    return resolve(base, 'push.json');
}

let state: PushState | null = null;
let loading: Promise<PushState> | null = null;

async function persist(next: PushState): Promise<void> {
    const path = statePath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(next, null, 2), 'utf8');
}

async function load(): Promise<PushState> {
    const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
    const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();

    let stored: Partial<PushState> = {};
    try {
        stored = JSON.parse(await readFile(statePath(), 'utf8'));
    } catch {
        // No file yet, or an unreadable one: start from scratch rather than
        // refusing to run. The worst case is that existing subscriptions have to
        // be granted again.
    }

    // The environment wins: a replica set has to share one identity, and a stale
    // file would otherwise make one instance sign with different keys.
    const vapid = envPublic && envPrivate
        ? { publicKey: envPublic, privateKey: envPrivate }
        : stored.vapid ?? webpush.generateVAPIDKeys();

    const next: PushState = {
        vapid,
        subscriptions: Array.isArray(stored.subscriptions) ? stored.subscriptions : []
    };

    const generated = !envPublic && !stored.vapid;
    if (generated) {
        log.info('Generated a VAPID key pair for push notifications');
    }

    if (generated || stored.vapid?.publicKey !== next.vapid.publicKey) {
        await persist(next).catch(e => log.warn('Could not write the push state file', e));
    }

    webpush.setVapidDetails(
        // A contact is required by the spec; a mailto with no real inbox behind it
        // is what every self-hosted app uses, and push services accept it.
        process.env.VAPID_SUBJECT || 'mailto:amule-nuxt@localhost',
        next.vapid.publicKey,
        next.vapid.privateKey
    );

    return next;
}

async function getState(): Promise<PushState> {
    if (state) return state;
    // One load even if several requests arrive together
    loading ??= load().then(loaded => (state = loaded));
    return loading;
}

/** The key a browser needs to create a subscription for this server. */
export async function vapidPublicKey(): Promise<string> {
    return (await getState()).vapid.publicKey;
}

export async function listSubscriptions(): Promise<StoredSubscription[]> {
    return (await getState()).subscriptions;
}

export async function addSubscription(subscription: StoredSubscription): Promise<void> {
    const current = await getState();

    // The endpoint is the identity: re-subscribing the same browser must replace
    // its entry, not add a second one that would deliver everything twice.
    current.subscriptions = current.subscriptions
        .filter(entry => entry.endpoint !== subscription.endpoint)
        .concat(subscription);

    await persist(current);
}

export async function removeSubscription(endpoint: string): Promise<boolean> {
    const current = await getState();
    const before = current.subscriptions.length;

    current.subscriptions = current.subscriptions.filter(entry => entry.endpoint !== endpoint);
    if (current.subscriptions.length === before) return false;

    await persist(current);
    return true;
}

export interface PushMessage {
    title: string;
    body: string;
    /** Where the notification's button takes the browser. */
    url?: string;
    /** Notifications sharing a tag replace each other instead of stacking up. */
    tag?: string;
    kind?: string;
}

/**
 * Sends one message to every subscribed browser.
 *
 * A 404 or 410 from a push service means that subscription is dead - the browser
 * profile is gone, or permission was revoked - so it is dropped. Anything else is
 * logged and left alone; a push service having a bad minute is not a reason to
 * lose someone's subscription.
 */
export async function broadcastPush(message: PushMessage): Promise<{ sent: number; failed: number }> {
    const current = await getState();
    if (current.subscriptions.length === 0) return { sent: 0, failed: 0 };

    const payload = JSON.stringify(message);
    let sent = 0;
    let failed = 0;
    const dead: string[] = [];

    await Promise.all(current.subscriptions.map(async entry => {
        const subscription: PushSubscription = { endpoint: entry.endpoint, keys: entry.keys };

        try {
            await webpush.sendNotification(subscription, payload, { TTL: 3600 });
            sent += 1;
        } catch (e: any) {
            failed += 1;
            if (e?.statusCode === 404 || e?.statusCode === 410) {
                dead.push(entry.endpoint);
            } else {
                log.warn(`Push to ${new URL(entry.endpoint).host} failed: ${e?.statusCode ?? ''} ${e?.message ?? e}`);
            }
        }
    }));

    if (dead.length > 0) {
        current.subscriptions = current.subscriptions.filter(entry => !dead.includes(entry.endpoint));
        await persist(current);
        log.info(`Dropped ${dead.length} expired push subscription(s)`);
    }

    return { sent, failed };
}
