import { NotificationInbox } from "@/components/admin/NotificationBell";
import NotificationSettings from "./notifications/NotificationSettings";
export default function NotificationWorkspace() {
  return <div className="gt-admin-page"><header className="gt-admin-heading"><h1>Notifications</h1></header><NotificationSettings /><NotificationInbox /></div>;
}
