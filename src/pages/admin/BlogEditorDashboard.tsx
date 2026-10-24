import { useSearchParams } from "react-router-dom";
import BlogWorkspace from "@/ui/blog/BlogWorkspace";
import PersonalWork from "@/ui/PersonalWork";
export default function BlogEditorDashboard() {
  const [params] = useSearchParams(),
    view = params.get("view");
  return view === "tasks" || view === "messages" ? (
    <PersonalWork view={view} editorial />
  ) : (
    <BlogWorkspace editorial />
  );
}
