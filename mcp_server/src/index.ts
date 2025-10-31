#!/usr/bin/env node

import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from '@modelcontextprotocol/sdk/types.js';

import { db, nowIso } from './db.js';

const addUserJsonSchema = {
  type: 'object',
  properties: {
    ownerid: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1, description: 'The name of the user' }
  },
  required: ['ownerid', 'name'],
  additionalProperties: false
};

const addInvestmentJsonSchema = {
  type: 'object',
  properties: {
    ownerid: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 }
  },
  required: ['ownerid', 'name'],
  additionalProperties: false
};


const userIdJsonSchema = {
  type: 'object',
  properties: { ownerid: { type: 'string', minLength: 1 } },
  required: ['ownerid'],
  additionalProperties: false
};

const addTxJsonSchema = {
  type: 'object',
  properties: {
    owner_id: { type: 'string', minLength: 1 },
    category_id: { type: 'integer', description: 'User ID or investment ID', minimum: 1 },
    amount: { type: 'number', minimum: 0 },
    type: { enum: ['debit', 'credit'] },
    date: { type: 'string', format: 'date-time' }
  },
  required: ['owner_id', 'category_id', 'amount', 'type'],
  additionalProperties: false
};

const listTxJsonSchema = {
  type: 'object',
  properties: {
    owner_id: { type: 'string', minLength: 1 },
    category_id: { type: 'integer', description: 'User ID or investment ID', minimum: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 500 }
  },
  required: ['owner_id', 'category_id'],
  additionalProperties: false
};

class FinanceMCPServer {
  server: Server;

  constructor() {
    this.server = new Server(
      { name: 'finance-mcp-server', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
        console.log("ListToolsRequestSchema");
      return {
        tools: [
          {
            name: 'list_users',
            description: 'Get list of all distinct users (Username and categoryid returned as userid)',
            inputSchema: userIdJsonSchema
          },
          {
            name: "add_user",
            description: 'Add a user.',
            inputSchema: addUserJsonSchema
          },
          {
            name: "add_investment",
            description: 'Add an investment',
            inputSchema: addInvestmentJsonSchema
          },
          {
            name: 'list_investments',
            description: 'Get list of all distinct investments (name and id)',
            inputSchema: userIdJsonSchema
          },
          {
            name: 'add_transaction',
            description: 'Add a transaction',
            inputSchema: addTxJsonSchema
          },
          {
            name: 'list_transactions',
            description: 'List transactions of a user',
            inputSchema: listTxJsonSchema
          },
          {
            name: 'summary',
            description: 'Summary: biggest lender, biggest borrower, total investment left, total lender - total borrower',
            inputSchema: userIdJsonSchema
          }
        ] as Tool[]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const { name, arguments: args } = request.params;
      try {
        switch (name) {
          case 'list_users': {
            const ownerid = String((args as any)?.ownerid ?? '').trim();
            if (!ownerid) throw new Error('ownerid is required');
            const rows = db
              .prepare(
                `SELECT id AS ownerid, name AS username FROM categories WHERE ownerid = ? AND type = 'user' ORDER BY name`
              )
              .all(ownerid) as { ownerid: number; username: string }[];
            return { content: [{ type: 'text', text: JSON.stringify(rows) }] };
          }
          case 'list_investments': {
            const ownerid = String((args as any)?.ownerid ?? '').trim();
            if (!ownerid) throw new Error('ownerid is required');
            const rows = db
              .prepare(
                `SELECT id AS id, name AS investment FROM categories WHERE ownerid = ? AND type = 'investment' ORDER BY name`
              )
              .all(ownerid) as { id: number; investment: string }[];
            return { content: [{ type: 'text', text: JSON.stringify(rows) }] };
          }
          case 'add_transaction': {
            const { owner_id, category_id, amount, type, date } = (args as any) ?? {};
            if (!owner_id || !category_id || typeof amount !== 'number' || !['debit','credit'].includes(type)) {
              throw new Error('Invalid input');
            }
            const cat = db
              .prepare(`SELECT id FROM categories WHERE id = ? AND ownerid = ?`)
              .get(category_id, owner_id) as { id: number } | undefined;
            if (!cat) throw new Error('Invalid category_id for owner_id');
            const when = date ?? nowIso();
            const info = db
              .prepare(
                `INSERT INTO transactions (ownerid, category_id, date, type, amount) VALUES (?, ?, ?, ?, ?)`
              )
              .run(owner_id, category_id, when, type, amount);
            return { content: [{ type: 'text', text: JSON.stringify({ id: Number(info.lastInsertRowid) }) }] };
          }
          case 'list_transactions': {
            const { owner_id, category_id, limit } = (args as any) ?? {};
            if (!owner_id || !category_id) throw new Error('owner_id and category_id are required');
            const rows = db
              .prepare(
                `SELECT amount, date, type FROM transactions WHERE ownerid = ? AND category_id = ? ORDER BY date DESC, id DESC LIMIT ?`
              )
              .all(owner_id, category_id, Number(limit ?? 100)) as { amount: number; date: string; type: string }[];
            return { content: [{ type: 'text', text: JSON.stringify(rows) }] };
          }
          case 'summary': {
            const ownerid = String((args as any)?.ownerid ?? '').trim();
            if (!ownerid) throw new Error('ownerid is required');
            const biggestLender = db
              .prepare(
                `SELECT c.id as category_id, c.name as name, COALESCE(SUM(t.amount),0) as total
                 FROM categories c
                 LEFT JOIN transactions t ON t.category_id = c.id AND t.ownerid = c.ownerid AND t.type = 'credit'
                 WHERE c.ownerid = ? AND c.type = 'user'
                 GROUP BY c.id
                 ORDER BY total DESC, c.name ASC
                 LIMIT 1`
              )
              .get(ownerid) as { category_id: number; name: string; total: number } | undefined;

            const biggestBorrower = db
              .prepare(
                `SELECT c.id as category_id, c.name as name, COALESCE(SUM(t.amount),0) as total
                 FROM categories c
                 LEFT JOIN transactions t ON t.category_id = c.id AND t.ownerid = c.ownerid AND t.type = 'debit'
                 WHERE c.ownerid = ? AND c.type = 'user'
                 GROUP BY c.id
                 ORDER BY total DESC, c.name ASC
                 LIMIT 1`
              )
              .get(ownerid) as { category_id: number; name: string; total: number } | undefined;

            const investmentTotals = db
              .prepare(
                `SELECT COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END),0) as credits,
                        COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END),0) as debits
                 FROM transactions t
                 JOIN categories c ON c.id = t.category_id AND c.ownerid = t.ownerid
                 WHERE t.ownerid = ? AND c.type = 'investment'`
              )
              .get(ownerid) as { credits: number; debits: number } | undefined;
            const totalInvestmentLeft = (investmentTotals?.credits ?? 0) - (investmentTotals?.debits ?? 0);

            const userTotals = db
              .prepare(
                `SELECT COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END),0) as credits,
                        COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END),0) as debits
                 FROM transactions t
                 JOIN categories c ON c.id = t.category_id AND c.ownerid = t.ownerid
                 WHERE t.ownerid = ? AND c.type = 'user'`
              )
              .get(ownerid) as { credits: number; debits: number } | undefined;
            const netLenderMinusBorrower = (userTotals?.credits ?? 0) - (userTotals?.debits ?? 0);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    biggest_lender: biggestLender ?? null,
                    biggest_borrower: biggestBorrower ?? null,
                    total_investment_left: totalInvestmentLeft,
                    total_lender_minus_borrower: netLenderMinusBorrower
                  })
                }
              ]
            };
          }
          case 'add_user': {
            const { ownerid, name } = (args as any) ?? {};
            if (!ownerid || !name) throw new Error('ownerid and name are required');
            const info = db
              .prepare(`INSERT INTO categories (ownerid, name, type) VALUES (?, ?, 'user')`)
              .run(ownerid, name);
            return { content: [{ type: 'text', text: "User added successfully. ID: " + info.lastInsertRowid }]};
          }
          case 'add_investment': {
            const { ownerid, name } = (args as any) ?? {};
            if (!ownerid || !name) throw new Error('ownerid and name are required');
            const info = db
              .prepare(`INSERT INTO categories (ownerid, name, type) VALUES (?, ?, 'investment')`)
              .run(ownerid, name);
            return { content: [{ type: 'text', text: "Investment added successfully. ID: " + info.lastInsertRowid }]};
          }
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        console.error("Error calling tool", error, request);
        return {
          content: [
            { type: 'text', text: `Error: ${error?.message ?? 'Unknown error'}` }
          ],
          isError: true
        };
      }
    });
  }

  async run() {
    if (process.env.TRANSPORT === 'http') {
      const app = express();
      app.use(express.json());
      app.post('/mcp', async (req: any, res: any) => {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true
        });
        res.on('close', () => transport.close());
        await this.server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      });
      const port = Number(process.env.PORT || 3000);
      app.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`Finance MCP Server running on http://localhost:${port}/mcp`);
      });
    } else {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      // eslint-disable-next-line no-console
      console.error('Finance MCP Server running on stdio');
    }
  }
}

const server = new FinanceMCPServer();
server.run().catch(console.error);


