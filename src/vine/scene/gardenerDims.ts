/**
 * The gardener's skeleton, in rig units (a figure 122 units tall at PATH_Y; drawn scaled by depthScale).
 * The rig faces +x with y DOWN and the ground at y = 0; heights are written as positive numbers.
 */
export const DIM = {
  THIGH: 28.5,
  SHIN: 28.5,
  /** ankle joint above the sole */
  FH: 5,
  /** how far a straight leg may extend (the knee is never quite locked) */
  LMAX: 0.975 * 57,
  /** foot contact points, relative to the ankle (x forward): the heel and the ball of the toe */
  HEEL: -5,
  TOE: 11,
  /** hip joint to the base of the neck, and up from the hip to the shoulder joint */
  TORSO: 40,
  SHOULDER: 35,
  UA: 24,
  /** elbow to the wrist; the glove's centre is GLOVE further on */
  FA: 22.5,
  GLOVE: 4.5,
  /** glove centre to the shears' pivot, and pivot to the cut point */
  PIV: 6.5,
  CUT: 9.5,
  /** the apron pocket's mouth, in torso coordinates (x forward, y up the torso is negative) */
  POCKET: { x: 6, y: -19 },
};
/** elbow to glove centre */
export const FOREARM = DIM.FA + DIM.GLOVE;
/** elbow to the shears' cut point when the forearm and tool are aligned */
export const ELBOW_CUT = FOREARM + DIM.PIV + DIM.CUT;
/** the rake: pole length and where the two hands hold it (from the head joint) */
export const RAKE = { POLE: 104, LOW: 58, HIGH: 88 };
/** the seated hip height (the bench seat plus a little) */
export const SEAT_HIP = 34;
