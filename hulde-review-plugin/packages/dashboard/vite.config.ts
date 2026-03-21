import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";

export default defineConfig({
  resolve: {
    alias: {
      "@hulde-review/core/schema": path.resolve(__dirname, "../core/dist/schema.js"),
      "@hulde-review/core/search": path.resolve(__dirname, "../core/dist/search.js"),
      "@hulde-review/core/types": path.resolve(__dirname, "../core/dist/types.js"),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "serve-knowledge-graph",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/knowledge-graph.json") {
            // GRAPH_DIR env var points to the project being analyzed
            // Falls back to monorepo root, then public/ (demo)
            const graphDir = process.env.GRAPH_DIR;
            const candidates = [
              ...(graphDir
                ? [path.resolve(graphDir, ".hulde-review/knowledge-graph.json")]
                : []),
              path.resolve(process.cwd(), ".hulde-review/knowledge-graph.json"),
              path.resolve(process.cwd(), "../../../.hulde-review/knowledge-graph.json"),
            ];
            for (const candidate of candidates) {
              if (fs.existsSync(candidate)) {
                res.setHeader("Content-Type", "application/json");
                fs.createReadStream(candidate).pipe(res);
                return;
              }
            }
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "No knowledge graph found. Run /hulde-review first." }));
            return;
          }
          if (req.url === "/diff-overlay.json") {
            const graphDir = process.env.GRAPH_DIR;
            const candidates = [
              ...(graphDir
                ? [path.resolve(graphDir, ".hulde-review/diff-overlay.json")]
                : []),
              path.resolve(process.cwd(), ".hulde-review/diff-overlay.json"),
              path.resolve(process.cwd(), "../../../.hulde-review/diff-overlay.json"),
            ];
            for (const candidate of candidates) {
              if (fs.existsSync(candidate)) {
                res.setHeader("Content-Type", "application/json");
                fs.createReadStream(candidate).pipe(res);
                return;
              }
            }
            res.statusCode = 404;
            res.end();
            return;
          }
          next();
        });
      },
    },
  ],
});
