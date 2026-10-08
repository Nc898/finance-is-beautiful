/**
 * Scene rendering contract. Owned by the coordinator — the renderer worker
 * implements it, the app worker consumes it. Escalate any change.
 *
 * The scene never computes money. It receives a maturity (0…1) per tree that the
 * app derived from the financial state via engine/mapping.ts, and draws a
 * deterministic tree for that maturity.
 */
import type { TreeId } from '../engine/types';

/**
 * World coordinates: x right, y UP, ground line at y = 0. Units are arbitrary
 * but shared by both trees — the trees are never scaled independently.
 */
export const WORLD = {
  width: 1000,
  treeX: { A: 300, B: 700 } as Record<TreeId, number>,
  /** Height of a maturity-1 tree from ground to canopy top. */
  matureHeight: 560,
  /** Max canopy width of a maturity-1 tree. */
  matureSpread: 400,
  /**
   * Horizontal span (centered on x = width / 2) the camera fits. Narrower than `width` so both mature
   * crowns (A ≈ 110–490, B ≈ 510–890) fill the frame instead of leaving dead margins.
   */
  fitWidth: 840,
  /** Visible band the camera must always contain (y-up). */
  viewTop: 615,
  viewBottom: -80,
} as const;

export interface TreeVisualState {
  id: TreeId;
  planted: boolean;
  /**
   * Monotonic, deterministic growth parameter from the financial mapping.
   * Same value ⇒ identical structure (branches, leaves, washes) every time.
   */
  maturity: number;
  /** Months since planting (from the shared clock); drives sprout emergence in the first months. */
  monthsSincePlanting: number;
  /** ≥ 0 while contributions are flowing (playing, motion allowed): a bill flies up the tree for each new year of contributions; −1 for none. */
  pulse: number;
  /**
   * Whole years of contributions made so far (0 when the monthly contribution is $0). Each one is a
   * bill resting in the canopy, so the bills are a visible count of money put in while the canopy's
   * size shows the balance. Deterministic: same financial state ⇒ same bills.
   */
  bills: number;
  /** Planting age, for the unplanted marker ("Plants at 35"). */
  startAge: number;
}

export interface SceneFrame {
  /** Wall-clock ms. Used ONLY for decorative wind; never for growth. */
  timeMs: number;
  trees: [TreeVisualState, TreeVisualState];
  reducedMotion: boolean;
  /**
   * Optional camera move for the opening of the story: zoom ≥ 1 about a world-space focus point
   * (x from the world origin, y up from the ground line). Both trees always share it; the app only
   * zooms while a single tree is planted, and is back at 1 before the comparison matters.
   */
  camera?: { zoom: number; focus: { x: number; y: number } };
  /**
   * Optional close-detail loupe (inset magnifier) that reveals craftsmanship without
   * moving the camera. strength 0…1 fades it in/out.
   */
  loupe?: { tree: TreeId; target: 'roots' | 'branches' | 'canopy'; strength: number };
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface TreeAnchors {
  /** Base of trunk at ground line, CSS px relative to the canvas. */
  base: ScreenPoint;
  /** Approximate canopy top for the given maturity, CSS px. */
  top: ScreenPoint;
}

export interface SceneAPI {
  /** Resolves once textures and sprites are generated. */
  ready: Promise<void>;
  /** Call on container resize. Rebuilds cached paper/background at the new size. */
  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void;
  /**
   * Reserve CSS-px bands at the top (header + caption) and bottom (specimen labels)
   * of the canvas. The camera fits the WORLD view band into the remaining area.
   * `side` reserves CSS px of width (a side panel) when choosing the scale only — the world stays centred on
   * the canvas, so the app can slide the canvas by side / 2 when the panel opens without any re-layout.
   * Call on layout changes only (not per frame); the paper backdrop still fills the whole canvas.
   */
  setInsets(insets: { top: number; bottom: number; side?: number }): void;
  render(frame: SceneFrame): void;
  worldToScreen(x: number, y: number): ScreenPoint;
  /** The last frame's camera move as screen' = a * screen + (bx, by) (identity when not zoomed). */
  cameraTransform(): { a: number; bx: number; by: number };
  anchorsFor(id: TreeId, maturity: number): TreeAnchors;
  destroy(): void;
}

export interface SceneOptions {
  /** Distinct seeds give each tree its own individual character. Defaults are fixed. */
  seeds?: Partial<Record<TreeId, number>>;
}

/** Implemented in src/scene/index.ts:  createScene(canvas: HTMLCanvasElement, opts?: SceneOptions): SceneAPI */
