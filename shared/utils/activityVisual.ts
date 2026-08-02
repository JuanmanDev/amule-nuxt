/**
 * Turns live transfer activity into the background animation.
 *
 * Kept pure and separate from the component so the mapping (how busy means how
 * many shapes, which direction, which colour weight) can be unit tested.
 */

export type ActivityDirection = 'up' | 'down';

export interface ActivityInput {
    /** KB/s */
    uploadSpeed?: number;
    downloadSpeed?: number;
    /** Number of files currently transferring, when known. */
    uploadFiles?: number;
    downloadFiles?: number;
    /** Speed treated as "fully busy" for the visual scale, in KB/s. */
    fullScale?: number;
}

export interface ActivityShape {
    id: number;
    direction: ActivityDirection;
    /** Regular polygon corner count: 3 triangle, 4 square, 6 hexagon. */
    sides: number;
    /** Percentage across the viewport. */
    left: number;
    size: number;
    /** Seconds for one full drift across the screen. */
    duration: number;
    delay: number;
    /** Seconds for one full rotation; faster transfers spin quicker. */
    spin: number;
    opacity: number;
}

export interface ActivityVisual {
    upIntensity: number;
    downIntensity: number;
    /** 0 = all download, 1 = all upload; 0.5 when idle or balanced. */
    uploadShare: number;
    shapes: ActivityShape[];
}

const MAX_SHAPES = 14;

/** Compressed so a slow transfer is still visible, and clamped to 0..1. */
function intensityOf(speed: number, fullScale: number): number {
    const ratio = Math.min(1, Math.max(0, speed / fullScale));
    return Math.sqrt(ratio);
}

/**
 * Rounds an intensity to quarters before it reaches the animation.
 *
 * A live rate never holds still, and every change to a shape's duration or spin
 * retimes a running CSS animation, which teleports the shape to wherever the new
 * timing says it should be by now. Quarters mean the timing only changes when the
 * transfer really moves to another gear.
 */
function gearOf(intensity: number): number {
    return Math.round(intensity * 4) / 4;
}

/**
 * Shape count follows the busier side, and each file adds one shape so a queue
 * with many transfers looks busier than a single fast one.
 */
function shapeCount(intensity: number, files: number): number {
    if (intensity <= 0 && files <= 0) return 0;
    return Math.min(MAX_SHAPES / 2, Math.max(1, Math.round(intensity * 5 + Math.min(files, 4))));
}

export function buildActivityVisual(input: ActivityInput): ActivityVisual {
    const fullScale = input.fullScale && input.fullScale > 0 ? input.fullScale : 2048;
    const uploadSpeed = Math.max(0, input.uploadSpeed ?? 0);
    const downloadSpeed = Math.max(0, input.downloadSpeed ?? 0);

    const upIntensity = intensityOf(uploadSpeed, fullScale);
    const downIntensity = intensityOf(downloadSpeed, fullScale);
    const totalSpeed = uploadSpeed + downloadSpeed;

    const upCount = shapeCount(upIntensity, input.uploadFiles ?? 0);
    const downCount = shapeCount(downIntensity, input.downloadFiles ?? 0);

    // Deterministic placement: the server and the client must render the same DOM
    const shapes: ActivityShape[] = [];
    const push = (direction: ActivityDirection, count: number, intensity: number) => {
        // Quantised, so a fluctuating rate does not retime the animations
        const gear = gearOf(intensity);

        for (let index = 0; index < count; index++) {
            const seed = shapes.length;
            shapes.push({
                id: seed,
                direction,
                sides: [4, 6, 3][seed % 3]!,
                left: (seed * 17 + (direction === 'up' ? 6 : 53)) % 96,
                size: 5.4 + (seed % 4) * 3.6,
                // Busier means faster travel, but never a blur
                duration: Math.max(6, 26 - gear * 16),
                delay: (seed * 27) % 120 / 10,
                spin: Math.max(4, 22 - gear * 14),
                opacity: 0.035 + gear * 0.085
            });
        }
    };

    push('up', upCount, upIntensity);
    push('down', downCount, downIntensity);

    return {
        upIntensity,
        downIntensity,
        uploadShare: totalSpeed > 0 ? uploadSpeed / totalSpeed : 0.5,
        shapes
    };
}

/** SVG points for a regular polygon inscribed in a unit box, pointing up. */
export function polygonPoints(sides: number, size = 100): string {
    const radius = size / 2;
    const offset = -Math.PI / 2;

    return Array.from({ length: Math.max(3, sides) }, (_, index) => {
        const angle = offset + (index * 2 * Math.PI) / Math.max(3, sides);
        return `${(radius + radius * Math.cos(angle)).toFixed(2)},${(radius + radius * Math.sin(angle)).toFixed(2)}`;
    }).join(' ');
}
