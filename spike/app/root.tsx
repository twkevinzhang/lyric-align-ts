import { Links, Meta, Outlet, Scripts } from "react-router";
import type { ReactNode } from "react";
import "./app.css";
export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        <meta charSet="utf-8" />
        <link rel="icon" href="data:," />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Lyric Align · Browser Workspace</title>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
export default function App() {
  return <Outlet />;
}
