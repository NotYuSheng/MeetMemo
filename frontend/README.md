# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Scripts

The frontend is written in TypeScript. Common commands (run from `frontend/`):

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server on port 3000 |
| `npm run build` | Type-check (`tsc --noEmit`) and produce a production build |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run the Vitest test suite in watch mode |
| `npm run test:run` | Run the test suite once (used in CI) |
| `npm run test:coverage` | Run tests and report coverage |
| `npm run lint` | Run ESLint |
| `npm run format` | Format the codebase with Prettier |

## Testing

Unit and component tests use [Vitest](https://vitest.dev/) with
[Testing Library](https://testing-library.com/) in a `jsdom` environment. Tests
live next to the code they cover as `*.test.ts` / `*.test.tsx` files. The GitHub
Actions workflow `Frontend CI` runs the type check, tests, and build on every
pull request that touches `frontend/`.
