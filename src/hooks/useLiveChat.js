// Thin React wrapper over the framework-free LiveChatClient.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { LiveChatClient } from '../lib/live-chat-client';
import { isEscalationRequest as matchesEscalationPhrase } from '../lib/escalation-phrases';

export function useLiveChat(options) {
  // One client per mounted hook; nothing read from or written to it during render.
  const [client] = useState(() => new LiveChatClient({ pageUrl: options.pageUrl }));

  // Keep callbacks and page path current after every render (no stale closures).
  useEffect(() => {
    client.setPageUrl(options.pageUrl);
    client.setCallbacks({
      onAgentMessage: options.onAgentMessage,
      onStatusChange: options.onStatusChange,
      onConnectionTimeout: options.onConnectionTimeout,
      onUnavailable: options.onUnavailable,
    });
  });

  const state = useSyncExternalStore(client.subscribe, client.getState, client.getState);

  // Presence is live: on mount, on focus/visibility, and (inside the client)
  // right before escalating.
  useEffect(() => {
    client.refreshPresence();
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      client.refreshPresence();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      client.dispose();
    };
  }, [client]);

  const isEscalationRequest = useCallback((message) => matchesEscalationPhrase(message), []);
  const startEscalation = useCallback(
    (chatHistory, turnstileToken, chatSessionToken) => client.startEscalation(chatHistory, turnstileToken, chatSessionToken),
    [client]
  );
  const resume = useCallback((sessionId) => client.resume(sessionId), [client]);
  const sendMessage = useCallback((content) => client.sendMessage(content), [client]);
  const endChat = useCallback((reason) => client.endChat(reason), [client]);

  return {
    status: state.status,
    sessionId: state.sessionId,
    endReason: state.endReason,
    messages: state.messages,
    isAgentAvailable: state.isAgentAvailable,
    isAgentTyping: state.isAgentTyping,
    isEscalationRequest,
    startEscalation,
    resume,
    sendMessage,
    endChat,
  };
}

export default useLiveChat;
