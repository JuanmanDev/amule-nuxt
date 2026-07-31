import { useState } from '#app'

export const useConnection = () => {
    return useState('amule-connection', () => ({
        connected: true,
        error: null as string | null
    }))
}
