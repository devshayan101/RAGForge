import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ documentName: string; pageNo?: number; text: string }>;
  timestamp: Date;
}

interface ChatState {
  messages: Message[];
  query: string;
  systemPrompt: string;
}

interface ChatContextType {
  chats: Record<number, ChatState>;
  setMessages: (versionId: number, messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setQuery: (versionId: number, query: string) => void;
  setSystemPrompt: (versionId: number, systemPrompt: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<Record<number, ChatState>>(() => {
    // Initialize from localStorage immediately to avoid flash of empty chat
    const saved = typeof window !== "undefined" ? localStorage.getItem("ragforge_chats") : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        Object.values(parsed).forEach((chat: any) => {
          chat.messages.forEach((msg: any) => {
            msg.timestamp = new Date(msg.timestamp);
          });
          // Ensure systemPrompt exists for old saved states
          if (chat.systemPrompt === undefined) {
            chat.systemPrompt = "";
          }
        });
        return parsed;
      } catch (e) {
        console.error("Failed to parse saved chats", e);
      }
    }
    return {};
  });

  // Save to localStorage when chats change
  useEffect(() => {
    localStorage.setItem("ragforge_chats", JSON.stringify(chats));
  }, [chats]);

  const setMessages = useCallback((versionId: number, messagesOrFn: Message[] | ((prev: Message[]) => Message[])) => {
    setChats((prev) => {
      const currentChat = prev[versionId] || { messages: [], query: "", systemPrompt: "" };
      const newMessages = typeof messagesOrFn === "function" ? messagesOrFn(currentChat.messages) : messagesOrFn;
      return {
        ...prev,
        [versionId]: {
          ...currentChat,
          messages: newMessages,
        },
      };
    });
  }, []);

  const setQuery = useCallback((versionId: number, query: string) => {
    setChats((prev) => {
      const currentChat = prev[versionId] || { messages: [], query: "", systemPrompt: "" };
      return {
        ...prev,
        [versionId]: {
          ...currentChat,
          query,
        },
      };
    });
  }, []);

  const setSystemPrompt = useCallback((versionId: number, systemPrompt: string) => {
    setChats((prev) => {
      const currentChat = prev[versionId] || { messages: [], query: "", systemPrompt: "" };
      return {
        ...prev,
        [versionId]: {
          ...currentChat,
          systemPrompt,
        },
      };
    });
  }, []);

  const value = useMemo(() => ({ chats, setMessages, setQuery, setSystemPrompt }), [chats, setMessages, setQuery, setSystemPrompt]);

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(versionId: number) {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }

  const state = context.chats[versionId] || { messages: [], query: "", systemPrompt: "" };
  
  return {
    messages: state.messages,
    query: state.query,
    systemPrompt: state.systemPrompt,
    setMessages: useCallback((messages: Message[] | ((prev: Message[]) => Message[])) => context.setMessages(versionId, messages), [context, versionId]),
    setQuery: useCallback((query: string) => context.setQuery(versionId, query), [context, versionId]),
    setSystemPrompt: useCallback((prompt: string) => context.setSystemPrompt(versionId, prompt), [context, versionId]),
  };
}
