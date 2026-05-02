import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Request logger
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // API Routes
  const apiRouter = express.Router();

  apiRouter.get("/health", (req, res) => {
    res.json({ 
      status: "ok", 
      time: new Date().toISOString(),
      dbConfigured: !!process.env.DATABASE_URL
    });
  });

  // Clients
  apiRouter.get("/clients", async (req, res) => {
    console.log("API: Fetching clients...");
    try {
      if (!process.env.DATABASE_URL) {
        console.warn("API: DATABASE_URL not found, returning empty list");
        return res.json([]);
      }
      const clients = await prisma.client.findMany({
        orderBy: { createdAt: 'desc' }
      });
      console.log(`API: Found ${clients.length} clients`);
      res.json(clients);
    } catch (error) {
      console.error("API: Prisma error fetching clients:", error);
      res.status(500).json({ 
        error: "Failed to fetch clients", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  apiRouter.post("/clients", async (req, res) => {
    console.log("API: Creating client...");
    try {
      if (!process.env.DATABASE_URL) {
        return res.status(503).json({ error: "Database not configured. Please add DATABASE_URL." });
      }
      const client = await prisma.client.create({
        data: req.body
      });
      res.json(client);
    } catch (error) {
      console.error("API: Prisma error creating client:", error);
      res.status(500).json({ error: "Failed to create client", details: error instanceof Error ? error.message : String(error) });
    }
  });

  apiRouter.delete("/clients/:id", async (req, res) => {
    console.log(`API: Deleting client ${req.params.id}...`);
    try {
      if (!process.env.DATABASE_URL) throw new Error("DB not configured");
      await prisma.client.delete({
        where: { id: parseInt(req.params.id) }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("API: Prisma error deleting client:", error);
      res.status(500).json({ error: "Failed to delete client" });
    }
  });

  // Messages
  apiRouter.get("/messages", async (req, res) => {
    const { type } = req.query;
    console.log(`API: Fetching messages (type: ${type})...`);
    try {
      if (!process.env.DATABASE_URL) {
        console.warn("API: DATABASE_URL not found, returning empty list");
        return res.json([]);
      }
      const messages = await prisma.message.findMany({
        where: type ? { type: String(type) } : {},
        orderBy: { createdAt: 'asc' }
      });
      res.json(messages);
    } catch (error) {
      console.error("API: Prisma error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages", details: error instanceof Error ? error.message : String(error) });
    }
  });

  apiRouter.post("/messages", async (req, res) => {
    console.log("API: Saving message...");
    try {
      if (!process.env.DATABASE_URL) {
        return res.status(503).json({ error: "Database not configured" });
      }
      const message = await prisma.message.create({
        data: req.body
      });
      res.json(message);
    } catch (error) {
      console.error("API: Prisma error saving message:", error);
      res.status(500).json({ error: "Failed to save message" });
    }
  });

  // Mount the API router
  app.use("/api", apiRouter);

  // API 404 handler - prevents falling through to SPA fallback
  app.all("/api/*", (req, res) => {
    console.warn(`API: Route not found: ${req.method} ${req.url}`);
    res.status(404).json({ 
      error: "Not Found", 
      message: `API route ${req.method} ${req.url} not found`,
      availableRoutes: ["/api/health", "/api/clients", "/api/messages"]
    });
  });

  log("startServer finished, returning app");
  return app;
}

// Start the server
const app = await startServer();
app.listen(3000, "0.0.0.0", () => {
  console.log("-----------------------------------------");
  console.log("Server listening on http://0.0.0.0:3000");
  console.log("NODE_ENV: " + process.env.NODE_ENV);
  console.log("DATABASE_URL present? " + !!process.env.DATABASE_URL);
  console.log("-----------------------------------------");
});

// Post-start async initialization
if (process.env.NODE_ENV !== "production") {
  console.log("Initializing Vite dev server asynchronously...");
  createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  }).then(vite => {
    app.use(vite.middlewares);
    console.log("Vite dev server attached to Express");
  }).catch(err => {
    console.error("Failed to initialize Vite:", err);
  });
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}
