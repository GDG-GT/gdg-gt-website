import { Fragment, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { capabilitySignature } from '../../shared/capability-navigation';
export default function CapabilityBoundary({ names, allowQuery = false, previewSensitive = false, children }: {
  names: readonly string[]; allowQuery?: boolean; previewSensitive?: boolean; children: ReactNode;
}) {
  const location = useLocation(), incoming = capabilitySignature(location,names,allowQuery);
  const preview = previewSensitive && new URLSearchParams(location.search).get('preview') === '1';
  const held = useRef<{ path: string; signature?: string; preview: boolean; key: string }>();
  if (!held.current || held.current.path !== location.pathname || held.current.preview !== preview ||
      (incoming !== undefined && incoming !== held.current.signature))
    held.current = { path:location.pathname, signature:incoming, preview, key:crypto.randomUUID() };
  // Stripping/ordinary anchor navigation must not discard an active capability.
  // A genuine replacement or preview transition remounts all private form state.
  return <Fragment key={held.current.key}>{children}</Fragment>;
}
