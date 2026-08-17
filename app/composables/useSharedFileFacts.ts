/**
 * The fact list for one shared file, as the details modal shows it.
 *
 * In one place because two pages need it word for word: the shared page's own
 * details, and the uploads page - where the file being sent is a shared file
 * too, and hiding what the shared page knows about it just made people open
 * two modals for one file.
 */

import type { SharedFile } from '../../server/utils/amule-types';
import { formatBytes } from '#shared/utils/format';

export const useSharedFileFacts = () => {
    const { t } = useI18n();
    const time = useLocalTime();

    function factsOf(file: SharedFile): Array<{ label: string; value: string }> {
        return [
            { label: t('shared.fields.size'), value: formatBytes(file.size) },
            { label: t('shared.fields.uploadedAll'), value: formatBytes(file.transferredAll) },
            { label: t('shared.fields.uploadedSession'), value: formatBytes(file.transferred) },
            { label: t('shared.fields.shareRatio'), value: `${file.shareRatio.toFixed(2)}x` },
            { label: t('shared.fields.requestsAll'), value: file.requestsAll.toLocaleString() },
            { label: t('shared.fields.requestsSession'), value: file.requests.toLocaleString() },
            { label: t('shared.fields.acceptedAll'), value: file.acceptsAll.toLocaleString() },
            { label: t('shared.fields.acceptedSession'), value: file.accepts.toLocaleString() },
            { label: t('shared.fields.clientsQueued'), value: file.onQueue.toLocaleString() },
            { label: t('shared.fields.completeSources'), value: file.completeSources.toLocaleString() },
            /*
             * Always shown, even with nothing to show.
             *
             * These come from this app's own record of the download queue, not
             * from aMule, which keeps no such timestamp - so a file shared
             * before this app ever ran has neither. Saying "not recorded"
             * explains why this particular file has none while others do.
             */
            { label: t('shared.fields.addedAt'), value: file.addedAt ? time.dateTime(file.addedAt) : t('shared.notRecorded') },
            { label: t('shared.fields.completedAt'), value: file.completedAt ? time.dateTime(file.completedAt) : t('shared.notRecorded') },
            { label: t('shared.fields.uploadPriority'), value: `${t('downloads.priorities.' + file.priority)}${file.autoPriority ? ' ' + t('downloads.priorities.autoSuffix') : ''}` }
        ];
    }

    return { factsOf };
};
