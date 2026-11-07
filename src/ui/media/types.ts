export type MediaFile = {
  id: string;
  name: string;
  originalName: string;
  fileType: string;
  mime: string;
  bytes: number;
  revision: number;
  teamId: string | null;
  folderId: string | null;
  scanState: string;
  deletedAt: string | null;
  purgedAt: string | null;
  starred: boolean;
  public: boolean;
  alt: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  tags: string[];
  eventId: string | null;
  order: number;
  allowDownload: boolean;
  width: number | null;
  height: number | null;
  duration: number | null;
  inUse: boolean;
  usageCount: number;
  publicationState: string | null;
  actions: string[];
  canPublish: boolean;
  createdAt: string;
  updatedAt: string;
};
export type MediaFolder = {
  id: string;
  name: string;
  parentId: string | null;
  teamId: string | null;
  revision: number;
  description?: string;
};
export type MediaListing = {
  items: MediaFile[];
  total: number;
  nextCursor?: string | null;
  pageSize: number;
  folders: MediaFolder[];
  folderId: string | null;
  folder: MediaFolder | null;
  teams: {
    id: string;
    name: string;
    canCreate: boolean;
    canManageFolders?: boolean;
  }[];
  chapterCreate: boolean;
  chapterFolders?: boolean;
};
export const humanBytes = (bytes: number) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MiB`
    : `${(bytes / 1024).toFixed(1)} KiB`;
