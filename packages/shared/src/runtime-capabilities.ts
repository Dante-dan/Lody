import { z } from 'zod';
import { isRuntimeCapabilitiesResponse, type RuntimeCapabilitiesResponse } from 'acp-extension-core';
export const RuntimeCapabilitiesRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }).strict(),
  z.object({ action: z.literal('get'), id: z.string().min(1).max(256) }).strict(),
  z.object({ action: z.literal('install'), id: z.string().min(1).max(256), confirmed: z.literal(true) }).strict(),
]);
export type RuntimeCapabilitiesRequest = z.infer<typeof RuntimeCapabilitiesRequestSchema>;
export const MachineRuntimeCapabilitiesResponseSchema = z.discriminatedUnion('success', [
  z.object({ success: z.literal(true), result: z.custom<RuntimeCapabilitiesResponse>(isRuntimeCapabilitiesResponse) }).strict(),
  z.object({ success: z.literal(false), error: z.string() }).strict(),
]);
export type MachineRuntimeCapabilitiesResponse = z.infer<typeof MachineRuntimeCapabilitiesResponseSchema>;
