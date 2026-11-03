import { MatterError } from '@/core/matterSetup';
import type { MatterSetup } from '@/core/matterSetup';
import { parseMatterCode } from '../codes';
import type { MatterController } from '../controller';

/** What screens use to add a Matter device: parse a typed code, then commission it. */
export function createMatterSetup(controller: MatterController): MatterSetup {
  return {
    available: () => controller.available(),
    parseCode: parseMatterCode,
    async commission(code, onStep) {
      if (!controller.available()) throw new MatterError('unavailable');
      const payload = code.kind === 'qr' ? code.payload : code.digits;
      const { nodeId } = await controller.commission(payload, onStep);
      return { kind: 'matter', nodeId };
    },
  };
}
