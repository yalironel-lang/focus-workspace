import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { GlobalTheme } from '../../hooks/useWorkspaceTheme';
import { resolveBackgroundStudio } from '../workspaceBackgroundStudio';
import {
  applyClarityReactions,
  applyCosmicReactions,
  computeEnvironmentReactions,
} from './livingReactionEngine';
import type { EnvironmentInput, LivingEnvironmentSnapshot } from './livingEnvironmentTypes';
import { getLivingWorld } from './livingWorldRegistry';
import { resolveBackgroundPresetId } from '../workspaceBackgroundStudio';

export function resolveLivingEnvironment(
  global: GlobalTheme,
  atmTokens: AtmosphereTokens,
  input: EnvironmentInput,
): LivingEnvironmentSnapshot {
  const studio = resolveBackgroundStudio(global, atmTokens);
  const presetId = resolveBackgroundPresetId(global);
  const world = getLivingWorld(presetId);
  const reactions = computeEnvironmentReactions(world, input);
  const cosmic = applyCosmicReactions(studio.cosmic, reactions);
  const clarity = applyClarityReactions(studio.clarity, reactions);

  return {
    studio,
    world,
    reactions,
    cosmic,
    clarity,
    connectionMul: studio.connectionMul,
    minimapContrast: studio.minimapContrast,
  };
}
