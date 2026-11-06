const actor = { id: "f1560000-0000-4000-8000-000000000001" };

export function financeFixture() {
  const id = "f1560000-0000-4000-8000-000000000002",
    budgetId = "f1560000-0000-4000-8000-000000000003",
    fileId = "f1560000-0000-4000-8000-000000000004",
    base = "/admin/finances",
    path = base + "/" + id;
  const cap = {
    actorId: actor.id,
    globalAdmin: true,
    canCreate: true,
    teams: [],
    fundingReferences: [],
    fundingNotice: "Fictional funding reference",
  };
  const record = {
    id,
    reference: "FIN-FICTIONAL-001",
    transactionType: "expense",
    category: "Event Costs",
    amount: "12.34",
    currency: "USD",
    description: "Fictional event supplies",
    vendorName: "Fictional vendor",
    referenceNumber: "",
    transactionDate: "2026-10-27",
    teamId: null,
    teamName: null,
    budgetId: null,
    budgetName: null,
    eventId: null,
    projectId: null,
    recurringFrequency: null,
    requiresTeamApproval: false,
    status: "draft",
    revision: 1,
    createdBy: actor.id,
    creatorName: "Fictional officer",
    approverName: null,
    teamApproverName: null,
    submittedBy: null,
    submittedAt: null,
    createdAt: "2026-10-27T12:00:00Z",
    updatedAt: "2026-10-27T12:00:00Z",
    rejectionReason: null,
    actions: ["update", "submit", "note"],
  };
  const budget = {
    id: budgetId,
    name: "Fictional allocation",
    description: "Fictional planning allocation",
    totalAmount: "100.00",
    teamId: null,
    teamName: null,
    fiscalYear: "2026",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    status: "draft",
    revision: 1,
    usage: { spent: "0.00", reserved: "0.00" },
    canManage: true,
  };
  const listing = {
    items: [record],
    total: 1,
    pageSize: 30,
    stateCounts: { draft: 1 },
    summary: {
      completedIncome: "0.00",
      completedExpenses: "0.00",
      reservedExpenses: "0.00",
      awaitingApproval: 0,
      net: "0.00",
    },
  };
  const detail = {
    record,
    decisions: [],
    notes: [],
    noteTotal: 0,
    notePageSize: 30,
    retention: "Fictional retained ledger",
  };
  const files = {
    items: [],
    total: 0,
    pageSize: 30,
    canUpload: true,
    revision: 1,
  };
  const cleanFile = {
    id: fileId,
    filename: "Fictional receipt.pdf",
    mime: "application/pdf",
    bytes: 12,
    state: "clean",
    uploaderName: "Fictional officer",
    createdAt: "2026-10-27T12:00:00Z",
  };
  function response(p: string) {
    return p.endsWith("/capabilities")
      ? cap
      : p.includes("/attachments")
        ? files
        : p.startsWith("/admin/budgets")
          ? { items: [budget], total: 1, pageSize: 30 }
          : p.startsWith(base + "/report")
            ? { months: [], categories: [], note: "Fictional report" }
            : p.startsWith(base + "?")
              ? listing
              : detail;
  }
  return { id, record, budget, response };
}

export function mediaFixture() {
  const id = "f1570000-0000-4000-8000-000000000002",
    folderId = "f1570000-0000-4000-8000-000000000003",
    uploadId = "f1570000-0000-4000-8000-000000000004";
  const file = {
    id,
    name: "Fictional community photo",
    originalName: "fictional-photo.png",
    fileType: "image",
    mime: "image/png",
    bytes: 12,
    revision: 1,
    teamId: null,
    folderId: null,
    scanState: "clean",
    deletedAt: null,
    purgedAt: null,
    starred: false,
    public: false,
    alt: "Fictional students at laptops",
    description: "Fictional photo caption",
    seoTitle: "",
    seoDescription: "",
    tags: [],
    eventId: null,
    order: 0,
    allowDownload: false,
    width: 40,
    height: 25,
    duration: null,
    inUse: false,
    usageCount: 0,
    publicationState: null,
    actions: ["read", "update", "delete"],
    canPublish: true,
    createdAt: "2026-10-27T12:00:00Z",
    updatedAt: "2026-10-27T12:00:00Z",
  };
  const folder = {
    id: folderId,
    name: "Fictional folder",
    parentId: null,
    teamId: null,
    revision: 1,
    description: "Fictional folder description",
  };
  const listing = {
    items: [file],
    total: 1,
    page: 1,
    pageSize: 30,
    folders: [folder],
    folder: null,
    folderId: null,
    teams: [],
    chapterCreate: true,
    chapterFolders: true,
  };
  function response(path: string) {
    return path.startsWith("/admin/media/events") ? { items: [] } : listing;
  }
  return { id, file, listing, response };
}

export function projectFixture() {
  const id = "f1580000-0000-4000-8000-000000000002",
    memberId = "f1580000-0000-4000-8000-000000000003",
    otherId = "f1580000-0000-4000-8000-000000000004",
    base = "/admin/projects",
    path = base + "/" + id;
  const project = {
    id,
    title: "Fictional private project",
    description: "Fictional project context",
    short_description: "Fictional short description",
    image_url: "",
    github_url: "https://github.com/example/project",
    demo_url: "",
    tech_stack: ["TypeScript"],
    tags: ["fictional"],
    category: "web",
    status: "active",
    difficulty_level: "intermediate",
    team_size: 3,
    start_date: "",
    end_date: "",
    is_featured: false,
    is_open_source: true,
    team_id: null,
    teamName: null,
    revision: 1,
    deleted_at: null,
    stars_count: 0,
    starCount: "0",
    actions: ["read", "update", "delete"],
    memberCount: 1,
  };
  const member = {
    id: memberId,
    memberId: otherId,
    name: "Fictional participant",
    role: "contributor",
    active: true,
    communityActive: true,
    joinedAt: "2026-10-27T12:00:00Z",
  };
  const detail = { project, members: [member], memberTotal: 1, pageSize: 30 },
    listing = {
      items: [project],
      total: 1,
      pageSize: 30,
      stats: {
        active: 1,
        completed: 0,
        featured: 0,
        categories: { web: 1 },
        statuses: { active: 1 },
        technologies: { TypeScript: 1 },
      },
    },
    cap = { globalCreate: true, teams: [] };
  function response(p: string) {
    return p.endsWith("/capabilities")
      ? cap
      : p.startsWith(base + "?")
        ? listing
        : detail;
  }
  return { id, project, response };
}

export function linktreeFixture() {
  const id = "f1490000-0000-4000-8000-000000000001",
    second = "f1490000-0000-4000-8000-000000000002";
  const profile = (recordId = id) => ({
    id: recordId,
    username: recordId === id ? "fictional-hub" : "fictional-second",
    displayName:
      recordId === id ? "Fictional first hub" : "Fictional second hub",
    bio: "Fictional chapter links",
    avatarUrl: "",
    background: { type: "color", value: "#f8d8c6" },
    theme: "light",
    active: false,
    deletedAt: null,
    teamId: null,
    teamName: null,
    revision: 1,
    actions: ["read", "create", "update", "publish", "delete"],
  });
  const detail = (recordId = id) => ({
    profile: profile(recordId),
    links: [],
    linkTotal: 0,
    linkPageSize: 30,
  });
  const report = {
    views: "17",
    clicks: "6",
    lifetimeViews: "17",
    days: [],
    links: [],
    note: "Fictional aggregate note",
  };
  const response = (path: string) =>
    path.endsWith("/capabilities")
      ? { globalCreate: true, teams: [] }
      : path.startsWith("/admin/linktree/analytics")
        ? report
        : /\/profiles\//.test(path)
          ? detail()
          : { items: [profile()], total: 1, pageSize: 30 };
  return { id, profile, detail, response };
}

export function newsletterFixture() {
  const id = "f1600000-0000-4000-8000-000000000002",
    base = "/admin/newsletter",
    path = base + "/campaigns/" + id;
  const record = {
    id,
    teamId: null,
    revision: 1,
    actions: ["read", "update", "create", "delete", "send_email"],
    deletedAt: null,
    subject: "Fictional campaign",
    content: "Fictional newsletter text",
    status: "draft",
    audience: "all",
    createdAt: "2026-10-27T12:00:00Z",
    updatedAt: "2026-10-27T12:00:00Z",
  };
  const subscriber = {
    ...record,
    email: "fictional-subscriber@example.test",
    state: "active",
    subject: undefined,
    status: undefined,
  };
  const cap = {
      chapterRead: true,
      chapterCreate: true,
      chapterSend: true,
      teams: [],
    },
    listing = { items: [record], total: 1, page: 1, pageSize: 50 };
  const response = (path: string) =>
    path.endsWith("/capabilities")
      ? cap
      : path.includes("/campaigns/")
        ? { record }
        : path.includes("/subscribers")
          ? { ...listing, items: [subscriber] }
          : listing;
  return { id, record, response };
}
