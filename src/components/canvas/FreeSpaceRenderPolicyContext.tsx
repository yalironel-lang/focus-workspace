import { createContext, useContext, type ReactNode } from 'react';
import {
  DEFAULT_BLOCK_RENDER_POLICY,
  type BlockRenderPolicy,
  type CanvasScaleContext,
} from '../../lib/freeSpaceScalePolicy';

const PolicyMapContext = createContext<Map<string, BlockRenderPolicy>>(new Map());
const ScaleContextRef = createContext<CanvasScaleContext | null>(null);

export function FreeSpaceRenderPolicyProvider({
  policies,
  scaleContext,
  children,
}: {
  policies: Map<string, BlockRenderPolicy>;
  scaleContext: CanvasScaleContext;
  children: ReactNode;
}) {
  return (
    <ScaleContextRef.Provider value={scaleContext}>
      <PolicyMapContext.Provider value={policies}>{children}</PolicyMapContext.Provider>
    </ScaleContextRef.Provider>
  );
}

export function useFreeSpaceRenderPolicy(objectId: string): BlockRenderPolicy {
  const map = useContext(PolicyMapContext);
  return map.get(objectId) ?? DEFAULT_BLOCK_RENDER_POLICY;
}

export function useFreeSpaceScaleContext(): CanvasScaleContext | null {
  return useContext(ScaleContextRef);
}
