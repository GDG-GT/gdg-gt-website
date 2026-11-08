export const publicRewardsOrigin = "https://leaderboards.gdggt.dev";

// The chapter website and the member site share code, not public page routes.
export function rewardsPagePaths(hostname) {
  if (hostname === new URL(publicRewardsOrigin).hostname)
    return { home: "/", member: "/member" };
  if (["localhost", "127.0.0.1", "[::1]"].includes(hostname))
    return { home: "/leaderboard", member: "/leaderboard/member" };
  return null;
}
