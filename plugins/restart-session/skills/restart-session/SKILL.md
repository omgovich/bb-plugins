---
name: restart-session
description: Explains the Reconnect button in the bb thread header, which releases the agent runtime so MCP servers reconnect. Use when MCP tools vanished after re-authorizing a server, or the user asks how to restart or reconnect a thread's agent.
---

# Reconnect agent

The thread header has a **Reconnect** button. It calls `threads.stop` for the thread: the agent
runtime is released, and the thread history, environment and settings stay. The next message
starts a fresh agent process, so MCP servers connect again and pick up new authorization.

- An agent cannot press it for its own thread mid-turn: stopping ends that turn. Ask the user to
  press it, or to run `bb thread stop <thread id>` from a terminal, then send a message.
- If the agent is working, the button asks before interrupting the turn.
