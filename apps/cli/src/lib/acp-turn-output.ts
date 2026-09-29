import type { AcpSessionNotification } from '@lody/shared';

/** Session configuration and user echoes do not constitute an agent response. */
export function isContentBearingACPUpdate(notification: AcpSessionNotification): boolean {
  const updateType: string = notification.update.sessionUpdate;
  switch (updateType) {
    case 'available_commands_update':
    case 'config_option_update':
    case 'current_mode_update':
    case 'model_changed':
    case 'session_info_update':
    case 'usage_update':
    case 'user_message_chunk':
      return false;
    default:
      // Unknown updates fail open: do not mark a turn failed if a newer agent
      // may have emitted user-visible content that this client cannot classify.
      return true;
  }
}
