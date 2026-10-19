import { lazy, Suspense, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AdminProvider } from "@/contexts/AdminContext";
import { ContentProvider } from "@/contexts/ContentContext";
import PageAccessGuard from "@/components/admin/PageAccessGuard";
import SiteStatusRedirect from "@/components/SiteStatusRedirect";
import SiteShell from "@/ui/SiteShell";
import AdminShell from "@/ui/AdminShell";
import RouteErrorBoundary from "@/ui/RouteErrorBoundary";
import {
  HomePage,
  EventsPage,
  EventDetailPage,
  TeamPage,
  ResourcesPage,
  SponsorsPage,
  GalleryPage,
  ContactPage,
  NotFoundPage,
  InfoPage,
} from "@/ui/PublicPages";

const Overview = lazy(() => import("@/ui/AdminOverview"));
const Forms = lazy(() => import("@/ui/forms/FormsLibrary"));
const FormBuilder = lazy(() => import("@/ui/forms/FormBuilder"));
const FormResponses = lazy(() => import("@/ui/forms/FormResponses"));
const PublicForm = lazy(() => import("@/ui/forms/PublicForm"));
const Linktree = lazy(() => import("@/pages/Linktree"));
const NewsletterTokenPage = lazy(() => import("@/ui/NewsletterTokenPage"));
const AcceptInvite = lazy(() => import("@/pages/admin/AcceptInvite"));

// Preserve every existing workflow and load heavy editors only on their routes.
const adminRoutes = [
  ["content", lazy(() => import("@/pages/AdminContent"))],
  ["events", lazy(() => import("@/pages/admin/AdminEvents"))],
  ["team", lazy(() => import("@/pages/admin/AdminTeam"))],
  ["projects", lazy(() => import("@/pages/admin/AdminProjects"))],
  ["members", lazy(() => import("@/pages/admin/AdminMembers"))],
  ["resources", lazy(() => import("@/pages/admin/AdminResources"))],
  ["newsletter", lazy(() => import("@/pages/admin/AdminNewsletter"))],
  ["blog", lazy(() => import("@/pages/admin/AdminBlog"))],
  ["users", lazy(() => import("@/pages/admin/AdminUsers"))],
  ["profile", lazy(() => import("@/pages/admin/AdminProfile"))],
  ["sponsors", lazy(() => import("@/pages/admin/AdminSponsors"))],
  ["communications", lazy(() => import("@/pages/admin/AdminCommunications"))],
  ["media", lazy(() => import("@/pages/admin/AdminMedia"))],
  ["guide", lazy(() => import("@/ui/WorkspaceGuide"))],
  ["linktree", lazy(() => import("@/pages/admin/AdminLinktree"))],
  ["site-status", lazy(() => import("@/pages/admin/AdminSiteStatus"))],
  ["teams", lazy(() => import("@/pages/admin/AdminTeams"))],
  ["channels", lazy(() => import("@/pages/admin/AdminChannels"))],
  ["whiteboard", lazy(() => import("@/pages/admin/AdminWhiteboard"))],
  ["gallery", lazy(() => import("@/pages/admin/AdminGallery"))],
  ["finances", lazy(() => import("@/pages/admin/AdminFinances"))],
  ["audit-log", lazy(() => import("@/pages/admin/AdminAuditLog"))],
  ["team/:teamId", lazy(() => import("@/pages/admin/TeamDashboard"))],
  ["blog-editor", lazy(() => import("@/pages/admin/BlogEditorDashboard"))],
  ["blog-media", lazy(() => import("@/pages/admin/BlogEditorMedia"))],
] as const;
const queryClient = new QueryClient();
function LoadingPage() {
  return (
    <div
      className="gt-container gt-route-loading"
      role="status"
      aria-label="Loading page"
    >
      <div className="gt-skeleton gt-loading-heading" />
      <div className="gt-skeleton gt-detail-skeleton" />
      <span className="sr-only">Loading page…</span>
    </div>
  );
}
function Frame({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/invite/") ? (
    <AdminShell>
      <RouteErrorBoundary key={pathname}>{children}</RouteErrorBoundary>
    </AdminShell>
  ) : (
    <SiteShell>
      <RouteErrorBoundary key={pathname}>{children}</RouteErrorBoundary>
    </SiteShell>
  );
}
function protectedPage(children: ReactNode) {
  return <PageAccessGuard>{children}</PageAccessGuard>;
}
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminProvider>
        <ContentProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter
              future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
              <SiteStatusRedirect>
                <Frame>
                  <Suspense fallback={<LoadingPage />}>
                    <Routes>
                      <Route path="/" element={<HomePage />} />
                      <Route path="/events" element={<EventsPage />} />
                      <Route
                        path="/events/:slug"
                        element={<EventDetailPage />}
                      />
                      <Route path="/team" element={<TeamPage />} />
                      <Route path="/resources" element={<ResourcesPage />} />
                      <Route path="/sponsors" element={<SponsorsPage />} />
                      <Route path="/gallery" element={<GalleryPage />} />
                      <Route path="/contact" element={<ContactPage />} />
                      <Route path="/forms/:slug" element={<PublicForm />} />
                      <Route path="/l/:username" element={<Linktree />} />
                      <Route
                        path="/newsletter/confirm"
                        element={<NewsletterTokenPage kind="confirm" />}
                      />
                      <Route
                        path="/newsletter/unsubscribe"
                        element={<NewsletterTokenPage kind="unsubscribe" />}
                      />
                      <Route
                        path="/privacy"
                        element={<InfoPage kind="privacy" />}
                      />
                      <Route
                        path="/accessibility"
                        element={<InfoPage kind="accessibility" />}
                      />
                      <Route
                        path="/offline"
                        element={<InfoPage kind="offline" />}
                      />
                      <Route
                        path="/maintenance"
                        element={<InfoPage kind="maintenance" />}
                      />
                      <Route
                        path="/admin"
                        element={protectedPage(<Overview />)}
                      />
                      {adminRoutes.map(([path, Component]) => (
                        <Route
                          key={path}
                          path={`/admin/${path}`}
                          element={protectedPage(<Component />)}
                        />
                      ))}
                      <Route
                        path="/admin/forms"
                        element={protectedPage(<Forms />)}
                      />
                      <Route
                        path="/admin/forms/:formId/edit"
                        element={protectedPage(<FormBuilder />)}
                      />
                      <Route
                        path="/admin/forms/:formId/responses"
                        element={protectedPage(<FormResponses />)}
                      />
                      <Route
                        path="/admin/invite/:token"
                        element={<AcceptInvite />}
                      />
                      <Route
                        path="/admin/blog-comments"
                        element={
                          <Navigate to="/admin/blog?tab=comments" replace />
                        }
                      />
                      <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                  </Suspense>
                </Frame>
              </SiteStatusRedirect>
            </BrowserRouter>
          </TooltipProvider>
        </ContentProvider>
      </AdminProvider>
    </QueryClientProvider>
  );
}
