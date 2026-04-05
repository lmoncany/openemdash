/**
 * AI Copilot Sidebar
 *
 * A slide-out chat panel for interacting with AI agents.
 * Streams responses via SSE from the /api/ai/chat endpoint.
 */

import { Button, Input } from "@cloudflare/kumo";
import { PaperPlaneRight, Robot, Spinner, X } from "@phosphor-icons/react";
import * as React from "react";

import { streamChat, useAgents, type ChatMessage } from "../lib/api/ai";
import { cn } from "../lib/utils";

export interface CopilotSidebarProps {
	open: boolean;
	onClose: () => void;
}

export function CopilotSidebar({ open, onClose }: CopilotSidebarProps) {
	const [messages, setMessages] = React.useState<ChatMessage[]>([]);
	const [input, setInput] = React.useState("");
	const [isStreaming, setIsStreaming] = React.useState(false);
	const [selectedAgent, setSelectedAgent] = React.useState("agent-toto");
	const messagesEndRef = React.useRef<HTMLDivElement>(null);
	const abortRef = React.useRef<AbortController | null>(null);
	const inputRef = React.useRef<HTMLInputElement>(null);

	const { data: agentsData } = useAgents();
	const agents = agentsData?.items ?? [];

	// Auto-scroll to bottom on new messages
	React.useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	// Focus input when opening
	React.useEffect(() => {
		if (open) {
			setTimeout(() => inputRef.current?.focus(), 200);
		}
	}, [open]);

	// Escape key to close
	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && open) {
				onClose();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [open, onClose]);

	const handleSend = React.useCallback(async () => {
		const text = input.trim();
		if (!text || isStreaming) return;

		const userMessage: ChatMessage = {
			id: crypto.randomUUID(),
			role: "user",
			content: text,
			timestamp: new Date().toISOString(),
		};

		const assistantMessage: ChatMessage = {
			id: crypto.randomUUID(),
			role: "assistant",
			content: "",
			timestamp: new Date().toISOString(),
		};

		setMessages((prev) => [...prev, userMessage, assistantMessage]);
		setInput("");
		setIsStreaming(true);

		const controller = new AbortController();
		abortRef.current = controller;

		try {
			await streamChat({
				agentId: selectedAgent,
				message: text,
				signal: controller.signal,
				onToken(token) {
					setMessages((prev) => {
						const last = prev.at(-1);
						if (last?.role === "assistant") {
							return [...prev.slice(0, -1), { ...last, content: last.content + token }];
						}
						return prev;
					});
				},
				onDone() {
					setIsStreaming(false);
				},
				onError(message) {
					setMessages((prev) => {
						const last = prev.at(-1);
						if (last?.role === "assistant") {
							return [...prev.slice(0, -1), { ...last, content: `Error: ${message}` }];
						}
						return prev;
					});
					setIsStreaming(false);
				},
			});
		} catch {
			setIsStreaming(false);
		}
	}, [input, isStreaming, selectedAgent]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void handleSend();
		}
	};

	const handleStop = () => {
		abortRef.current?.abort();
		setIsStreaming(false);
	};

	if (!open) return null;

	const activeAgent = agents.find((a) => a.id === selectedAgent);
	const agentLabel = activeAgent?.name ?? "AI Copilot";
	const agentAvatar = activeAgent?.avatar;

	return (
		<div
			className={cn(
				"fixed inset-y-0 right-0 w-96 bg-kumo-base border-l shadow-xl z-50",
				"flex flex-col",
				"animate-in slide-in-from-right duration-200",
			)}
		>
			{/* Header */}
			<div className="flex items-center justify-between p-4 border-b">
				<div className="flex items-center gap-2">
					{agentAvatar ? (
						<span className="text-lg">{agentAvatar}</span>
					) : (
						<Robot className="h-5 w-5" />
					)}
					<div>
						<h2 className="font-semibold text-sm">{agentLabel}</h2>
						{activeAgent?.role && <p className="text-xs text-kumo-subtle">{activeAgent.role}</p>}
					</div>
				</div>
				<div className="flex items-center gap-1">
					{/* Agent picker */}
					{agents.length > 1 && (
						<select
							value={selectedAgent}
							onChange={(e) => setSelectedAgent(e.target.value)}
							className="text-xs bg-transparent border rounded px-1 py-0.5 mr-1"
						>
							{agents.map((agent) => (
								<option key={agent.id} value={agent.id}>
									{agent.avatar ?? ""} {agent.name}
								</option>
							))}
						</select>
					)}
					<Button variant="ghost" shape="square" aria-label="Close" onClick={onClose}>
						<X className="h-4 w-4" />
					</Button>
				</div>
			</div>

			{/* Messages */}
			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				{messages.length === 0 && (
					<div className="flex flex-col items-center justify-center h-full text-center text-kumo-subtle">
						<Robot className="h-12 w-12 mb-3 opacity-30" />
						<p className="text-sm font-medium">Ask {agentLabel} anything</p>
						<p className="text-xs mt-1">
							Get help writing content, analyzing SEO, or brainstorming ideas.
						</p>
					</div>
				)}

				{messages.map((msg) => (
					<div
						key={msg.id}
						className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
					>
						<div
							className={cn(
								"max-w-[85%] rounded-lg px-3 py-2 text-sm",
								msg.role === "user" ? "bg-kumo-brand text-white" : "bg-kumo-tint",
							)}
						>
							{msg.role === "assistant" && !msg.content && isStreaming && (
								<Spinner className="h-4 w-4 animate-spin" />
							)}
							<div className="whitespace-pre-wrap break-words">{msg.content}</div>
						</div>
					</div>
				))}
				<div ref={messagesEndRef} />
			</div>

			{/* Input */}
			<div className="p-3 border-t">
				<div className="flex gap-2">
					<Input
						ref={inputRef}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={`Message ${agentLabel}...`}
						disabled={isStreaming}
						className="flex-1"
					/>
					{isStreaming ? (
						<Button variant="outline" shape="square" onClick={handleStop} aria-label="Stop">
							<X className="h-4 w-4" />
						</Button>
					) : (
						<Button
							shape="square"
							onClick={() => void handleSend()}
							disabled={!input.trim()}
							aria-label="Send"
						>
							<PaperPlaneRight className="h-4 w-4" />
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}

export default CopilotSidebar;
