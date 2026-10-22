import { lazy, Suspense, type ReactNode } from "react";
import {
  createBrowserRouter,
  RouterProvider,
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
import NavigationSafety from "@/ui/NavigationSafety";
import { PwaUpdateNotice } from "@/pwa/PwaControls";
import { QueueRuntime } from "@/pwa/SubmissionQueue";
import { MaintenancePage } from "@/ui/status/SiteAvailability";
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
const FormResponses = lazy(() => import("@/ui/forms/ResponseWorkspace"));
const PublicForm = lazy(() => import("@/ui/forms/PublicForm"));
const Linktree = lazy(() => import("@/pages/Linktree"));
const NewsletterTokenPage = lazy(() => import("@/ui/NewsletterTokenPage"));
const AcceptInvite = lazy(() => import("@/ui/teams/AcceptTeamInvitation"));
const AccountSetup = lazy(() => import("@/ui/users/AccountSetup"));

// Preserve every existing workflow and load heavy editors only on their routes.
const adminRoutes = [
  ["content", lazy(() => import("@/ui/content/SiteContentWorkspace"))],
  ["events", lazy(() => import("@/ui/EventWorkspace"))],
  [
    "team",
    lazy(() =>
      import("@/ui/content/CollectionWorkspace").then((module) => ({
        default: module.PublicTeamWorkspace,
      })),
    ),
  ],
  ["projects", lazy(() => import("@/pages/admin/AdminProjects"))],
  ["members", lazy(() => import("@/pages/admin/AdminMembers"))],
  [
    "resources",
    lazy(() =>
      import("@/ui/content/CollectionWorkspace").then((module) => ({
        default: module.ResourceWorkspace,
      })),
    ),
  ],
  ["newsletter", lazy(() => import("@/ui/newsletter/NewsletterWorkspace"))],
  ["blog", lazy(() => import("@/pages/admin/AdminBlog"))],
  ["users", lazy(() => import("@/ui/users/UserWorkspace"))],
  ["profile", lazy(() => import("@/ui/ProfileWorkspace"))],
  [
    "sponsors",
    lazy(() =>
      import("@/ui/content/CollectionWorkspace").then((module) => ({
        default: module.SponsorWorkspace,
      })),
    ),
  ],
  [
    "communications",
    lazy(() => import("@/ui/communications/CommunicationsWorkspace")),
  ],
  ["media", lazy(() => import("@/ui/media/MediaWorkspace"))],
  ["guide", lazy(() => import("@/ui/WorkspaceGuide"))],
  ["linktree", lazy(() => import("@/pages/admin/AdminLinktree"))],
  ["site-status", lazy(() => import("@/pages/admin/AdminSiteStatus"))],
  ["teams", lazy(() => import("@/ui/teams/TeamWorkspace"))],
  ["channels", lazy(() => import("@/ui/channels/ChannelWorkspace"))],
  ["whiteboard", lazy(() => import("@/ui/whiteboards/WhiteboardWorkspace"))],
  [
    "gallery",
    lazy(() =>
      import("@/ui/media/MediaWorkspace").then((module) => ({
        default: module.GalleryWorkspace,
      })),
    ),
  ],
  ["finances", lazy(() => import("@/pages/admin/AdminFinances"))],
  ["audit-log", lazy(() => import("@/ui/AuditWorkspace"))],
  ["privacy", lazy(() => import("@/ui/PrivacyWorkspace"))],
  ["operations", lazy(() => import("@/ui/OperationsWorkspace"))],
  ["team/:teamId", lazy(() => import("@/ui/teams/TeamWorkspace"))],
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
function RoutedApplication() {
  return (
    <NavigationSafety>
      <PwaUpdateNotice />
      <QueueRuntime />
      <SiteStatusRedirect>
        <Frame>
          <Suspense fallback={<LoadingPage />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/events/:slug" element={<EventDetailPage />} />
              <Route path="/team" element={<TeamPage />} />
              <Route path="/team/join" element={<AcceptInvite />} />
              <Route path="/resources" element={<ResourcesPage />} />
              <Route path="/sponsors" element={<SponsorsPage />} />
              <Route path="/gallery" element={<GalleryPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/forms/:slug" element={<PublicForm />} />
              <Route path="/account/setup" element={<AccountSetup />} />
              <Route path="/l/:username" element={<Linktree />} />
              <Route
                path="/newsletter/confirm"
                element={<NewsletterTokenPage kind="confirm" />}
              />
              <Route
                path="/newsletter/unsubscribe"
                element={<NewsletterTokenPage kind="unsubscribe" />}
              />
              <Route path="/privacy" element={<InfoPage kind="privacy" />} />
              <Route
                path="/accessibility"
                element={<InfoPage kind="accessibility" />}
              />
              <Route path="/offline" element={<InfoPage kind="offline" />} />
              <Route path="/maintenance" element={<MaintenancePage />} />
              <Route path="/admin" element={protectedPage(<Overview />)} />
              {adminRoutes.map(([path, Component]) => (
                <Route
                  key={path}
                  path={`/admin/${path}`}
                  element={protectedPage(<Component />)}
                />
              ))}
              <Route path="/admin/forms" element={protectedPage(<Forms />)} />
              <Route
                path="/admin/forms/:formId/edit"
                element={protectedPage(<FormBuilder />)}
              />
              <Route
                path="/admin/forms/:formId/responses"
                element={protectedPage(<FormResponses />)}
              />
              <Route path="/admin/invite/:token" element={<AcceptInvite />} />
              <Route
                path="/admin/blog-comments"
                element={
                  <Navigate to="/admin/blog?collection=comments" replace />
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </Frame>
      </SiteStatusRedirect>
    </NavigationSafety>
  );
}
const router = createBrowserRouter(
  [{ path: "*", element: <RoutedApplication /> }],
  { future: { v7_relativeSplatPath: true } },
);
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminProvider>
        <ContentProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <RouterProvider
              router={router}
              future={{ v7_startTransition: true }}
            />
          </TooltipProvider>
        </ContentProvider>
      </AdminProvider>
    </QueryClientProvider>
  );
}
