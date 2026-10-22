import { useAdmin } from "@/contexts/AdminContext";
import { ActionLink } from "../primitives";
export default function ContactInboxLink() {
  const { currentAdmin } = useAdmin();
  return ["admin", "super_admin"].includes(currentAdmin?.role) ? (
    <ActionLink to="/admin/communications?tab=contact" variant="ghost">
      Contact inbox
    </ActionLink>
  ) : null;
}
