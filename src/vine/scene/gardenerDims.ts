/**
 * The gardener's skeleton, in rig units (a figure 122 units tall at PATH_Y; drawn scaled by depthScale).
 * Heights are written as positive numbers. The 3D frame is [x right, z toward the viewer, h up]; the figure is
 * drawn in the world's own oblique projection: screen y = world y of the ground point - height, where a step of
 * z along the ground moves a point KAPPA * z down the screen.
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
  /** half the distance between the hip joints and between the shoulder joints */
  HIPW: 4.4,
  SHW: 8,
  UA: 24,
  /** elbow to the wrist; the glove's centre is GLOVE further on */
  FA: 22.5,
  GLOVE: 4.5,
  /** glove centre to the shears' pivot, and pivot to the cut point */
  PIV: 6.5,
  CUT: 9.5,
  /** the apron pocket's mouth, in torso coordinates: forward, to the right, up from the hip */
  POCKET: { a: 6.6, b: 4.6, h: 21 },
};
/** elbow to glove centre */
export const FOREARM = DIM.FA + DIM.GLOVE;
/** elbow to the shears' cut point when the forearm and tool are aligned */
export const ELBOW_CUT = FOREARM + DIM.PIV + DIM.CUT;
/** the rake: pole length and where the two hands hold it (from the head joint) */
export const RAKE = { POLE: 104, LOW: 58, HIGH: 88 };
/** the seated hip height (the bench seat plus a little) */
export const SEAT_HIP = 34;
/**
 * The ground is drawn obliquely: a world y step is KAPPA of the true ground distance toward the viewer. The gait
 * works in true ground units (x, d) with d = world y / KAPPA, so strides are as long walking toward the viewer as
 * across; the world's y moves KAPPA as fast on the screen.
 */
export const KAPPA = 0.4;
/** how far a foot's centre lies either side of the pelvis (feet are this far apart, doubled) */
export const FOOT_W = 3.6;
/** the number of painted views round the vertical axis for the torso, head and boots */
export const VIEWS = 16;
