import { z } from 'zod';

// Reason codes for chat_failed system notice
export const ChatFailedReasonSchema = z.enum([
  'session_archived',
  'agent_type_mismatch',
  'session_init_failed',
  'session_restore_failed',
  'session_not_found',
  'memory_pressure',
  'acp_not_ready',
  'agent_disconnected',
  'agent_no_output',
  'turn_pre_prompt_failed',
  'message_delivery_failed',
  'machine_access_denied',
  'acp_auth_required',
  'acp_internal_error',
  'acp_upstream_api_error',
  'acp_provider_overloaded',
  'acp_session_storage_incompatible',
  'acp_resource_not_found',
  'acp_request_cancelled',
  'acp_method_not_found',
  'acp_invalid_params',
  'acp_invalid_request',
  'acp_parse_error',
  'acp_unknown_error',
]);

export const ChatFailedCodeSchema = z.enum(['git_executable_not_found']);
