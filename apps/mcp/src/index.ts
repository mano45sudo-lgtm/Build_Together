#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, registerCueTools } from './cue.js';

const server = new McpServer({ name: 'cue', version: '0.1.0' });
registerCueTools(server, loadConfig(process.env));
await server.connect(new StdioServerTransport());
