## Financial MCP HTTP Server

Run an HTTP MCP server backed by SQLite to manage categories and transactions for a smart financial assistant.

### Install

```bash
npm install
```

### Develop

```bash
npm run dev
```

### Build & Run

```bash
npm run build
npm start
```

The server listens on `http://localhost:3000` by default.

### Database Schema

- `categories`: `userid` (string), `id` (PK), `name` (string), `type` ("investment" | "user")
- `transactions`: `userid` (string), `id` (PK), `category_id` (FK -> categories.id), `date` (ISO string), `type` ("debit" | "credit"), `amount` (number)

### MCP HTTP Endpoints

- `GET /tools`
  - Lists tools and their JSON schemas.

- `POST /invoke`
  - Body: `{ "name": string, "arguments": object }`
  - Returns `{ ok: true, data }` or `{ ok: false, error }`

### Tools

1) `list_users`
   - Input: `{ userid: string }`
   - Output: `[{ userid: number, username: string }]`

2) `list_investments`
   - Input: `{ userid: string }`
   - Output: `[{ id: number, investment: string }]`

3) `add_transaction`
   - Input:
     ```json
     {
       "user_id": "string",
       "category_id": 1,
       "amount": 1000,
       "type": "debit" | "credit",
       "date": "2025-01-01T00:00:00.000Z" // optional
     }
     ```
   - Output: `{ id: number }`

4) `list_transactions`
   - Input: `{ user_id: string, category_id: number, limit?: number }`
   - Output: `[{ amount: number, date: string, type: "debit" | "credit" }]`

5) `summary`
   - Input: `{ userid: string }`
   - Output:
     ```json
     {
       "biggest_lender": { "category_id": 1, "name": "Alice", "total": 5000 } | null,
       "biggest_borrower": { "category_id": 2, "name": "Bob", "total": 3000 } | null,
       "total_investment_left": 12000,
       "total_lender_minus_borrower": 2000
     }
     ```

### Notes

- Create categories via inserting into `categories` table; transactions reference a `category_id` that belongs to the same `userid`.
- All computations are per `userid` and isolated between users.



