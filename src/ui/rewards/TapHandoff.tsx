import { useEffect } from "react";
import { Brand } from "../primitives";
import "./rewards.css";
/** A casual tap is public navigation, never proof of the physical chip or member sign-in. */
export default function TapHandoff() {
  useEffect(() => {
    window.history.replaceState(window.history.state,"",window.location.pathname);
    window.location.replace("https://leaderboards.gdggt.dev/");
  },[]);
  return <div className="rewards-public"><header className="rewards-public-header"><Brand compact /></header><main className="rewards-public-main"><h1>GDG membership</h1><p>Opening the member leaderboard…</p><a className="gt-button gt-button-primary" href="https://leaderboards.gdggt.dev/">Open leaderboard</a></main></div>;
}
