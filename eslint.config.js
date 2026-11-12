import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * The frontend's lint (`npm run lint`, and on every push: .github/workflows/
 * test.yml). It is here to catch mistakes, not to argue about style: the
 * recommended rules of ESLint and typescript-eslint, and the two classic
 * rules of hooks. The code was written to those two already -- every
 * `eslint-disable-next-line react-hooks/exhaustive-deps` in it says why a
 * dependency is left out -- but nothing was checking.
 *
 * Unused names are left to the compiler (`noUnusedLocals` and
 * `noUnusedParameters` in tsconfig.json), which already fails the build on
 * them and knows more about types than a lint rule does.
 */
export default tseslint.config(
  { ignores: ["dist/", "dist-web/", "src-tauri/", "src/web/pkg/", "node_modules/", "content/", "public/", "web-public/"] },
  {
    files: ["src/**/*.{ts,tsx}", "tools/**/*.ts", "vite.config.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",
      // `catch {}` around localStorage is this code's way of saying "private
      // browsing: carry on".
      "no-empty": ["error", { allowEmptyCatch: true }],
      // The no-break and thin spaces written into patterns and strings here
      // are the ones being looked for in a book's text.
      "no-irregular-whitespace": ["error", { skipStrings: true, skipTemplates: true, skipRegExps: true, skipComments: true }],
      // `new Error(message, { cause })` needs ES2022; the app is built for ES2020.
      "preserve-caught-error": "off",
    },
  },
);
