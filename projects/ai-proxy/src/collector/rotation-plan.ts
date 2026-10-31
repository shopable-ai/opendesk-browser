import {getEnvironment} from '../environment';
import { asObject, normalizeRuleSiteInput } from '../domain/config';
import type { ProxyEndpoint } from '../domain/types';

/** Configuration only. A Chrome MV3 side panel is NOT a task-isolated crawler. */
export const ROTATION_PLAN_KEY = 'aiProxy.collector.rotationPlan.v1';
export interface RotationPlan {
  version: 1;
  targetHost: string;
  threshold: number;
  maxAttempts: number;
  intervalMs: number;
  endpointIds: string[];
  authorizedAt: number;
}
export type RotationPlanDraft = Omit<RotationPlan, 'version' | 'authorizedAt'>;

function boundedInteger(value: unknown, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
    throw new Error(label + ' 超出允许范围');
  return value as number;
}

/** Explicit consent is required on every SAVE; consent never starts a task. */
export function validateRotationPlan(
  raw: unknown, availableEndpoints?: ReadonlyArray<Pick<ProxyEndpoint, 'id'>>
): RotationPlan {
  const item = asObject(raw);
  if (item.version !== 1) throw new Error('采集规则版本不支持');
  if (typeof item.targetHost !== 'string' || item.targetHost.trim().startsWith('*.'))
    throw new Error('采集目标必须是单个有效域名');
  // Store only hostname, never URL paths, query strings or access tokens.
  const targetHost = normalizeRuleSiteInput(item.targetHost);
  const threshold = boundedInteger(item.threshold, 1, 1000, '轮换次数');
  const maxAttempts = boundedInteger(item.maxAttempts, 1, 10000, '尝试总数');
  const intervalMs = boundedInteger(item.intervalMs, 100, 60000, '请求间隔');
  const ids = item.endpointIds;
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 20 ||
      ids.some(id => typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id)) ||
      new Set(ids).size !== ids.length)
    throw new Error('代理池需要 2–20 个不重复的端点');
  if (availableEndpoints && ids.some(id => !availableEndpoints.some(endpoint => endpoint.id === id)))
    throw new Error('代理池中有已删除或不存在的代理，请重新选择');
  if (typeof item.authorizedAt !== 'number' || !Number.isSafeInteger(item.authorizedAt) ||
      item.authorizedAt <= 0 || item.authorizedAt > Date.now() + 60000)
    throw new Error('必须明确确认目标访问授权');
  return {version: 1, targetHost, threshold, maxAttempts, intervalMs,
    endpointIds: [...ids], authorizedAt: item.authorizedAt};
}
export async function readRotationPlan(): Promise<RotationPlan | null> {
  const stored = (await getEnvironment().storage.local.get(ROTATION_PLAN_KEY))[ROTATION_PLAN_KEY] as unknown;
  return stored === undefined ? null : validateRotationPlan(stored);
}
export async function saveRotationPlan(
  draft: RotationPlanDraft, endpoints: ReadonlyArray<Pick<ProxyEndpoint, 'id'>>,
  authorized: boolean
): Promise<RotationPlan> {
  if (!authorized) throw new Error('请确认拥有采集目标的访问授权');
  const plan = validateRotationPlan({...draft, version: 1, authorizedAt: Date.now()}, endpoints);
  await getEnvironment().storage.local.set({[ROTATION_PLAN_KEY]: plan});
  // No task ID / fake progress: saving must NEVER change Chrome proxy settings.
  return plan;
}
export async function clearRotationPlan(): Promise<void> {
  await getEnvironment().storage.local.remove(ROTATION_PLAN_KEY);
}
