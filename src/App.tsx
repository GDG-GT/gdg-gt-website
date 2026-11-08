import {
  PublicBootstrapContext,
  type PublicBootstrap,
} from "@/contexts/PublicBootstrapContext";
import { lazy, Suspense, type ReactNode } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AdminProvider } from "@/contexts/AdminContext";
import { ContentProvider } from "@/contexts/ContentContext";
import PageAccessGuard from "@/components/admin/PageAccessGuard";
import SiteStatusRedirect from "@/components/SiteStatusRedirect";
import SiteShell from "@/ui/SiteShell";
import RouteErrorBoundary from "@/ui/RouteErrorBoundary";
import NavigationSafety from "@/ui/NavigationSafety";
import CapabilityBoundary from "@/ui/CapabilityBoundary";
import RouteFocus from "@/ui/RouteFocus";
import { PwaUpdateNotice } from "@/pwa/PwaControls";
import { QueueRuntime } from "@/pwa/SubmissionQueue";
import { MaintenancePage } from "@/ui/status/SiteAvailability";
import { HomePage } from "@/ui/HomePage";
import { rewardsPagePaths } from "../shared/rewards-pages.mjs";

const Leaderboard = lazy(() => import("@/ui/rewards/Leaderboard"));
const TapHandoff = lazy(() => import("@/ui/rewards/TapHandoff"));
const AdminShell = lazy(() => import("@/ui/AdminShell"));
const loadPublicPages = () => import("@/ui/PublicPages");
// Start the selected public route while availability is checked, instead of
// discovering its chunk only after that read completes. Forms/admin stay lazy.
if (
  typeof window !== "undefined" &&
  /^\/(?:events(?:\/|$)|team$|resources$|sponsors$|gallery$|contact$|privacy$|accessibility$|offline$)/.test(
    window.location.pathname,
  )
)
  void loadPublicPages().catch(() => {});
const EventsPage = lazy(() =>
  import("@/ui/PublicPages").then((m) => ({ default: m.EventsPage })),
);
const EventDetailPage = lazy(() =>
  import("@/ui/PublicPages").then((m) => ({ default: m.EventDetailPage })),
);
const TeamPage = lazy(() =>
  import("@/ui/PublicPages").then((m) => ({ default: m.TeamPage })),
);
const ResourcesPage = lazy(() =>
  import("@/ui/PublicPages").then((m) => ({ default: m.ResourcesPage })),
);
const SponsorsPage = lazy(() =>
  import("@/ui/PublicPages").then((m) => ({ default: m.SponsorsPage })),
);
const GalleryPage = lazy(() =>
  import("@/ui/PublicPages").then((m) => ({ default: m.GalleryPage })),
);
const ContactPage = lazy(() =>
  import("@/ui/PublicPages").then((m) => ({ default: m.ContactPage })),
);
const NotFoundPage = lazy(() =>
  import("@/ui/PublicPages").then((m) => ({ default: m.NotFoundPage })),
);
const InfoPage = lazy(() =>
  import("@/ui/PublicPages").then((m) => ({ default: m.InfoPage })),
);

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
  ["rewards", lazy(() => import("@/ui/rewards/RewardsWorkspace"))],
  ["content", lazy(() => import("@/ui/content/SiteContentWorkspace"))],
  ["content/team", lazy(() => import("@/ui/content/SiteContentWorkspace"))],
  ["events", lazy(() => import("@/ui/EventWorkspace"))],
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
function LoadingPage() {
  return (
    <div
      className="gt-container gt-route-loading gt-initial-route-loading"
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
  const { pathname, search } = useLocation();
  if (
    pathname === "/admin/content" &&
    new URLSearchParams(search).get("mode") === "preview"
  )
    return <RouteErrorBoundary>{children}</RouteErrorBoundary>;
  return pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/invite/") ? (
    <RouteErrorBoundary key="workspace">
      <Suspense fallback={<LoadingPage />}>
        <AdminShell>
          <RouteErrorBoundary key={pathname}>{children}</RouteErrorBoundary>
        </AdminShell>
      </Suspense>
    </RouteErrorBoundary>
  ) : (
    <RouteErrorBoundary key="public">
      <SiteShell>
        <RouteErrorBoundary key={pathname}>{children}</RouteErrorBoundary>
      </SiteShell>
    </RouteErrorBoundary>
  );
}
function protectedPage(children: ReactNode) {
  return <PageAccessGuard>{children}</PageAccessGuard>;
}
export function RoutedApplication() {
  const rewardsPages = rewardsPagePaths(
    typeof window === "undefined" ? "" : window.location.hostname,
  );
  return (
    <NavigationSafety>
      <RouteFocus />
      <PwaUpdateNotice />
      <QueueRuntime />
      <SiteStatusRedirect>
        <Frame>
          <Suspense fallback={<LoadingPage />}>
            <Routes>
              <Route
                path="/"
                element={
                  rewardsPages?.home === "/" ? <Leaderboard /> : <HomePage />
                }
              />
              <Route path="/events" element={<EventsPage />} />
              <Route
                path="/events/:slug"
                element={
                  <CapabilityBoundary names={["reminder"]}>
                    <EventDetailPage />
                  </CapabilityBoundary>
                }
              />
              <Route path="/team" element={<TeamPage />} />
              <Route
                path="/team/join"
                element={
                  <CapabilityBoundary names={["invite"]}>
                    <AcceptInvite />
                  </CapabilityBoundary>
                }
              />
              {rewardsPages && (
                <>
                  {rewardsPages.home !== "/" && (
                    <Route path={rewardsPages.home} element={<Leaderboard />} />
                  )}
                  <Route path={rewardsPages.member} element={<Leaderboard />} />
                  {rewardsPages.home === "/" && (
                    <>
                      <Route
                        path="/leaderboard"
                        element={<Navigate to="/" replace />}
                      />
                      <Route
                        path="/leaderboard/member"
                        element={<Navigate to="/member" replace />}
                      />
                    </>
                  )}
                </>
              )}
              <Route path="/tap" element={<TapHandoff />} />
              <Route path="/resources" element={<ResourcesPage />} />
              <Route path="/sponsors" element={<SponsorsPage />} />
              <Route path="/gallery" element={<GalleryPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/forms/:slug" element={<PublicForm />} />
              <Route
                path="/account/setup"
                element={
                  <CapabilityBoundary names={["token"]}>
                    <AccountSetup />
                  </CapabilityBoundary>
                }
              />
              <Route path="/l/:username" element={<Linktree />} />
              <Route path="/links" element={<Linktree />} />
              <Route
                path="/newsletter/confirm"
                element={
                  <CapabilityBoundary names={["token"]} allowQuery>
                    <NewsletterTokenPage kind="confirm" />
                  </CapabilityBoundary>
                }
              />
              <Route
                path="/newsletter/unsubscribe"
                element={
                  <CapabilityBoundary names={["token"]} allowQuery>
                    <NewsletterTokenPage kind="unsubscribe" />
                  </CapabilityBoundary>
                }
              />
              <Route path="/privacy" element={<InfoPage kind="privacy" />} />
              <Route
                path="/accessibility"
                element={<InfoPage kind="accessibility" />}
              />
              <Route path="/offline" element={<InfoPage kind="offline" />} />
              <Route path="/maintenance" element={<MaintenancePage />} />
              <Route path="/admin" element={protectedPage(<Overview />)} />
              <Route
                path="/admin/team"
                element={<Navigate to="/admin/content/team" replace />}
              />
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
const router = import.meta.env.SSR
  ? null
  : createBrowserRouter([{ path: "*", element: <RoutedApplication /> }], {});
export default function App({
  routerView,
  bootstrap,
}: {
  routerView?: ReactNode;
  bootstrap?: PublicBootstrap;
}) {
  return (
    <PublicBootstrapContext.Provider value={bootstrap}>
      <AdminProvider deferSession={!!bootstrap}>
        <ContentProvider initial={bootstrap?.home}>
          {routerView ||
            (router && (
              // Show the destination's loading state as soon as the URL changes.
              <RouterProvider router={router} useTransitions={false} />
            ))}
        </ContentProvider>
      </AdminProvider>
    </PublicBootstrapContext.Provider>
  );
}
