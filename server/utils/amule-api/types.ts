/**
 * Wire shapes of amuleapi v1, the REST daemon that ships with aMule 3.1.
 *
 * Named after the API's own keys (snake_case, units in the name) rather than
 * after the app's types, so every translation between the two lives in
 * `mappers.ts` and nowhere else. Only the fields this app reads are declared:
 * the contract is additive-only, and a client must ignore what it does not know.
 *
 * Reference: aMule `docs/api/REFERENCE.md` (tag 3.1.0).
 */

export interface ApiErrorEnvelope {
    error?: { code?: string; message?: string };
}

export interface ApiLoginResponse {
    /** Only present when the login opted in via `?include_token=true`. */
    token?: string;
    role: 'admin' | 'guest' | string;
    expires_at: number;
    session_id: string;
}

export interface ApiHealth {
    status: string;
    ec_connected: boolean;
    snapshot_ready: boolean;
}

export interface ApiVersion {
    service: string;
    api_version: string;
    amuleapi_version: string;
    daemon_version: string;
    update?: {
        check_enabled: boolean;
        checked: boolean;
        latest_version: string | null;
        available: boolean | null;
        last_checked_at: number | null;
    };
}

export type ApiNetworkState = 'disabled' | 'disconnected' | 'connecting' | 'connected' | string;

export interface ApiStatus {
    ec_connected: boolean;
    ed2k: {
        state: ApiNetworkState;
        high_id: boolean;
        user_id: number;
        public_ip: string | null;
        connected_since_at: number;
        server_name: string | null;
        server_ip: string | null;
        server_port: number | null;
        network: { user_count: number | null; file_count: number | null };
    };
    kad: {
        state: ApiNetworkState;
        firewalled_tcp: boolean | null;
        connected_since_at: number;
        network: { user_count: number | null; file_count: number | null; node_count: number | null };
    };
    speeds: {
        download_speed_bytes_per_second: number;
        upload_speed_bytes_per_second: number;
        download_overhead_bytes_per_second: number;
        upload_overhead_bytes_per_second: number;
    };
    disk: { temp_free_bytes: number | null; incoming_free_bytes: number | null };
    queue: { waiting_upload_client_count: number; download_source_count: number };
}

export interface ApiMedia {
    duration_seconds?: number;
    bitrate_kilobits_per_second?: number;
    codec?: string;
    artist?: string;
    album?: string;
    title?: string;
}

export type ApiDownloadStatus =
    | 'downloading' | 'waiting' | 'hashing' | 'allocating' | 'paused' | 'stopped'
    | 'completing' | 'completed' | 'erroneous' | 'insufficient_disk' | 'unknown';

export type ApiPartState = 'complete' | 'pending' | 'unavailable';

export interface ApiDownload {
    hash: string;
    name: string;
    ed2k_link: string;
    size_bytes: number;
    completed_bytes: number;
    transferred_bytes?: number;
    speed_bytes_per_second: number;
    status: ApiDownloadStatus | string;
    priority: 'low' | 'normal' | 'high' | string;
    priority_auto: boolean;
    category_index?: number;
    sources: { total: number; unavailable: number; transferring: number; a4af: number };
    progress: { percent: number; parts?: Array<{ state: ApiPartState; sources: number }> };
    hashed_part_count?: number;
    total_part_count?: number;

    // Detail-only (GET /downloads/{hash})
    last_seen_complete_at?: number | null;
    last_received_at?: number | null;
    active_seconds?: number;
    available_part_count?: number;
    remaining_seconds?: number | null;
    lost_to_corruption_bytes?: number;
    gained_by_compression_bytes?: number;
    ich_recovered_packet_count?: number;
    aich_hash?: string | null;
    part_file_name?: string;
    directory?: string;
    upload_queue_count?: number;
    my_comment?: string;
    my_rating?: number;
    a4af_auto?: boolean;
    media?: ApiMedia | null;
}

export interface ApiSharedFile {
    hash: string;
    name: string;
    ed2k_link: string;
    size_bytes: number;
    priority: string;
    priority_auto: boolean;
    sources: { complete: number; complete_min?: number; complete_max?: number };
    uploaded_bytes_session: number;
    uploaded_bytes_total: number;
    request_count_session: number;
    request_count_total: number;
    accepted_request_count_session: number;
    accepted_request_count_total: number;
    upload_speed_bytes_per_second?: number;
    uploading_client_count?: number;
    last_upload_at?: number | null;
    shared_since_at?: number | null;
    hashed_part_count?: number;
    media?: ApiMedia | null;

    // Detail-only (GET /shared/{hash})
    file_type?: string;
    upload_ratio?: number;
    directory?: string;
    incomplete?: boolean;
    aich_hash?: string | null;
    total_part_count?: number;
    parts?: Array<{ sources: number }> | null;
    upload_queue_count?: number;
    my_comment?: string;
    my_rating?: number;
}

export interface ApiPeerClient {
    ecid: number;
    name: string | null;
    user_hash?: string;
    ip: string | null;
    country_code?: string | null;
    port: number | null;
    software: string | null;
    software_version: string | null;
    upload_state?: string;
    download_state?: string;
    upload_file_name: string | null;
    upload_file_hash: string | null;
    download_file_name?: string | null;
    download_file_hash?: string | null;
    uploaded_bytes_session: number;
    downloaded_bytes_session?: number;
    uploaded_bytes_total: number;
    downloaded_bytes_total: number;
    upload_speed_bytes_per_second: number;
    download_speed_bytes_per_second?: number;
    upload_queue_position?: number | null;
    upload_queue_score?: number | null;
    credit_ratio?: number | null;
}

export interface ApiServer {
    ecid: number;
    name: string;
    description: string;
    software_version?: string | null;
    address?: string;
    ip: string;
    country_code?: string | null;
    port: number;
    user_count: number;
    max_user_count?: number;
    file_count: number;
    priority: 'low' | 'normal' | 'high' | string;
    ping_ms: number;
    failed_count: number;
    permanent: boolean;
}

export interface ApiPreferences {
    general?: {
        nickname?: string;
        user_hash?: string;
        version_check_enabled?: boolean;
    };
    connection?: {
        max_upload_kibibytes_per_second?: number;
        max_download_kibibytes_per_second?: number;
        upload_slot_min_kibibytes_per_second?: number;
        tcp_port?: number;
        udp_port?: number;
        max_sources_per_file_count?: number;
        max_connection_count?: number;
        autoconnect?: boolean;
        reconnect_on_connection_loss?: boolean;
        ed2k_enabled?: boolean;
        kad_enabled?: boolean;
    };
    directories?: {
        incoming_path?: string;
        temp_path?: string;
        shared_paths?: string[];
        share_hidden?: boolean;
        rescan_on_startup?: boolean;
    };
    servers?: {
        remove_dead_servers?: boolean;
        dead_server_retry_count?: number;
        update_list_at_startup?: boolean;
        update_list_from_server?: boolean;
        update_list_from_client?: boolean;
        safe_server_connect_enabled?: boolean;
        autoconnect_static_servers_only?: boolean;
        update_url?: string;
    };
    kad?: { update_url?: string };
}

/** Recursive `Partial`, for PATCH bodies that name only what they change. */
export type ApiPatch<T> = { [K in keyof T]?: T[K] extends object ? ApiPatch<T[K]> : T[K] };

export interface ApiResultsEnvelope {
    results: Array<{ id: string; ok: boolean; error?: { code?: string; message?: string } }>;
}

export interface ApiSearch {
    search_id: number;
    query: string;
    type: 'local' | 'global' | 'kad' | 'browse' | string;
    state: 'running' | 'finished' | 'idle' | string;
    started_at?: number;
    result_count?: number;
}

export interface ApiSearchResult {
    hash: string;
    name: string;
    size_bytes: number;
    sources: { total: number; complete: number };
    already_downloaded?: boolean;
    rating?: number;
    status?: string;
    file_type?: string;
    media?: ApiMedia | null;
}

export interface ApiSearchResults {
    results: ApiSearchResult[];
    search_id: number;
    query: string;
    progress: { state: 'running' | 'finished' | 'idle' | string; type: string; percent: number };
}

export interface ApiStatsValue {
    type: 'integer' | 'bytes' | 'speed' | 'time' | 'double' | 'string' | string;
    value: number | string;
    token?: string | null;
    extra?: ApiStatsValue | null;
}

export interface ApiStatsNode {
    key?: string;
    label: string;
    label_value?: string | null;
    values: ApiStatsValue[];
    children: ApiStatsNode[];
    ratio_session?: number;
    ratio_total?: number;
}

export interface ApiLogLines {
    lines: string[];
    total_lines?: number;
    returned_lines?: number;
}

export interface ApiServerInfoLog {
    text: string;
}
