/**
 * Copy a value and say so, the same way everywhere.
 *
 * `navigator.clipboard` needs a secure context, so it is simply absent when the
 * app is opened over plain HTTP on a LAN address - which is how most people reach
 * a daemon on their own network. Failing silently there meant a copy button that
 * did nothing at all, so the fallback shows the value for a manual copy.
 */

export const useClipboard = () => {
    const toast = useToast();

    async function copy(value: string, successTitle = 'Copied'): Promise<boolean> {
        if (!value) return false;

        try {
            await navigator.clipboard.writeText(value);
            toast.add({ title: successTitle, color: 'success' });
            return true;
        } catch {
            toast.add({
                title: 'Could not copy to the clipboard',
                description: value,
                color: 'warning',
                // Long enough to select the text out of the toast by hand
                duration: 10_000
            });
            return false;
        }
    }

    return { copy };
};
