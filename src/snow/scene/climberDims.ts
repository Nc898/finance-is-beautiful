/**
 * Constants of the climber's figure and stage that the director, the painting and the scene share. The skeleton is
 * the vine gardener's (gardenerDims.ts, in rig units); the climber is drawn at UNIT of the gardener's scale so the
 * woolly hat comes to CLIMBER_H (80) from the boots at PATH_Y.
 */
import { REST } from './geom';

/** rig unit -> world units at PATH_Y */
export const UNIT = 0.62;
/** the scale the sledge is painted at, against the climber's (it was drawn for UNIT 0.95) */
export const SLEDGE_K = UNIT / 0.95;

/** a seated climber's hip joint above the sledge's seat top is about this; the hips sit over REST, the feet a stride toward the viewer */
export const SLEDGE_SEAT_H = 14;
/** the hips' height when seated (rig units: the seat plus the thigh's thickness) */
export const SEAT_HIP_H = SLEDGE_SEAT_H + 4;
/** the hips go this far behind the standing pelvis when sitting (rig units): the feet stay planted this far in front of the hips */
export const SIT_BACK = 30;

/** where each climber stands at the very start (idle), at the top of its hill between the lanes */
export const IDLE_SPOT = {
  snowball: { x: 190, y: 304 },
  avalanche: { x: 810, y: 304 },
} as const;

/** the spot where the hips come to rest when seated (REST); exported for the scene's sledge */
export const SEAT_AT = REST;

/** the standoff angle (rad): the climber stands this far round from straight behind the ball, facing its centre */
export const PUSH_ANGLE = 0.0;
