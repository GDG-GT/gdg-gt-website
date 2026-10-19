import React from "react";
import type { LucideIcon } from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  actions?: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({
  children,
  title,
  subtitle,
  icon: Icon,
  actions,
}) => {
  return (
    <div className="gt-admin-page">
      <div>
        {/* Header */}
        <div className="gt-admin-page-heading">
          {/* Back Button */}
          {/* Page Header */}
          <div className="gt-admin-heading-inner">
            <div>
              <p className="gt-breadcrumb">Chapter workspace</p>
              <div>
                <h1 className="text-3xl font-bold text-foreground">{title}</h1>
                {subtitle && (
                  <p className="text-muted-foreground mt-1">{subtitle}</p>
                )}
              </div>
            </div>

            {actions && (
              <div className="flex items-center space-x-3">{actions}</div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
};

export default AdminLayout;
