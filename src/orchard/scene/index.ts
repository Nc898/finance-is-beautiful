/**
 * "Low-Hanging Fruit" scene (Canvas 2D). Implements OrchardSceneAPI from ../types.
 *
 * The orchestrator (stage.ts) with its two big parts: the young orchards (orchard.ts, an OrchardView per picker)
 * and the pickers with the fruit they handle (picker.ts, a Picker per picker). The world it stands in: sky.ts,
 * world.ts (farm.ts, ground.ts, flowers.ts), the farmer's old tree (farmTree.ts), the props (props.ts) and the air
 * (ambient.ts).
 */
import type { OrchardSceneAPI } from '../types';
import { createOrchardView } from './orchard';
import { createPicker } from './picker';
import { createOrchardStage } from './stage';

export function createOrchardScene(canvas: HTMLCanvasElement): OrchardSceneAPI {
  return createOrchardStage(canvas, { createOrchardView, createPicker });
}
