import type { NextConfig } from "next";

const config: NextConfig = {
	distDir: process.env.NEXT_DIST_DIR || ".next",
	transpilePackages: ["@bozbasket/shared"],
	serverExternalPackages: ["pg"],
};

export default config;
