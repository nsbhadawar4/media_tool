import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The backend lives one level up, outside this directory. Tracing defaults to the
   * Next.js project folder, so without this the compiled backend and its dependencies
   * would be left out of the deployed function and `/api/*` would fail at runtime with
   * a module-not-found.
   */
  outputFileTracingRoot: path.join(__dirname, ".."),

  /**
   * Required by Node at runtime rather than bundled.
   *
   * These resolve their own internals dynamically, or ship a native binary, and a
   * bundler either breaks them or silently drops files they load at runtime. Everything
   * listed here is a dependency of the backend package.
   *
   * `media-tool-backend` itself is deliberately *not* in this list. It is ordinary
   * compiled CommonJS that bundles cleanly, and letting Next bundle it is what makes
   * file tracing follow its `require`s and pull exactly the dependencies it uses into
   * the function. Marking it external instead left the traced bundle missing both its
   * own output and most of its dependencies.
   */
  serverExternalPackages: [
    "express",
    "mongoose",
    "sharp",
    "multer",
    "bcryptjs",
    "jsonwebtoken",
    "helmet",
    "compression",
    "morgan",
    "express-rate-limit",
  ],
};

export default nextConfig;
