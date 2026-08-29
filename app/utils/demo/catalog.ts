/**
 * The files the demo daemon "knows about".
 *
 * Everything here is freely redistributable: Linux ISOs, Wikipedia offline
 * dumps, public-domain books and open movies. The names and sizes are real so
 * the lists look like a real queue; the hashes are synthetic (see `hashOf`), so
 * nothing in the demo can be pasted into a real aMule and resolve to anything.
 */

export type CatalogKind = 'iso' | 'zim' | 'book' | 'video' | 'audio' | 'archive' | 'map' | 'software';

export interface CatalogEntry {
    name: string;
    size: number;
    kind: CatalogKind;
    /** Words a search must contain to find this file, beyond the name itself. */
    tags: string[];
    /** Rough popularity, drives how many sources a search reports. */
    popularity: number;
}

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export const CATALOG: CatalogEntry[] = [
    // --- Linux distributions ---------------------------------------------
    { name: 'xubuntu-24.04.2-desktop-amd64.iso', size: Math.round(4.2 * GB), kind: 'iso', tags: ['xubuntu', 'ubuntu', 'linux', 'xfce'], popularity: 0.9 },
    { name: 'xubuntu-24.04.2-minimal-amd64.iso', size: Math.round(2.6 * GB), kind: 'iso', tags: ['xubuntu', 'ubuntu', 'linux', 'minimal'], popularity: 0.6 },
    { name: 'ubuntu-24.04.2-desktop-amd64.iso', size: Math.round(5.8 * GB), kind: 'iso', tags: ['ubuntu', 'linux', 'noble'], popularity: 1 },
    { name: 'ubuntu-24.04.2-live-server-amd64.iso', size: Math.round(3.1 * GB), kind: 'iso', tags: ['ubuntu', 'linux', 'server'], popularity: 0.8 },
    { name: 'debian-12.10.0-amd64-netinst.iso', size: 663 * MB, kind: 'iso', tags: ['debian', 'linux', 'bookworm', 'netinst'], popularity: 0.9 },
    { name: 'debian-12.10.0-amd64-DVD-1.iso', size: Math.round(3.7 * GB), kind: 'iso', tags: ['debian', 'linux', 'bookworm', 'dvd'], popularity: 0.5 },
    { name: 'linuxmint-22.1-cinnamon-64bit.iso', size: Math.round(2.9 * GB), kind: 'iso', tags: ['mint', 'linux', 'cinnamon'], popularity: 0.8 },
    { name: 'linuxmint-22.1-xfce-64bit.iso', size: Math.round(2.7 * GB), kind: 'iso', tags: ['mint', 'linux', 'xfce'], popularity: 0.6 },
    { name: 'Fedora-Workstation-Live-x86_64-42-1.1.iso', size: Math.round(2.4 * GB), kind: 'iso', tags: ['fedora', 'linux', 'workstation'], popularity: 0.7 },
    { name: 'archlinux-2025.08.01-x86_64.iso', size: Math.round(1.2 * GB), kind: 'iso', tags: ['arch', 'linux'], popularity: 0.7 },
    { name: 'tails-amd64-6.15.img', size: Math.round(1.5 * GB), kind: 'iso', tags: ['tails', 'linux', 'privacy'], popularity: 0.5 },
    { name: 'kubuntu-24.04.2-desktop-amd64.iso', size: Math.round(4.3 * GB), kind: 'iso', tags: ['kubuntu', 'ubuntu', 'linux', 'kde'], popularity: 0.6 },
    { name: 'raspios-bookworm-arm64-full.img.xz', size: Math.round(2.8 * GB), kind: 'iso', tags: ['raspberry', 'raspbian', 'linux', 'arm'], popularity: 0.6 },
    { name: 'FreeBSD-14.2-RELEASE-amd64-dvd1.iso', size: Math.round(4.4 * GB), kind: 'iso', tags: ['freebsd', 'bsd', 'unix'], popularity: 0.3 },

    // --- Wikipedia and other Kiwix ZIM offline dumps ---------------------
    { name: 'wikipedia_en_all_maxi_2025-07.zim', size: Math.round(109.9 * GB), kind: 'zim', tags: ['wikipedia', 'zim', 'kiwix', 'english', 'offline'], popularity: 0.7 },
    { name: 'wikipedia_en_all_nopic_2025-07.zim', size: Math.round(56.1 * GB), kind: 'zim', tags: ['wikipedia', 'zim', 'kiwix', 'english', 'nopic'], popularity: 0.5 },
    { name: 'wikipedia_es_all_maxi_2025-06.zim', size: Math.round(38.4 * GB), kind: 'zim', tags: ['wikipedia', 'zim', 'kiwix', 'spanish', 'español'], popularity: 0.6 },
    { name: 'wikipedia_es_all_nopic_2025-06.zim', size: Math.round(19.2 * GB), kind: 'zim', tags: ['wikipedia', 'zim', 'kiwix', 'spanish', 'nopic'], popularity: 0.4 },
    { name: 'wikipedia_de_all_maxi_2025-06.zim', size: Math.round(41.7 * GB), kind: 'zim', tags: ['wikipedia', 'zim', 'kiwix', 'german', 'deutsch'], popularity: 0.5 },
    { name: 'wikipedia_fr_all_maxi_2025-06.zim', size: Math.round(38.9 * GB), kind: 'zim', tags: ['wikipedia', 'zim', 'kiwix', 'french', 'français'], popularity: 0.5 },
    { name: 'wikipedia_en_simple_all_maxi_2025-07.zim', size: Math.round(2.6 * GB), kind: 'zim', tags: ['wikipedia', 'zim', 'kiwix', 'simple', 'english'], popularity: 0.8 },
    { name: 'wiktionary_en_all_maxi_2025-05.zim', size: Math.round(7.8 * GB), kind: 'zim', tags: ['wiktionary', 'zim', 'kiwix', 'dictionary'], popularity: 0.4 },
    { name: 'wikivoyage_en_all_maxi_2025-06.zim', size: Math.round(1.1 * GB), kind: 'zim', tags: ['wikivoyage', 'zim', 'kiwix', 'travel'], popularity: 0.4 },
    { name: 'gutenberg_en_all_2025-03.zim', size: Math.round(72.5 * GB), kind: 'zim', tags: ['gutenberg', 'zim', 'kiwix', 'books', 'ebooks'], popularity: 0.4 },
    { name: 'stackoverflow.com_en_all_2024-10.zim', size: Math.round(75.3 * GB), kind: 'zim', tags: ['stackoverflow', 'zim', 'kiwix', 'programming'], popularity: 0.5 },

    // --- Project Gutenberg and other public-domain texts -----------------
    { name: 'Miguel de Cervantes - Don Quijote de la Mancha (Gutenberg #2000).epub', size: Math.round(1.9 * MB), kind: 'book', tags: ['cervantes', 'quijote', 'gutenberg', 'ebook', 'epub', 'libro'], popularity: 0.7 },
    { name: 'Mary Shelley - Frankenstein (Gutenberg #84).epub', size: 448 * 1024, kind: 'book', tags: ['frankenstein', 'shelley', 'gutenberg', 'ebook', 'epub'], popularity: 0.8 },
    { name: 'Jane Austen - Pride and Prejudice (Gutenberg #1342).epub', size: 712 * 1024, kind: 'book', tags: ['austen', 'pride', 'prejudice', 'gutenberg', 'ebook', 'epub'], popularity: 0.9 },
    { name: 'Herman Melville - Moby Dick (Gutenberg #2701).epub', size: 1180 * 1024, kind: 'book', tags: ['melville', 'moby', 'dick', 'gutenberg', 'ebook', 'epub'], popularity: 0.6 },
    { name: 'Bram Stoker - Dracula (Gutenberg #345).epub', size: 690 * 1024, kind: 'book', tags: ['dracula', 'stoker', 'gutenberg', 'ebook', 'epub'], popularity: 0.7 },
    { name: 'Lewis Carroll - Alice in Wonderland (Gutenberg #11).pdf', size: Math.round(2.2 * MB), kind: 'book', tags: ['alice', 'carroll', 'wonderland', 'gutenberg', 'ebook', 'pdf'], popularity: 0.8 },
    { name: 'Benito Pérez Galdós - Fortunata y Jacinta (Gutenberg).epub', size: Math.round(1.4 * MB), kind: 'book', tags: ['galdos', 'fortunata', 'gutenberg', 'ebook', 'epub', 'libro'], popularity: 0.3 },
    { name: 'Sun Tzu - The Art of War (Gutenberg #132).epub', size: 210 * 1024, kind: 'book', tags: ['sun', 'tzu', 'art', 'war', 'gutenberg', 'ebook'], popularity: 0.6 },
    { name: 'The Complete Works of William Shakespeare (Gutenberg #100).txt', size: Math.round(5.4 * MB), kind: 'book', tags: ['shakespeare', 'gutenberg', 'ebook', 'txt'], popularity: 0.7 },

    // --- Open movies and free media --------------------------------------
    { name: 'Big Buck Bunny (2008) 1080p 60fps - Blender Foundation.mp4', size: Math.round(355 * MB), kind: 'video', tags: ['big', 'buck', 'bunny', 'blender', 'open', 'movie', 'creative', 'commons'], popularity: 1 },
    { name: 'Sintel (2010) 4K - Blender Foundation.mkv', size: Math.round(4.9 * GB), kind: 'video', tags: ['sintel', 'blender', 'open', 'movie', 'creative', 'commons'], popularity: 0.8 },
    { name: 'Tears of Steel (2012) 1080p - Blender Foundation.mp4', size: Math.round(1.8 * GB), kind: 'video', tags: ['tears', 'steel', 'blender', 'open', 'movie', 'creative', 'commons'], popularity: 0.7 },
    { name: 'Elephants Dream (2006) 1080p - Orange Open Movie Project.avi', size: Math.round(1.1 * GB), kind: 'video', tags: ['elephants', 'dream', 'blender', 'open', 'movie', 'creative', 'commons'], popularity: 0.6 },
    { name: 'Cosmos Laundromat (2015) 4K - Blender Foundation.mkv', size: Math.round(3.3 * GB), kind: 'video', tags: ['cosmos', 'laundromat', 'blender', 'open', 'movie'], popularity: 0.5 },
    { name: 'Spring (2019) 4K - Blender Animation Studio.mkv', size: Math.round(2.7 * GB), kind: 'video', tags: ['spring', 'blender', 'open', 'movie'], popularity: 0.5 },
    { name: 'Night of the Living Dead (1968) - public domain.mp4', size: Math.round(1.4 * GB), kind: 'video', tags: ['night', 'living', 'dead', 'public', 'domain', 'movie', 'romero'], popularity: 0.6 },
    { name: 'Charade (1963) - public domain 720p.mp4', size: Math.round(2.1 * GB), kind: 'video', tags: ['charade', 'hepburn', 'public', 'domain', 'movie'], popularity: 0.4 },
    { name: 'Metropolis (1927) restored - public domain.mkv', size: Math.round(3.9 * GB), kind: 'video', tags: ['metropolis', 'lang', 'public', 'domain', 'movie', 'silent'], popularity: 0.5 },
    { name: 'NASA Apollo 11 - Original Mission Video (1969).mp4', size: Math.round(1.6 * GB), kind: 'video', tags: ['nasa', 'apollo', 'moon', 'public', 'domain', 'space'], popularity: 0.5 },
    { name: 'Beethoven - Symphony No. 9 (Musopen, public domain FLAC).zip', size: Math.round(410 * MB), kind: 'audio', tags: ['beethoven', 'symphony', 'musopen', 'classical', 'flac', 'public', 'domain'], popularity: 0.5 },
    { name: 'Bach - The Well-Tempered Clavier (Kimiko Ishizaka, CC0) FLAC.zip', size: Math.round(980 * MB), kind: 'audio', tags: ['bach', 'clavier', 'ishizaka', 'classical', 'flac', 'creative', 'commons'], popularity: 0.4 },
    { name: 'Chopin - Complete Nocturnes (Musopen) MP3 320k.zip', size: Math.round(260 * MB), kind: 'audio', tags: ['chopin', 'nocturnes', 'musopen', 'classical', 'mp3'], popularity: 0.5 },
    { name: 'LibriVox - Sherlock Holmes - The Adventures (audiobook) MP3.zip', size: Math.round(370 * MB), kind: 'audio', tags: ['librivox', 'sherlock', 'holmes', 'audiobook', 'mp3'], popularity: 0.6 },

    // --- Free software, maps and datasets --------------------------------
    { name: 'LibreOffice_25.2.3_Win_x86-64.msi', size: Math.round(361 * MB), kind: 'software', tags: ['libreoffice', 'office', 'windows'], popularity: 0.8 },
    { name: 'LibreOffice_25.2.3_Linux_x86-64_deb.tar.gz', size: Math.round(298 * MB), kind: 'software', tags: ['libreoffice', 'office', 'linux', 'deb'], popularity: 0.5 },
    { name: 'gimp-3.0.4-setup.exe', size: Math.round(301 * MB), kind: 'software', tags: ['gimp', 'image', 'editor', 'windows'], popularity: 0.7 },
    { name: 'blender-4.4.3-windows-x64.zip', size: Math.round(348 * MB), kind: 'software', tags: ['blender', '3d', 'windows'], popularity: 0.7 },
    { name: 'blender-4.4.3-linux-x64.tar.xz', size: Math.round(370 * MB), kind: 'software', tags: ['blender', '3d', 'linux'], popularity: 0.5 },
    { name: 'inkscape-1.4.2-x64.msi', size: Math.round(134 * MB), kind: 'software', tags: ['inkscape', 'svg', 'vector', 'windows'], popularity: 0.5 },
    { name: 'VLC media player 3.0.21 win64.exe', size: Math.round(43 * MB), kind: 'software', tags: ['vlc', 'media', 'player', 'windows'], popularity: 0.9 },
    { name: 'Firefox Setup 140.0.2 (en-US, win64).exe', size: Math.round(66 * MB), kind: 'software', tags: ['firefox', 'browser', 'mozilla', 'windows'], popularity: 0.8 },
    { name: 'planet-250825.osm.pbf', size: Math.round(81.6 * GB), kind: 'map', tags: ['openstreetmap', 'osm', 'planet', 'map', 'pbf'], popularity: 0.4 },
    { name: 'spain-latest.osm.pbf', size: Math.round(1.3 * GB), kind: 'map', tags: ['openstreetmap', 'osm', 'spain', 'españa', 'map', 'pbf'], popularity: 0.5 },
    { name: 'europe-latest.osm.pbf', size: Math.round(29.4 * GB), kind: 'map', tags: ['openstreetmap', 'osm', 'europe', 'map', 'pbf'], popularity: 0.4 },
    { name: 'enwiki-20250801-pages-articles-multistream.xml.bz2', size: Math.round(23.7 * GB), kind: 'archive', tags: ['wikipedia', 'enwiki', 'dump', 'xml', 'bz2', 'english'], popularity: 0.5 },
    { name: 'eswiki-20250801-pages-articles.xml.bz2', size: Math.round(4.9 * GB), kind: 'archive', tags: ['wikipedia', 'eswiki', 'dump', 'xml', 'bz2', 'spanish'], popularity: 0.4 },
    { name: 'imagenet-object-localization-challenge.zip', size: Math.round(166 * GB), kind: 'archive', tags: ['imagenet', 'dataset', 'machine', 'learning'], popularity: 0.3 },
    { name: 'Common Voice Corpus 17.0 - Spanish (cv-corpus-17.0-es).tar.gz', size: Math.round(21.6 * GB), kind: 'archive', tags: ['common', 'voice', 'mozilla', 'dataset', 'spanish', 'speech'], popularity: 0.3 }
];

/**
 * A 32 hex character "MD4" that is a pure function of the name and size, so a
 * file found by two searches, or added by link, is always the same file to the
 * daemon. FNV-1a spread over four lanes: cheap and stable, not cryptographic.
 */
export function hashOf(name: string, size: number): string {
    const input = `${name}|${size}`;
    let out = '';
    for (let lane = 0; lane < 4; lane++) {
        let hash = 0x811c9dc5 ^ (lane * 0x9e3779b9);
        for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        hash ^= size >>> lane;
        out += (hash >>> 0).toString(16).padStart(8, '0');
    }
    return out.toUpperCase();
}

export function ed2kLinkOf(name: string, size: number, hash: string): string {
    return `ed2k://|file|${encodeURIComponent(name)}|${size}|${hash}|/`;
}
