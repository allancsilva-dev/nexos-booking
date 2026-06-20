import { baseConfig } from "./packages/config/eslint/base.mjs";
import { nextConfig } from "./packages/config/eslint/next.mjs";

const globalIgnores = {
  ignores: ["apps/api/db/schema/*.js"],
};

const apiConfig = [
  {
    files: ["apps/api/src/**/*.ts"],
    ignores: ["apps/api/src/db/**/*.ts", "apps/api/src/maintenance/**/*.ts", "apps/api/src/realtime/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "pg",
              message:
                "Direct pg access is restricted to apps/api/src/db/. Use DbService instead.",
            },
          ],
          patterns: [
            {
              group: ["pg/*"],
              message:
                "Direct pg access is restricted to apps/api/src/db/. Use DbService instead.",
            },
            {
              group: ["**/system-context", "**/system-context.*"],
              message:
                "withSystemContext is restricted to db (internal), maintenance, and realtime modules. Import it only from apps/api/src/db/system-context.ts within those paths.",
            },
          ],
        },
      ],
    },
  },
];

export default [globalIgnores, ...baseConfig, ...nextConfig, ...apiConfig];
