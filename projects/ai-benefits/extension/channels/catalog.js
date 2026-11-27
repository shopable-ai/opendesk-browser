import { chatgptPersonal } from './chatgpt-personal.js';
import { googleAIPro } from './google-ai-pro.js';
import { openaiApi } from './openai-api.js';
import { geminiApi } from './gemini-api.js';
import { chatgptBusiness } from './chatgpt-business.js';
import { googleWorkspace } from './google-workspace.js';

export const channels = [
  chatgptPersonal,
  googleAIPro,
  openaiApi,
  geminiApi,
  chatgptBusiness,
  googleWorkspace
];

export function getChannel(channelId) {
  return channels.find((channel) => channel.id === channelId) ?? null;
}

export function getAction(channelId, actionId) {
  const channel = getChannel(channelId);
  return channel?.actions.find((action) => action.id === actionId) ?? null;
}
