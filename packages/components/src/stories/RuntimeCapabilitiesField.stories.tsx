import type { Meta, StoryObj } from '@storybook/react';
import { RuntimeCapabilitiesField } from '../components/settings/runtime-capabilities-field';
const meta = { title: 'Settings/Runtime capabilities', component: RuntimeCapabilitiesField } satisfies Meta<typeof RuntimeCapabilitiesField>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Prerequisites: Story = { args: { onRequest: async () => ({ success: true, result: { capabilities: [{ id: 'kimi-cu', displayName: 'Computer Use', description: 'Runtime-owned computer interaction', supported: true, state: 'partial', steps: [{ id: 'permissions', state: 'missing' }], install: { running: false } }] } }) } };
export const Unsupported: Story = { args: { onRequest: async () => ({ success: false, error: 'Agent did not advertise runtime capability management' }) } };
