import type { NextConfig } from "next";

const config: NextConfig = {
	distDir: process.env.NEXT_DIST_DIR || ".next",
	// keeper: the web app runs keeper passes itself (lib/keeperRunner.ts).
	transpilePackages: ["@bozbasket/shared", "keeper"],
	serverExternalPackages: ["pg"],
};

export default config;
