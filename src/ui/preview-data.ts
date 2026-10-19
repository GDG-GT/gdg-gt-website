/// <reference types="vite/client" />
export const localPreviewEnabled =
  !!import.meta.env?.DEV && import.meta.env?.VITE_LOCAL_UI === "true";

export const chapterName =
  "Google Developer Group on Campus at Georgia Institute of Technology";
export const publicLinks = [
  ["Home", "/"],
  ["Events", "/events"],
  ["Team", "/team"],
  ["Gallery", "/gallery"],
  ["Resources", "/resources"],
  ["Sponsors", "/sponsors"],
  ["Contact", "/contact"],
] as const;

// Dates and venues come from PRD v1.5. Photos are illustrative, not event records.
export const previewEvents = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    slug: "build-with-gemini-and-ai-studio",
    title: "Build with Gemini and AI Studio",
    description:
      "An introduction to building with Gemini and Google AI Studio. Learn alongside the Georgia Tech developer community.",
    date: "2026-10-15T18:00:00-04:00",
    end_at: "2026-10-15T20:00:00-04:00",
    time: "6:00 PM – 8:00 PM",
    location: "Klaus Advanced Computing Building",
    image_url: "/assets/event-workshop.jpg",
    type: "Workshop",
    level: "beginner",
    registration_enabled: true,
    registration_type: "internal",
    publication_status: "published",
    is_featured: true,
    timezone: "America/New_York",
    created_at: "2026-10-01T12:00:00Z",
    updated_at: "2026-10-01T12:00:00Z",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    slug: "georgia-311-hackathon",
    title: "Georgia 311 Hackathon",
    description:
      "Bring your curiosity, meet fellow builders, and explore how technology can make a difference in our communities.",
    date: "2026-10-23T17:00:00-04:00",
    time: "Starts 5:00 PM · Oct 23–24",
    location: "",
    image_url: "/assets/event-hackathon.jpg",
    type: "Hackathon",
    level: "open_for_all",
    registration_enabled: true,
    registration_type: "internal",
    publication_status: "published",
    is_featured: true,
    timezone: "America/New_York",
    created_at: "2026-10-02T12:00:00Z",
    updated_at: "2026-10-02T12:00:00Z",
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    slug: "georgia-311-challenge-demo-day",
    title: "Georgia 311 Challenge Demo Day",
    description:
      "A chance to share what has been built, discover fresh ideas, and connect with a community working on meaningful challenges.",
    date: "2026-10-30T00:00:00-04:00",
    time: "Time to be announced",
    location: "Morehouse College",
    image_url: "/assets/event-community.jpg",
    type: "Demo day",
    level: "open_for_all",
    registration_enabled: true,
    registration_type: "internal",
    publication_status: "published",
    is_featured: true,
    timezone: "America/New_York",
    created_at: "2026-10-03T12:00:00Z",
    updated_at: "2026-10-03T12:00:00Z",
  },
];

export const previewResources = [
  {
    id: "resource-1",
    title: "Build your first Gemini experience",
    description:
      "Explore prompts, prototype ideas, and get familiar with the Gemini API in Google AI Studio.",
    type: "documentation",
    level: "beginner",
    url: "https://aistudio.google.com/",
    tags: ["AI", "Gemini"],
    is_active: true,
    status: "available",
    featured: true,
  },
  {
    id: "resource-2",
    title: "Google Cloud Skills Boost",
    description:
      "Hands-on labs and learning paths for cloud fundamentals, infrastructure, and machine learning.",
    type: "study_jam",
    level: "beginner",
    url: "https://www.cloudskillsboost.google/",
    tags: ["Cloud", "Learning"],
    is_active: true,
    status: "available",
  },
  {
    id: "resource-3",
    title: "Web development, explained",
    description:
      "Practical guidance for building accessible, fast, and dependable experiences for the web.",
    type: "documentation",
    level: "beginner",
    url: "https://web.dev/learn",
    tags: ["Web", "Accessibility"],
    is_active: true,
    status: "available",
  },
  {
    id: "resource-4",
    title: "Explore Google for Developers",
    description:
      "Documentation, tools, and community resources for your next project.",
    type: "documentation",
    level: "open_for_all",
    url: "https://developers.google.com/",
    tags: ["Tools", "Development"],
    is_active: true,
    status: "available",
  },
];
