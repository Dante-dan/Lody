import { lazyRouteComponent } from '@tanstack/react-router';

// Share each tab's lazy component between routes and the desktop overlay.
// Declaring these imports does not load a tab until it is rendered or preloaded.
export const GeneralSettingsComponent = lazyRouteComponent(
  () => import('./general-setting'),
  'GeneralSettingsComponent'
);

export const AppearanceSettingsComponent = lazyRouteComponent(
  () => import('./appearance-setting'),
  'AppearanceSettingsComponent'
);

export const AccountSettingsComponent = lazyRouteComponent(
  () => import('./account-setting'),
  'AccountSettingsComponent'
);

export const BillingSettingsComponent = lazyRouteComponent(
  () => import('./billing-setting'),
  'BillingSettingsComponent'
);

export const StatsSettingsComponent = lazyRouteComponent(
  () => import('./stats-setting'),
  'StatsSettingsComponent'
);

export const ProjectSettingsComponent = lazyRouteComponent(
  () => import('./project-settings'),
  'ProjectSettingsComponent'
);

export const MachineAgentSettings = lazyRouteComponent(
  () => import('./machine-agent-settings'),
  'MachineAgentSettings'
);

export const IntegrationsSettingsComponent = lazyRouteComponent(
  () => import('./integrations-setting'),
  'IntegrationsSettingsComponent'
);

export const KeyboardShortcutsSetting = lazyRouteComponent(
  () => import('./keyboard-shortcuts-setting'),
  'KeyboardShortcutsSetting'
);

export const AboutSettingsComponent = lazyRouteComponent(
  () => import('./about-setting'),
  'AboutSettingsComponent'
);

export const AgentRolesSetting = lazyRouteComponent(
  () => import('./agent-roles-setting'),
  'AgentRolesSetting'
);

export const PromptShortcutsSetting = lazyRouteComponent(
  () => import('./prompt-shortcuts-setting'),
  'PromptShortcutsSetting'
);

export const McpSetting = lazyRouteComponent(() => import('./mcp-setting'), 'McpSetting');

export const ShareManagementSetting = lazyRouteComponent(
  () => import('./share-management-setting'),
  'ShareManagementSetting'
);
