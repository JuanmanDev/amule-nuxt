import type { MediaInfo } from '../../server/utils/amule-types';
import { formatSeconds } from '#shared/utils/format';

export interface MediaFact {
    label: string;
    value: string;
}

/**
 * Media metadata as label/value pairs, in reading order: what it is (title,
 * artist, album), then how it is encoded. Empty for a file with none - which is
 * every file over EC, and every non-media file over amuleapi.
 */
export function mediaFactList(media: MediaInfo | null | undefined, t: (key: string) => string): MediaFact[] {
    if (!media) return [];

    const facts: MediaFact[] = [];
    if (media.title) facts.push({ label: t('media.title'), value: media.title });
    if (media.artist) facts.push({ label: t('media.artist'), value: media.artist });
    if (media.album) facts.push({ label: t('media.album'), value: media.album });
    if (media.durationSeconds) facts.push({ label: t('media.duration'), value: formatSeconds(media.durationSeconds) ?? '' });
    if (media.codec) facts.push({ label: t('media.codec'), value: media.codec });
    if (media.bitrateKbps) facts.push({ label: t('media.bitrate'), value: `${media.bitrateKbps} kbps` });
    return facts;
}
