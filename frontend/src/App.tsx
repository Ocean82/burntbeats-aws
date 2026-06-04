import { useViewPreloading } from "./views/lazy-view-registry";
import { EditorAppShell } from "./app/editor-app-shell.component";
import { useEditorSession } from "./hooks/app/useEditorSession";

export function App() {
  const session = useEditorSession();
  useViewPreloading(session.activeView);
  return <EditorAppShell session={session} />;
}
